"""The graph API end to end (master spec §14, §14.1, §29).

Traceability: ``INT-GRAPH-001`` (money trail), ``INT-GRAPH-002`` (artefact
linkage) — exercised here through HTTP rather than through the domain functions.

``tests/integration/test_trail_reconstruction.py`` and
``tests/leakage/test_trail_point_in_time.py`` already prove that
``reconstruct_trail`` walks correctly and does not read the future. These tests
exist to prove something different and equally easy to get wrong: that the
*endpoint* passes the whole query through and hands back the whole answer.

The realistic defect at this layer is not a wrong traversal. It is a handler that
quietly drops a parameter — a ``min_amount`` that never reaches the query, an
``as_of`` defaulted to now when the caller omitted one — leaving a walk that is
correct and an answer to a question nobody asked. Each traversal test below
therefore asserts on a bound that only holds if the parameter actually arrived.

Every row is created here and is synthetic
(``PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md``). Nothing below describes a real
complaint, person, account or institution.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pyotp
import pytest
from atlas.app import create_app
from atlas.core.enums import (
    CashOutChannel,
    EdgeType,
    JurisdictionLevel,
    NodeKind,
    Role,
)
from atlas.iam import mfa, passwords
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio

PASSWORD = "a-sufficiently-long-test-password"

DAY0 = datetime(2026, 4, 6, 9, 0, tzinfo=UTC)
FAR_FUTURE = datetime(2026, 12, 31, tzinfo=UTC)

TRAIL = "/api/v1/graph/trail"
NEIGHBOURHOOD = "/api/v1/graph/neighbourhood"


# --------------------------------------------------------------------------
# Fixtures
#
# Everything the API must see is committed rather than left in the fixture's
# transaction: the app runs in its own session and would otherwise walk an empty
# graph and report — correctly, and uselessly — that no money moved.
# --------------------------------------------------------------------------


@pytest.fixture
def client() -> Iterator[TestClient]:
    """A client with its own source address.

    ``TestClient`` reports the same source address for every instance by
    default, and the rate limiter keys unauthenticated requests on that address
    (§35.1). One address for a whole module means the last tests in it fail on a
    budget the earlier ones spent — a 429 that reads as a broken endpoint and is
    not, and which lands on whichever test happens to run last rather than on
    the one that caused it.

    So each test gets its own address, because each test *is* a distinct caller.
    The limiter is untouched and still enforced per caller; what changes is that
    the suite stops pretending to be one.
    """
    with TestClient(
        create_app(),
        raise_server_exceptions=False,
        client=(f"test-{uuid.uuid4().hex[:12]}", 50000),
    ) as c:
        yield c


class Officer:
    """A committed investigator, and the credentials to act as one."""

    def __init__(self, username: str, secret: str, jurisdiction_id: uuid.UUID) -> None:
        self.username = username
        self.secret = secret
        self.jurisdiction_id = jurisdiction_id

    def auth(self, client: TestClient) -> dict[str, str]:
        response = client.post(
            "/api/v1/auth/login",
            json={
                "username": self.username,
                "password": PASSWORD,
                "totp_code": pyotp.TOTP(self.secret).now(),
            },
        )
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def _make_officer(session: AsyncSession, role: Role) -> Officer:
    from atlas.iam.models import Investigator, Jurisdiction

    jurisdiction = Jurisdiction(
        code=f"T-{uuid.uuid4().hex[:8]}",
        name="Test District",
        level=JurisdictionLevel.DISTRICT,
    )
    session.add(jurisdiction)
    await session.flush()

    username = f"officer-{uuid.uuid4().hex[:8]}"
    secret = mfa.generate_secret()
    session.add(
        Investigator(
            username=username,
            display_name="Test Officer",
            password_hash=passwords.hash_password(PASSWORD),
            mfa_secret=secret,
            mfa_enrolled=True,
            role=role,
            jurisdiction_id=jurisdiction.id,
        )
    )
    await session.commit()
    return Officer(username, secret, jurisdiction.id)


async def _drop_officer(session: AsyncSession, officer: Officer) -> None:
    await session.execute(
        text("DELETE FROM iam.investigator WHERE username = :u"),
        {"u": officer.username},
    )
    await session.execute(
        text("DELETE FROM iam.jurisdiction WHERE id = :j"),
        {"j": officer.jurisdiction_id},
    )
    await session.commit()


@pytest.fixture
async def officer(session: AsyncSession) -> AsyncIterator[Officer]:
    """A district investigator — a role that holds ``evidence:read``."""
    made = await _make_officer(session, Role.DISTRICT_INVESTIGATOR)
    yield made
    await _drop_officer(session, made)


@pytest.fixture
async def read_only_officer(session: AsyncSession) -> AsyncIterator[Officer]:
    """A role that authenticates fine and does not hold ``evidence:read``."""
    made = await _make_officer(session, Role.READ_ONLY_ANALYST)
    yield made
    await _drop_officer(session, made)


class Graph:
    """Builder for a committed synthetic graph, cleaned up afterwards.

    Entities are deleted at teardown and their edges go with them
    (``ON DELETE CASCADE``). Artefact links carry no foreign key — deliberately,
    see ``ArtefactLink`` — so they are tracked and deleted by id.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._entities: list[uuid.UUID] = []
        self._links: list[uuid.UUID] = []

    async def entity(self, kind: str = "ACCOUNT") -> uuid.UUID:
        entity_id = uuid.uuid4()
        await self._session.execute(
            text(
                "INSERT INTO entity.canonical_entity "
                "(id, public_ref, kind, attributes, observed_at, source_system, "
                " classification) "
                "VALUES (:id, :ref, :kind, '{}'::jsonb, :obs, 'test', 'SENSITIVE')"
            ),
            {"id": entity_id, "ref": uuid.uuid4().hex[:16], "kind": kind, "obs": DAY0},
        )
        self._entities.append(entity_id)
        return entity_id

    async def edge(
        self,
        frm: uuid.UUID,
        to: uuid.UUID,
        *,
        occurred_at: datetime,
        observed_at: datetime | None = None,
        amount: str = "100000.00",
        edge_type: EdgeType = EdgeType.TRANSFERRED_TO,
        channel: CashOutChannel | None = None,
    ) -> uuid.UUID:
        edge_id = uuid.uuid4()
        await self._session.execute(
            text(
                "INSERT INTO graph.transaction_edge "
                "(id, from_entity_id, to_entity_id, edge_type, amount, currency, "
                " occurred_at, channel, rail, observed_at, source_system, "
                " source_record_id, classification, is_synthetic) "
                "VALUES (:id, :frm, :to, CAST(:etype AS graph.edge_type), :amt, 'INR', "
                " :occ, CAST(:chan AS geo.cash_out_channel), 'IMPS', :obs, 'test', "
                " :srec, 'SENSITIVE', true)"
            ),
            {
                "id": edge_id,
                "frm": frm,
                "to": to,
                "etype": edge_type.value,
                "amt": Decimal(amount),
                "occ": occurred_at,
                "chan": channel.value if channel else None,
                "obs": observed_at or occurred_at,
                "srec": edge_id.hex,
            },
        )
        return edge_id

    async def artefact_link(
        self,
        *,
        source_kind: NodeKind,
        source_id: uuid.UUID,
        target_kind: NodeKind,
        target_id: uuid.UUID,
        edge_type: EdgeType,
        source_jurisdiction: uuid.UUID | None,
        target_jurisdiction: uuid.UUID | None,
        observed_at: datetime = DAY0,
        basis: str = "both reached the same BC agent within 90 minutes",
    ) -> uuid.UUID:
        link_id = uuid.uuid4()
        await self._session.execute(
            text(
                "INSERT INTO graph.artefact_link "
                "(id, source_kind, source_id, target_kind, target_id, edge_type, "
                " source_jurisdiction_id, target_jurisdiction_id, basis, observed_at, "
                " source_system, source_record_id, classification, is_synthetic) "
                "VALUES (:id, CAST(:sk AS graph.node_kind), :sid, "
                " CAST(:tk AS graph.node_kind), :tid, CAST(:et AS graph.edge_type), "
                " :sj, :tj, :basis, :obs, 'test', :srec, 'SENSITIVE', true)"
            ),
            {
                "id": link_id,
                "sk": source_kind.value,
                "sid": source_id,
                "tk": target_kind.value,
                "tid": target_id,
                "et": edge_type.value,
                "sj": source_jurisdiction,
                "tj": target_jurisdiction,
                "basis": basis,
                "obs": observed_at,
                "srec": link_id.hex,
            },
        )
        self._links.append(link_id)
        return link_id

    async def commit(self) -> None:
        await self._session.commit()

    async def cleanup(self) -> None:
        if self._links:
            await self._session.execute(
                text("DELETE FROM graph.artefact_link WHERE id = ANY(:ids)"),
                {"ids": self._links},
            )
        if self._entities:
            await self._session.execute(
                text("DELETE FROM entity.canonical_entity WHERE id = ANY(:ids)"),
                {"ids": self._entities},
            )
        await self._session.commit()


