"""The audit read endpoint (master spec §32, §29).

Traceability: ``INT-AUDIT-001`` — the audit trail is readable and its integrity
is reported.

Two things here are load-bearing and the rest is plumbing.

**Denied events must come back.** ATLAS answers 404 rather than 403 across a
jurisdiction boundary, which is a deliberate lie to the caller. It is defensible
only because the truth is recorded — and only if somebody can read it. An audit
API returning successes alone would make the 404 policy unauditable.

**The chain status must be real.** A stored "verified" flag would be exactly as
forgeable as the rows it describes, so the endpoint recomputes. The test that
proves it does the only thing that can: tampers with a committed row and
confirms the endpoint notices.

All rows are created here and synthetic
(``PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md``).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator, Iterator

import pyotp
import pytest
from atlas.app import create_app
from atlas.audit.service import Actor, AuditRequest, record
from atlas.core.enums import JurisdictionLevel, Role
from atlas.iam import mfa, passwords
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio

PASSWORD = "a-sufficiently-long-test-password"
AUDIT = "/api/v1/audit"


@pytest.fixture
def client() -> Iterator[TestClient]:
    """A client with its own source address, so the rate limiter is per test."""
    with TestClient(
        create_app(),
        raise_server_exceptions=False,
        client=(f"test-{uuid.uuid4().hex[:12]}", 50000),
    ) as c:
        yield c


class Officer:
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
        code=f"A-{uuid.uuid4().hex[:8]}",
        name="Audit District",
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
async def auditor(session: AsyncSession) -> AsyncIterator[Officer]:
    """`AUDITOR` exists for exactly this endpoint."""
    made = await _make_officer(session, Role.AUDITOR)
    yield made
    await _drop_officer(session, made)


@pytest.fixture
async def investigator(session: AsyncSession) -> AsyncIterator[Officer]:
    """A role that authenticates fine and holds no `audit:read`."""
    made = await _make_officer(session, Role.DISTRICT_INVESTIGATOR)
    yield made
    await _drop_officer(session, made)


async def _event(
    session: AsyncSession,
    officer: Officer,
    *,
    action: str = "complaint.read",
    result: str = "allowed",
    detail: dict[str, object] | None = None,
) -> None:
    await record(
        session,
        AuditRequest(
            action=action,
            resource_type="complaint",
            resource_id=f"REF-{uuid.uuid4().hex[:8]}",
            result=result,
            correlation_id=uuid.uuid4().hex,
            detail=detail or {},
        ),
        Actor(
            id=uuid.uuid4(),
            role=Role.DISTRICT_INVESTIGATOR.value,
            jurisdiction=str(officer.jurisdiction_id),
        ),
    )
    await session.commit()


# --------------------------------------------------------------------------
# Authorization
# --------------------------------------------------------------------------


async def test_reading_requires_a_token(client: TestClient) -> None:
    assert client.get(AUDIT).status_code == 401


async def test_a_role_without_audit_read_gets_403_not_404(
    client: TestClient, investigator: Officer
) -> None:
    """The deliberate exception to this codebase's 404 rule.

    Everywhere else a refusal is 404 so probing cannot enumerate records. This
    endpoint's *existence* is published in the OpenAPI schema, so 404 would
    protect nothing and would tell an auditor with a misconfigured role that the
    API is missing rather than that their permissions are wrong.
    """
    response = client.get(AUDIT, headers=investigator.auth(client))

    assert response.status_code == 403
    assert response.json()["error"] == "forbidden"


async def test_an_auditor_may_read(client: TestClient, auditor: Officer) -> None:
    assert client.get(AUDIT, headers=auditor.auth(client)).status_code == 200


# --------------------------------------------------------------------------
# Denials — the reason this endpoint exists
# --------------------------------------------------------------------------


async def test_denied_events_are_returned_with_their_reason(
    client: TestClient, auditor: Officer, session: AsyncSession
) -> None:
    """The caller was told 404; this is where the truth lives.

    An endpoint returning only successes would discard the most important row
    type in the table and make the 404 policy unauditable.
    """
    await _event(
        session,
        auditor,
        action="complaint.read",
        result="denied",
        detail={"reason": "outside jurisdiction"},
    )

    body = client.get(
        AUDIT, params={"result": "denied"}, headers=auditor.auth(client)
    ).json()

    assert body["items"], "a denial was recorded and did not come back"
    assert all(item["result"] == "denied" for item in body["items"])
    assert any(
        item["detail"].get("reason") == "outside jurisdiction" for item in body["items"]
    )


async def test_the_result_filter_separates_allowed_from_denied(
    client: TestClient, auditor: Officer, session: AsyncSession
) -> None:
    await _event(session, auditor, result="allowed")
    await _event(
        session, auditor, result="denied", detail={"reason": "outside jurisdiction"}
    )

    auth = auditor.auth(client)
    allowed = client.get(AUDIT, params={"result": "allowed"}, headers=auth).json()
    denied = client.get(AUDIT, params={"result": "denied"}, headers=auth).json()

    assert {i["result"] for i in allowed["items"]} == {"allowed"}
    assert {i["result"] for i in denied["items"]} == {"denied"}
    assert allowed["total"] >= 1
    assert denied["total"] >= 1


async def test_an_unknown_result_filter_is_rejected(
    client: TestClient, auditor: Officer
) -> None:
    """`?result=whatever` must not silently return everything."""
    response = client.get(
        AUDIT, params={"result": "maybe"}, headers=auditor.auth(client)
    )
    assert response.status_code == 422


# --------------------------------------------------------------------------
# Jurisdiction scoping
# --------------------------------------------------------------------------


async def test_another_jurisdictions_events_are_not_returned(
    client: TestClient, auditor: Officer, session: AsyncSession
) -> None:
    """Applied in the query: a foreign event is never loaded or counted."""
    other = await _make_officer(session, Role.AUDITOR)
    await _event(session, other, action="complaint.read.elsewhere")
    await _event(session, auditor, action="complaint.read.mine")

    body = client.get(AUDIT, headers=auditor.auth(client)).json()

    actions = {item["action"] for item in body["items"]}
    assert "complaint.read.mine" in actions
    assert "complaint.read.elsewhere" not in actions
    assert all(
        item["actor_jurisdiction"] == str(auditor.jurisdiction_id)
        for item in body["items"]
    )

    await _drop_officer(session, other)


async def test_the_total_is_scoped_not_global(
    client: TestClient, auditor: Officer, session: AsyncSession
) -> None:
    """A global total would leak how much is happening elsewhere.

    It is also strictly smaller than the chain's own event count, which covers
    the whole log — the two differing is expected.
    """
    other = await _make_officer(session, Role.AUDITOR)
    for _ in range(3):
        await _event(session, other)
    await _event(session, auditor)

    body = client.get(AUDIT, headers=auditor.auth(client)).json()

    assert body["total"] == 1
    assert body["chain"]["events"] > body["total"]

    await _drop_officer(session, other)


# --------------------------------------------------------------------------
# Chain integrity
# --------------------------------------------------------------------------


async def test_the_chain_verifies_on_an_untampered_log(
    client: TestClient, auditor: Officer, session: AsyncSession
) -> None:
    await _event(session, auditor)

    chain = client.get(AUDIT, headers=auditor.auth(client)).json()["chain"]

    assert chain["verified"] is True
    assert chain["events"] > 0
    assert chain["first_bad_sequence"] is None
    assert chain["reason"] is None


async def test_the_endpoint_reports_a_tampered_row(
    client: TestClient, auditor: Officer, session: AsyncSession
) -> None:
    """The only test that can prove the status is computed rather than stored.

    An event is edited in place — which the application role cannot do, so the
    update runs as the migration owner — and the endpoint must notice that the
    recomputed hash no longer matches.

    The row is restored afterwards. Leaving a broken chain behind would fail
    every later test in the suite for a reason none of them are about.
    """
    await _event(session, auditor, action="complaint.read")

    target = (
        await session.execute(
            text(
                "SELECT sequence, action FROM audit.audit_event "
                "ORDER BY sequence DESC LIMIT 1"
            )
        )
    ).one()
    sequence, original_action = target

    await session.execute(
        text("UPDATE audit.audit_event SET action = :a WHERE sequence = :s"),
        {"a": "tampered.action", "s": sequence},
    )
    await session.commit()

    try:
        chain = client.get(AUDIT, headers=auditor.auth(client)).json()["chain"]

        assert chain["verified"] is False, "an edited event was not detected"
        assert chain["first_bad_sequence"] == sequence
        assert chain["reason"]
    finally:
        await session.execute(
            text("UPDATE audit.audit_event SET action = :a WHERE sequence = :s"),
            {"a": original_action, "s": sequence},
        )
        await session.commit()

    restored = client.get(AUDIT, headers=auditor.auth(client)).json()["chain"]
    assert restored["verified"] is True, "the fixture did not restore the chain"


async def test_the_application_role_cannot_update_or_delete_an_event(
    session: AsyncSession,
) -> None:
    """The revoke is what makes the chain mean anything (`b1c2d3e4f5a6`).

    Asserted against the database rather than trusted from the migration:
    `ALTER DEFAULT PRIVILEGES` applies only to the role that issued it, and this
    project has been bitten by wrong grants twice.
    """
    row = (
        await session.execute(
            text(
                "SELECT has_table_privilege('atlas_app','audit.audit_event','SELECT') AS r, "
                "has_table_privilege('atlas_app','audit.audit_event','INSERT') AS i, "
                "has_table_privilege('atlas_app','audit.audit_event','UPDATE') AS u, "
                "has_table_privilege('atlas_app','audit.audit_event','DELETE') AS d"
            )
        )
    ).one()

    assert row.r is True
    assert row.i is True
    assert row.u is False, "an updatable audit log is not an audit log"
    assert row.d is False


# --------------------------------------------------------------------------
# Listing behaviour
# --------------------------------------------------------------------------


async def test_events_come_back_newest_first(
    client: TestClient, auditor: Officer, session: AsyncSession
) -> None:
    """Ordered by sequence, which is gapless and unique.

    Two events written in the same millisecond would order arbitrarily by
    timestamp, and a listing that changes order between identical requests is
    one nobody can cite.
    """
    for _ in range(3):
        await _event(session, auditor)

    body = client.get(AUDIT, headers=auditor.auth(client)).json()

    sequences = [item["sequence"] for item in body["items"]]
    assert sequences == sorted(sequences, reverse=True)


async def test_reading_the_audit_log_is_itself_audited(
    client: TestClient, auditor: Officer, session: AsyncSession
) -> None:
    """A trail that does not record who read it has a hole where misuse shows."""
    client.get(AUDIT, headers=auditor.auth(client))

    row = (
        await session.execute(
            text(
                "SELECT result, actor_role FROM audit.audit_event "
                "WHERE action = 'audit.list' ORDER BY sequence DESC LIMIT 1"
            )
        )
    ).first()

    assert row is not None, "reading the audit log left no trace"
    assert row[0] == "allowed"
    assert row[1] == Role.AUDITOR.value


async def test_pagination_bounds_are_enforced(
    client: TestClient, auditor: Officer
) -> None:
    auth = auditor.auth(client)
    assert client.get(AUDIT, params={"limit": 0}, headers=auth).status_code == 422
    assert client.get(AUDIT, params={"limit": 500}, headers=auth).status_code == 422
    assert client.get(AUDIT, params={"offset": -1}, headers=auth).status_code == 422


async def test_no_write_route_is_exposed(client: TestClient, auditor: Officer) -> None:
    """The audit schema is append-only by grant; the API must not imply otherwise.

    A 405 rather than a 404 would still be fine — what matters is that no method
    on this path accepts a mutation.
    """
    auth = auditor.auth(client)
    # DELETE is sent without a body: httpx's `delete()` takes no `json=`, and a
    # body on a DELETE is meaningless anyway.
    for method in ("post", "put", "patch"):
        response = getattr(client, method)(AUDIT, headers=auth, json={})
        assert response.status_code in (404, 405), f"{method.upper()} was accepted"

    assert client.delete(AUDIT, headers=auth).status_code in (404, 405)