@pytest.fixture
async def graph(session: AsyncSession) -> AsyncIterator[Graph]:
    builder = Graph(session)
    yield builder
    await builder.cleanup()


async def _chain(graph: Graph, length: int) -> list[uuid.UUID]:
    """A straight chain of transfers, one hour apart."""
    ids = [await graph.entity() for _ in range(length + 1)]
    for i in range(length):
        await graph.edge(ids[i], ids[i + 1], occurred_at=DAY0 + timedelta(hours=i))
    return ids


def _params(**overrides: object) -> dict[str, object]:
    return {"as_of": FAR_FUTURE.isoformat(), **overrides}


# --------------------------------------------------------------------------
# Authentication and authorization
#
# §29: every sensitive decision is enforced server-side. The frontend is never
# trusted to make one, so none of these depend on a client sending less.
# --------------------------------------------------------------------------


async def test_trail_requires_a_token(client: TestClient) -> None:
    response = client.get(f"{TRAIL}/{uuid.uuid4()}", params=_params())
    assert response.status_code == 401


async def test_neighbourhood_requires_a_token(client: TestClient) -> None:
    response = client.get(
        f"{NEIGHBOURHOOD}/{NodeKind.COMPLAINT.value}/{uuid.uuid4()}", params=_params()
    )
    assert response.status_code == 401


async def test_a_garbage_token_is_rejected(client: TestClient) -> None:
    response = client.get(
        f"{TRAIL}/{uuid.uuid4()}",
        params=_params(),
        headers={"Authorization": "Bearer not-a-jwt"},
    )
    assert response.status_code == 401


async def test_a_role_without_evidence_read_gets_404_not_403(
    client: TestClient, read_only_officer: Officer
) -> None:
    """404, deliberately.

    A 403 would tell the caller the endpoint had something to refuse them, which
    is a step towards using it as an oracle. The real reason goes to the audit
    log — see the test below — and never into the response.
    """
    response = client.get(
        f"{TRAIL}/{uuid.uuid4()}",
        params=_params(),
        headers=read_only_officer.auth(client),
    )
    assert response.status_code == 404
    assert response.json()["error"] == "not_found"


@pytest.mark.parametrize("endpoint", ["trail", "neighbourhood"])
async def test_a_denied_read_is_audited_with_the_real_reason(
    client: TestClient,
    read_only_officer: Officer,
    session: AsyncSession,
    endpoint: str,
) -> None:
    """The 404 is a deliberate lie; this is where the truth is written down.

    Without the record a refusal is invisible everywhere — and a *run* of them,
    which is what someone probing the graph looks like from the inside, would
    leave no trace at all.

    Both endpoints share the dependency that writes it, and both are checked,
    because "shared" is an implementation detail that a later refactor can undo
    silently.
    """
    path = (
        f"{TRAIL}/{uuid.uuid4()}"
        if endpoint == "trail"
        else f"{NEIGHBOURHOOD}/{NodeKind.COMPLAINT.value}/{uuid.uuid4()}"
    )
    response = client.get(
        path, params=_params(), headers=read_only_officer.auth(client)
    )
    assert response.status_code == 404

    row = (
        await session.execute(
            text(
                "SELECT result, actor_role, detail::text FROM audit.audit_event "
                "WHERE action = 'graph.read' AND resource_id = :r "
                "ORDER BY sequence DESC LIMIT 1"
            ),
            {"r": path},
        )
    ).first()
    assert row is not None, "a denied graph read produced no audit event"
    assert row[0] == "denied"
    assert row[1] == Role.READ_ONLY_ANALYST.value
    assert "evidence:read" in row[2]


async def test_the_error_body_leaks_no_internals(
    client: TestClient, read_only_officer: Officer
) -> None:
    """No stack trace, no exception type, no SQL (master spec §36)."""
    response = client.get(
        f"{TRAIL}/{uuid.uuid4()}",
        params=_params(),
        headers=read_only_officer.auth(client),
    )
    body = response.text.lower()
    for leak in ("traceback", "sqlalchemy", "asyncpg", 'file "', "select "):
        assert leak not in body, f"response leaked {leak!r}"
    assert set(response.json()) == {"error", "message", "correlation_id"}


# --------------------------------------------------------------------------
# Traversal — the shape this project exists to reconstruct
# --------------------------------------------------------------------------


async def test_origin_to_intermediary_to_cash_out(
    client: TestClient, officer: Officer, graph: Graph
) -> None:
    """Victim → mule → BC agent, recovered whole and in the order it happened."""
    victim, mule, agent = [await graph.entity() for _ in range(3)]
    await graph.edge(victim, mule, occurred_at=DAY0, amount="500000.00")
    await graph.edge(
        mule,
        agent,
        occurred_at=DAY0 + timedelta(hours=3),
        amount="49500.00",
        edge_type=EdgeType.WITHDREW_AT,
        channel=CashOutChannel.AEPS_BC,
    )
    await graph.commit()

    response = client.get(
        f"{TRAIL}/{victim}", params=_params(), headers=officer.auth(client)
    )
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["origin_entity_id"] == str(victim)
    assert body["as_of"].startswith("2026-12-31")
    assert body["max_depth"] == 6

    assert len(body["paths"]) == 1
    path = body["paths"][0]
    assert path["reaches_cash_out"] is True
    assert path["truncated"] is False
    assert path["elapsed_seconds"] == 3 * 3600
    assert path["longest_dwell_seconds"] == 3 * 3600

    hops = path["hops"]
    assert [h["depth"] for h in hops] == [1, 2]
    assert [h["from_entity_id"] for h in hops] == [str(victim), str(mule)]
    assert hops[-1]["to_entity_id"] == str(agent)
    assert hops[-1]["edge_type"] == EdgeType.WITHDREW_AT.value
    assert hops[-1]["channel"] == CashOutChannel.AEPS_BC.value
    # A transfer between accounts has no cash-out channel, and a default would
    # invent one.
    assert hops[0]["channel"] is None


async def test_a_path_carries_no_confidence_and_no_currency(
    client: TestClient, officer: Officer, graph: Graph
) -> None:
    """Two absences that are load-bearing, asserted so they cannot drift back in.

    There is no labelled ground truth to calibrate a confidence against, and an
    uncalibrated number rendered as "confidence: 0.82" is a claim the system
    cannot support. ``TrailHop`` projects no currency either — the trail query
    does not select the column — so a ``"INR"`` here would be this layer
    inventing a fact the layer below declined to state.
    """
    a, b = await graph.entity(), await graph.entity()
    await graph.edge(a, b, occurred_at=DAY0)
    await graph.commit()

    body = client.get(
        f"{TRAIL}/{a}", params=_params(), headers=officer.auth(client)
    ).json()

    path = body["paths"][0]
    assert not {"confidence", "score", "likelihood", "risk"} & set(path)
    assert not {"currency", "observed_at"} & set(path["hops"][0])
    assert "₹" not in str(body)


async def test_amounts_are_strings_and_keep_their_scale(
    client: TestClient, officer: Officer, graph: Graph
) -> None:
    """``NUMERIC(14, 2)`` must not arrive as a float.

    A money trail is exactly where binary floating point surfaces: as sums along
    a path that no longer add up. The web wire type declares ``DecimalString``
    for this reason, so a JSON number here is a contract break rather than a
    cosmetic difference.
    """
    a, b = await graph.entity(), await graph.entity()
    await graph.edge(a, b, occurred_at=DAY0, amount="284000.10")
    await graph.commit()

    body = client.get(
        f"{TRAIL}/{a}", params=_params(), headers=officer.auth(client)
    ).json()
    amount = body["paths"][0]["hops"][0]["amount"]
    assert isinstance(amount, str)
    assert amount == "284000.10"
    assert isinstance(body["paths"][0]["retained_fraction"], str)


async def test_hops_are_ordered_by_when_the_money_moved(
    client: TestClient, officer: Officer, graph: Graph
) -> None:
    """B paid C on Monday; A paid B on Wednesday. A → B → C never happened.

    A, B and C are genuinely connected, and a plain traversal returns the chain —
    a coherent, plausible trail along which the money could not have travelled,
    because it left B two days before it arrived. The endpoint must not undo the
    constraint that excludes it.
    """
    a, b, c = [await graph.entity() for _ in range(3)]
    await graph.edge(b, c, occurred_at=DAY0)
    await graph.edge(a, b, occurred_at=DAY0 + timedelta(days=2))
    await graph.commit()

    body = client.get(
        f"{TRAIL}/{a}", params=_params(), headers=officer.auth(client)
    ).json()

    assert len(body["paths"]) == 1
    hops = body["paths"][0]["hops"]
    assert [h["to_entity_id"] for h in hops] == [str(b)], "the walk must stop at B"

    occurred = [h["occurred_at"] for h in hops]
    assert occurred == sorted(occurred), "hops must be non-decreasing in occurred_at"


async def test_an_edge_observed_after_as_of_is_invisible(
    client: TestClient, officer: Officer, graph: Graph
) -> None:
    """Leakage gate 1 at the HTTP boundary (master spec §19.1).

    A bank replies on day 10 about a transfer that happened on day 2. A
    reconstruction as of day 5 must not contain that hop, because the answer
    given on day 5 could not have contained it. Nothing errors when this is
    wrong; the trail just gets longer, and stays wrong.
    """
    a, b, c = [await graph.entity() for _ in range(3)]
    await graph.edge(a, b, occurred_at=DAY0, observed_at=DAY0)
    await graph.edge(
        b,
        c,
        occurred_at=DAY0 + timedelta(days=2),
        observed_at=DAY0 + timedelta(days=10),
    )
    await graph.commit()

    auth = officer.auth(client)

    early = client.get(
        f"{TRAIL}/{a}",
        params={"as_of": (DAY0 + timedelta(days=5)).isoformat()},
        headers=auth,
    ).json()
    assert len(early["paths"][0]["hops"]) == 1
    reached = {h["to_entity_id"] for h in early["paths"][0]["hops"]}
    assert str(c) not in reached, "an edge observed after as_of reached the response"

    # ...and once the disclosure has arrived, the same question finds it. The
    # bound is point-in-time, not a permanent exclusion.
    late = client.get(
        f"{TRAIL}/{a}",
        params={"as_of": (DAY0 + timedelta(days=11)).isoformat()},
        headers=auth,
    ).json()
    assert len(late["paths"][0]["hops"]) == 2


# Deliberately not repeated here: that ``SHARES_DEVICE`` is never followed.
# ``test_trail_reconstruction.py::test_non_money_edges_are_never_followed`` owns
# that claim, and this endpoint exposes no edge-type parameter through which it
# could regress. The one part that *is* an HTTP concern — that ``edge_type``
# serialises as its enum string — is asserted in
# ``test_origin_to_intermediary_to_cash_out`` above.


# --------------------------------------------------------------------------
# The bounds a caller sets
#
# Each is asserted through the wire, because a parameter the handler forgets to
# forward fails silently: the walk stays correct and stops answering the
# question that was asked.
# --------------------------------------------------------------------------


async def test_max_depth_cuts_the_walk_and_says_so(
    client: TestClient, officer: Officer, graph: Graph
) -> None:
    """A path that stopped because the search stopped is not a path that ended.

    Those two facts look identical on a canvas and warrant opposite responses, so
    ``truncated`` has to survive serialisation.
    """
    ids = await _chain(graph, 4)
    await graph.commit()

    body = client.get(
        f"{TRAIL}/{ids[0]}", params=_params(max_depth=2), headers=officer.auth(client)
    ).json()

    assert body["max_depth"] == 2
    assert len(body["paths"][0]["hops"]) == 2
    assert body["paths"][0]["truncated"] is True


async def test_max_hop_gap_ends_the_walk_and_widening_finds_it_again(
    client: TestClient, officer: Officer, graph: Graph
) -> None:
    """Money that sits for a month and moves again is usually not the same money.

    The bound is a search parameter the investigator controls, not a hidden
    verdict — so both directions are asserted.
    """
    a, b, c = [await graph.entity() for _ in range(3)]
    await graph.edge(a, b, occurred_at=DAY0)
    await graph.edge(b, c, occurred_at=DAY0 + timedelta(days=30))
    await graph.commit()

    auth = officer.auth(client)
    two_weeks = int(timedelta(days=14).total_seconds())
    sixty_days = int(timedelta(days=60).total_seconds())

    narrow = client.get(
        f"{TRAIL}/{a}", params=_params(max_hop_gap_seconds=two_weeks), headers=auth
    ).json()
    assert len(narrow["paths"][0]["hops"]) == 1

    wide = client.get(
        f"{TRAIL}/{a}", params=_params(max_hop_gap_seconds=sixty_days), headers=auth
    ).json()
    assert len(wide["paths"][0]["hops"]) == 2


async def test_min_amount_excludes_smaller_hops(
    client: TestClient, officer: Officer, graph: Graph
) -> None:
    """Layering splits sums; a floor is how an investigator sets the dust aside."""
    a, b, c = [await graph.entity() for _ in range(3)]
    await graph.edge(a, b, occurred_at=DAY0, amount="500000.00")
    await graph.edge(b, c, occurred_at=DAY0 + timedelta(hours=1), amount="900.00")
    await graph.commit()

    auth = officer.auth(client)

    filtered = client.get(
        f"{TRAIL}/{a}", params=_params(min_amount="1000.00"), headers=auth
    ).json()
    assert len(filtered["paths"][0]["hops"]) == 1

    unfiltered = client.get(f"{TRAIL}/{a}", params=_params(), headers=auth).json()
    assert len(unfiltered["paths"][0]["hops"]) == 2


async def test_not_before_excludes_earlier_movement(
    client: TestClient, officer: Officer, graph: Graph
) -> None:
    a, b = await graph.entity(), await graph.entity()
    await graph.edge(a, b, occurred_at=DAY0)
    await graph.commit()

    body = client.get(
        f"{TRAIL}/{a}",
        params=_params(not_before=(DAY0 + timedelta(days=1)).isoformat()),
        headers=officer.auth(client),
    ).json()
    assert body["paths"] == []


async def test_max_rows_bounds_the_walk_without_claiming_truncation(
    client: TestClient, officer: Officer, graph: Graph
) -> None:
    """The row cap and ``truncated`` are different claims, and stay different.

    ``max_rows`` bounds what the recursion may emit, so one popular cash-out
    endpoint cannot turn a depth-6 walk into a table scan. ``truncated`` means
    one specific thing — this path stopped at ``max_depth`` — and an investigator
    reads it as "there may be more money beyond here". Reporting a row cap
    through the same flag would give the most consequential distinction on the
    screen two meanings.

    So this pins the existing behaviour rather than a tidier one: a capped walk
    returns fewer hops and does **not** call itself truncated. It is also not
    pagination — there is no cursor, and no stable ordering over paths to page
    through — which is why nothing here asks for a next page.
    """
    ids = await _chain(graph, 3)
    await graph.commit()

    auth = officer.auth(client)

    full = client.get(f"{TRAIL}/{ids[0]}", params=_params(), headers=auth).json()
    assert len(full["paths"][0]["hops"]) == 3

    capped = client.get(
        f"{TRAIL}/{ids[0]}", params=_params(max_rows=1), headers=auth
    ).json()
    assert len(capped["paths"]) == 1
    assert len(capped["paths"][0]["hops"]) == 1
    assert capped["paths"][0]["truncated"] is False


async def test_an_origin_with_no_outbound_money_returns_an_empty_result(
    client: TestClient, officer: Officer, graph: Graph
) -> None:
    """200 with no paths, not 404.

    "No money left this account before ``as_of``" is a finding. A 404 would
    report it as "no such account", and an investigator would chase the wrong
    thing.
    """
    lonely = await graph.entity()
    await graph.commit()

    response = client.get(
        f"{TRAIL}/{lonely}", params=_params(), headers=officer.auth(client)
    )
    assert response.status_code == 200
    assert response.json()["paths"] == []


async def test_an_unknown_origin_answers_like_a_quiet_one(
    client: TestClient, officer: Officer
) -> None:
    """An id that exists and an id that does not must answer identically.

    Otherwise the endpoint is an oracle for whether ATLAS holds a given entity.
    """
    response = client.get(
        f"{TRAIL}/{uuid.uuid4()}", params=_params(), headers=officer.auth(client)
    )
    assert response.status_code == 200
    assert response.json()["paths"] == []


# --------------------------------------------------------------------------
# Request validation
# --------------------------------------------------------------------------


async def test_as_of_is_required(client: TestClient, officer: Officer) -> None:
    """No default, deliberately.

    Defaulting it to "now" is how a point-in-time bound becomes a formality that
    every caller satisfies without meaning to.
    """
    response = client.get(f"{TRAIL}/{uuid.uuid4()}", headers=officer.auth(client))
    assert response.status_code == 422


async def test_a_naive_as_of_is_rejected(client: TestClient, officer: Officer) -> None:
    """``2026-04-06T09:00`` denotes different instants in different places.

    Assuming UTC produces a bound wrong by hours in a system whose entire subject
    is when a fact became knowable.
    """
    response = client.get(
        f"{TRAIL}/{uuid.uuid4()}",
        params={"as_of": "2026-04-06T09:00:00"},
        headers=officer.auth(client),
    )
    assert response.status_code == 422


async def test_a_malformed_uuid_is_rejected(
    client: TestClient, officer: Officer
) -> None:
    response = client.get(
        f"{TRAIL}/not-a-uuid", params=_params(), headers=officer.auth(client)
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "params",
    [
        pytest.param({"as_of": "the day before yesterday"}, id="unparseable as_of"),
        pytest.param({"max_depth": 0}, id="max_depth below one"),
        pytest.param({"max_depth": 99}, id="max_depth above the ceiling"),
        pytest.param({"max_rows": 0}, id="max_rows below one"),
        pytest.param({"max_rows": 10**9}, id="max_rows above the ceiling"),
        pytest.param({"max_hop_gap_seconds": 0}, id="a hop gap of zero"),
        pytest.param({"max_hop_gap_seconds": -60}, id="a negative hop gap"),
        pytest.param({"min_amount": "-5.00"}, id="a negative floor"),
        pytest.param({"min_amount": "0"}, id="a zero floor"),
        pytest.param(
            {"not_before": "2027-01-01T00:00:00+00:00"}, id="not_before after as_of"
        ),
        pytest.param({"max_hop_gap": 3600}, id="the domain name, not the wire name"),
    ],
)
async def test_invalid_query_parameters_are_rejected(
    client: TestClient, officer: Officer, params: dict[str, object]
) -> None:
    """Each of these would otherwise be answered with a subtly wrong trail.

    The last is the one worth naming. ``max_hop_gap`` is what the domain object
    calls the parameter, so a caller reaching for it is making an easy mistake —
    and if unknown parameters were ignored they would get a completely
    *unfiltered* walk, with nothing to say the filter they asked for did nothing.
    """
    response = client.get(
        f"{TRAIL}/{uuid.uuid4()}",
        params=_params(**params),
        headers=officer.auth(client),
    )
    assert response.status_code == 422, response.text


# --------------------------------------------------------------------------
# Audit
# --------------------------------------------------------------------------


async def test_a_trail_read_is_audited(
    client: TestClient, officer: Officer, graph: Graph, session: AsyncSession
) -> None:
    """Who looked at whose money, and under what bound.

    ``as_of`` is part of the record because two reads of the same entity under
    different bounds are two different disclosures.
    """
    a, b = await graph.entity(), await graph.entity()
    await graph.edge(a, b, occurred_at=DAY0)
    await graph.commit()

    client.get(f"{TRAIL}/{a}", params=_params(), headers=officer.auth(client))

    row = (
        await session.execute(
            text(
                "SELECT result, detail::text FROM audit.audit_event "
                "WHERE action = 'graph.trail.read' AND resource_id = :r "
                "ORDER BY sequence DESC LIMIT 1"
            ),
            {"r": str(a)},
        )
    ).first()
    assert row is not None, "a trail read produced no audit event"
    assert row[0] == "allowed"
    assert "as_of" in row[1]


# --------------------------------------------------------------------------
# Artefact neighbourhood
# --------------------------------------------------------------------------


async def test_a_link_in_another_jurisdiction_is_visible_but_redacted(
    client: TestClient, officer: Officer, graph: Graph
) -> None:
    """Existence, type and owning jurisdiction — and nothing else.

    Enough to decide whether to request a hand-off, and not enough to skip
    asking. The target id would let the viewer probe for it elsewhere in the API;
    the basis is a fact about the other case.
    """
    mine, theirs = uuid.uuid4(), uuid.uuid4()
    complaint_id = uuid.uuid4()

    await graph.artefact_link(
        source_kind=NodeKind.COMPLAINT,
        source_id=complaint_id,
        target_kind=NodeKind.CASE,
        target_id=theirs,
        edge_type=EdgeType.RELATED_CASE,
        source_jurisdiction=officer.jurisdiction_id,
        # A jurisdiction the officer's district does not contain, and which no
        # scope query can reach.
        target_jurisdiction=uuid.uuid4(),
    )
    await graph.artefact_link(
        source_kind=NodeKind.COMPLAINT,
        source_id=complaint_id,
        target_kind=NodeKind.ALERT,
        target_id=mine,
        edge_type=EdgeType.LINKED_ALERT,
        source_jurisdiction=officer.jurisdiction_id,
        target_jurisdiction=officer.jurisdiction_id,
    )
    await graph.commit()

    response = client.get(
        f"{NEIGHBOURHOOD}/{NodeKind.COMPLAINT.value}/{complaint_id}",
        params=_params(),
        headers=officer.auth(client),
    )
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["node_kind"] == NodeKind.COMPLAINT.value
    assert [link["target_id"] for link in body["disclosed"]] == [str(mine)]
    assert body["disclosed"][0]["basis"]

    assert len(body["redacted"]) == 1
    withheld = body["redacted"][0]
    assert withheld["edge_type"] == EdgeType.RELATED_CASE.value
    assert withheld["target_jurisdiction_id"] is not None
    assert "target_id" not in withheld
    assert "basis" not in withheld
    assert str(theirs) not in response.text

    assert body["reaches_other_jurisdictions"] is True


async def test_an_unknown_node_kind_is_rejected(
    client: TestClient, officer: Officer
) -> None:
    response = client.get(
        f"{NEIGHBOURHOOD}/NOT_A_KIND/{uuid.uuid4()}",
        params=_params(),
        headers=officer.auth(client),
    )
    assert response.status_code == 422


async def test_a_neighbourhood_read_records_what_was_withheld(
    client: TestClient, officer: Officer, graph: Graph, session: AsyncSession
) -> None:
    """A redaction is a denial, and a denial nobody can count is one nobody reviews."""
    complaint_id = uuid.uuid4()
    await graph.artefact_link(
        source_kind=NodeKind.COMPLAINT,
        source_id=complaint_id,
        target_kind=NodeKind.CASE,
        target_id=uuid.uuid4(),
        edge_type=EdgeType.RELATED_CASE,
        source_jurisdiction=officer.jurisdiction_id,
        target_jurisdiction=uuid.uuid4(),
    )
    await graph.commit()

    client.get(
        f"{NEIGHBOURHOOD}/{NodeKind.COMPLAINT.value}/{complaint_id}",
        params=_params(),
        headers=officer.auth(client),
    )

    row = (
        await session.execute(
            text(
                "SELECT detail::text FROM audit.audit_event "
                "WHERE action = 'graph.neighbourhood.read' AND resource_id = :r "
                "ORDER BY sequence DESC LIMIT 1"
            ),
            {"r": f"{NodeKind.COMPLAINT.value}:{complaint_id}"},
        )
    ).first()
    assert row is not None, "a neighbourhood read produced no audit event"
    assert '"redacted": 1' in row[0]


# --------------------------------------------------------------------------
# Jurisdiction scoping, against a real tree
#
# The neighbourhood test above uses a random UUID as "another jurisdiction",
# which is enough to show a link gets redacted but never exercises
# `jurisdiction_scope` — that walks a recursive CTE, and a random id falls
# outside every scope trivially. These build state → two districts → a police
# station, so the walk has somewhere to descend and a sibling to refuse.
# --------------------------------------------------------------------------


class Tree:
    """State, the viewer's district, a sibling district, and a child station."""

    def __init__(
        self,
        state: uuid.UUID,
        district: uuid.UUID,
        sibling: uuid.UUID,
        station: uuid.UUID,
    ) -> None:
        self.state = state
        self.district = district
        self.sibling = sibling
        self.station = station


@pytest.fixture
async def tree_officer(session: AsyncSession) -> AsyncIterator[tuple[Officer, Tree]]:
    """A district investigator, with a sibling district and a child station."""
    from atlas.iam.models import Investigator, Jurisdiction

    suffix = uuid.uuid4().hex[:6]
    state = Jurisdiction(
        code=f"ST-{suffix}", name="State", level=JurisdictionLevel.STATE
    )
    session.add(state)
    await session.flush()

    district = Jurisdiction(
        code=f"D1-{suffix}",
        name="Viewer District",
        level=JurisdictionLevel.DISTRICT,
        parent_id=state.id,
    )
    sibling = Jurisdiction(
        code=f"D2-{suffix}",
        name="Sibling District",
        level=JurisdictionLevel.DISTRICT,
        parent_id=state.id,
    )
    session.add_all([district, sibling])
    await session.flush()

    station = Jurisdiction(
        code=f"PS-{suffix}",
        name="Station",
        level=JurisdictionLevel.POLICE_STATION,
        parent_id=district.id,
    )
    session.add(station)
    await session.flush()

    username = f"officer-{uuid.uuid4().hex[:8]}"
    secret = mfa.generate_secret()
    session.add(
        Investigator(
            username=username,
            display_name="Tree Officer",
            password_hash=passwords.hash_password(PASSWORD),
            mfa_secret=secret,
            mfa_enrolled=True,
            role=Role.DISTRICT_INVESTIGATOR,
            jurisdiction_id=district.id,
        )
    )
    await session.commit()

    yield (
        Officer(username, secret, district.id),
        Tree(state.id, district.id, sibling.id, station.id),
    )

    await session.execute(
        text("DELETE FROM iam.investigator WHERE username = :u"), {"u": username}
    )
    await session.execute(
        text("DELETE FROM iam.jurisdiction WHERE id = ANY(:ids)"),
        {"ids": [station.id, district.id, sibling.id, state.id]},
    )
    await session.commit()


async def test_a_link_in_a_sibling_district_is_redacted(
    client: TestClient, tree_officer: tuple[Officer, Tree], graph: Graph
) -> None:
    """The scoping case the reviewer asked for, against a real tree.

    A sibling district shares a parent with the viewer's, so it is *near* in the
    hierarchy and still outside their scope. A scope query that accidentally
    matched on the shared parent — or on the state — would disclose it, and a
    random foreign id would never catch that.
    """
    officer, tree = tree_officer
    complaint_id = uuid.uuid4()
    theirs = uuid.uuid4()

    await graph.artefact_link(
        source_kind=NodeKind.COMPLAINT,
        source_id=complaint_id,
        target_kind=NodeKind.CASE,
        target_id=theirs,
        edge_type=EdgeType.RELATED_CASE,
        source_jurisdiction=tree.district,
        target_jurisdiction=tree.sibling,
    )
    await graph.commit()

    response = client.get(
        f"{NEIGHBOURHOOD}/{NodeKind.COMPLAINT.value}/{complaint_id}",
        params=_params(),
        headers=officer.auth(client),
    )
    body = response.json()

    assert response.status_code == 200
    assert body["disclosed"] == []
    assert len(body["redacted"]) == 1
    assert body["redacted"][0]["target_jurisdiction_id"] == str(tree.sibling)
    assert str(theirs) not in response.text, "a sibling district's case id leaked"
    assert body["reaches_other_jurisdictions"] is True


async def test_a_link_in_a_child_station_is_disclosed(
    client: TestClient, tree_officer: tuple[Officer, Tree], graph: Graph
) -> None:
    """A district's scope descends to the stations under it.

    Without this the previous test passes for a scope that returns only the
    viewer's own id — which would redact their own station's work and read as
    fail-closed rather than as the bug it is.
    """
    officer, tree = tree_officer
    complaint_id = uuid.uuid4()
    mine = uuid.uuid4()

    await graph.artefact_link(
        source_kind=NodeKind.COMPLAINT,
        source_id=complaint_id,
        target_kind=NodeKind.ALERT,
        target_id=mine,
        edge_type=EdgeType.LINKED_ALERT,
        source_jurisdiction=tree.district,
        target_jurisdiction=tree.station,
    )
    await graph.commit()

    body = client.get(
        f"{NEIGHBOURHOOD}/{NodeKind.COMPLAINT.value}/{complaint_id}",
        params=_params(),
        headers=officer.auth(client),
    ).json()

    assert body["redacted"] == []
    assert [link["target_id"] for link in body["disclosed"]] == [str(mine)]
    assert body["reaches_other_jurisdictions"] is False


async def test_a_link_in_the_parent_state_is_redacted(
    client: TestClient, tree_officer: tuple[Officer, Tree], graph: Graph
) -> None:
    """Scope descends; it does not climb.

    A district investigator does not inherit the state's view by sitting under
    it, and a scope query that walked the tree the wrong way would hand them
    everything in the state.
    """
    officer, tree = tree_officer
    complaint_id = uuid.uuid4()

    await graph.artefact_link(
        source_kind=NodeKind.COMPLAINT,
        source_id=complaint_id,
        target_kind=NodeKind.CASE,
        target_id=uuid.uuid4(),
        edge_type=EdgeType.RELATED_CASE,
        source_jurisdiction=tree.district,
        target_jurisdiction=tree.state,
    )
    await graph.commit()

    body = client.get(
        f"{NEIGHBOURHOOD}/{NodeKind.COMPLAINT.value}/{complaint_id}",
        params=_params(),
        headers=officer.auth(client),
    ).json()

    assert body["disclosed"] == []
    assert len(body["redacted"]) == 1


async def test_the_trail_endpoint_applies_no_jurisdiction_scoping(
    client: TestClient, tree_officer: tuple[Officer, Tree], graph: Graph
) -> None:
    """Pins the documented gap, so nobody assumes it is covered.

    The trail is authorized by role alone. ``entity.canonical_entity`` carries no
    owning jurisdiction, and ``atlas.graph`` may not import ``atlas.cases`` to
    borrow one (ADR-009); both reasons are set out in ``router.py``.

    The consequence is that any holder of ``evidence:read`` can walk any entity's
    trail, whichever district the money moved through. That is a real narrowing
    of §29, and it is asserted here rather than left implicit — a reviewer
    reading this suite should not have to infer the absence of scoping from the
    absence of a test.

    If this test starts failing, scoping has been added and the gap recorded in
    ``router.py`` needs updating rather than the test being deleted.
    """
    officer, _ = tree_officer
    victim, mule = await graph.entity(), await graph.entity()
    await graph.edge(victim, mule, occurred_at=DAY0)
    await graph.commit()

    response = client.get(
        f"{TRAIL}/{victim}", params=_params(), headers=officer.auth(client)
    )

    assert response.status_code == 200
    assert len(response.json()["paths"]) == 1
