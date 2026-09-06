"""Alert persistence and the listing endpoint (master spec §29, §35.1).

Traceability: ``INT-ALERT-001`` — decisions are durable, suppressions included.

The behaviour worth guarding is not that alerts get stored. It is that
**suppressions** get stored, with the reason the policy gave, and that a
suppression does not go on to suppress the next decision. Both are easy to get
wrong in ways nothing reports: the first loses the record of every judgement the
system declined to act on, and the second silences a case for six hours for a
reason that has already stopped applying.

All rows are created here and synthetic
(``PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md``).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pyotp
import pytest
from atlas.alerts.models import Alert
from atlas.alerts.policy import AlertCandidate
from atlas.alerts.service import evaluate_and_record, issued_in_window, recent_keys
from atlas.app import create_app
from atlas.core.enums import AlertSeverity, EvidenceSufficiency, JurisdictionLevel, Role
from atlas.iam import mfa, passwords
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio

PASSWORD = "a-sufficiently-long-test-password"
NOW = datetime(2026, 5, 1, 10, 0, tzinfo=UTC)
ALERTS = "/api/v1/alerts"


# --------------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------------


@pytest.fixture
def client() -> Iterator[TestClient]:
    """A client with its own source address.

    `TestClient` reports the same address for every instance, and the rate
    limiter keys unauthenticated requests on it — so one address shared across a
    module makes its last tests fail on a budget the earlier ones spent.
    """
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


async def _jurisdiction(session: AsyncSession) -> uuid.UUID:
    from atlas.iam.models import Jurisdiction

    jurisdiction = Jurisdiction(
        code=f"J-{uuid.uuid4().hex[:8]}",
        name="Test District",
        level=JurisdictionLevel.DISTRICT,
    )
    session.add(jurisdiction)
    await session.flush()
    return jurisdiction.id


@pytest.fixture
async def officer(session: AsyncSession) -> AsyncIterator[Officer]:
    from atlas.iam.models import Investigator

    jurisdiction_id = await _jurisdiction(session)
    username = f"officer-{uuid.uuid4().hex[:8]}"
    secret = mfa.generate_secret()
    session.add(
        Investigator(
            username=username,
            display_name="Test Officer",
            password_hash=passwords.hash_password(PASSWORD),
            mfa_secret=secret,
            mfa_enrolled=True,
            role=Role.DISTRICT_INVESTIGATOR,
            jurisdiction_id=jurisdiction_id,
        )
    )
    await session.commit()

    yield Officer(username, secret, jurisdiction_id)

    await session.execute(
        text("DELETE FROM alerts.alert WHERE jurisdiction_id = :j"),
        {"j": jurisdiction_id},
    )
    await session.execute(
        text("DELETE FROM iam.investigator WHERE username = :u"), {"u": username}
    )
    await session.execute(
        text("DELETE FROM iam.jurisdiction WHERE id = :j"), {"j": jurisdiction_id}
    )
    await session.commit()


def _candidate(
    jurisdiction_id: uuid.UUID,
    *,
    case_ref: str = "CASE-2026-0914",
    evidence: EvidenceSufficiency = EvidenceSufficiency.STRONG,
    endpoint: str | None = "EP-001",
    minutes_ago: int = 10,
) -> AlertCandidate:
    return AlertCandidate(
        case_ref=case_ref,
        jurisdiction_id=str(jurisdiction_id),
        evidence=evidence,
        amount_at_risk=Decimal("284000.00"),
        fraud_initiated_at=NOW - timedelta(minutes=minutes_ago),
        top_candidate_ref=endpoint,
        typology="UPI_COLLECT_FRAUD",
    )


async def _rows(session: AsyncSession, jurisdiction_id: uuid.UUID) -> list[Alert]:
    result = await session.execute(
        select(Alert)
        .where(Alert.jurisdiction_id == jurisdiction_id)
        .order_by(Alert.issued_at, Alert.id)
    )
    return list(result.scalars())


# --------------------------------------------------------------------------
# Persistence
# --------------------------------------------------------------------------


async def test_a_raised_alert_is_persisted_with_its_severity(
    session: AsyncSession,
) -> None:
    jurisdiction_id = await _jurisdiction(session)

    decision = await evaluate_and_record(session, _candidate(jurisdiction_id), now=NOW)

    assert decision.raise_alert is True
    rows = await _rows(session, jurisdiction_id)
    assert len(rows) == 1
    assert rows[0].raised is True
    assert rows[0].severity is not None
    assert isinstance(rows[0].severity, AlertSeverity)
    assert rows[0].reason
    assert rows[0].issued_at == NOW


async def test_a_suppressed_alert_is_persisted_with_the_reason(
    session: AsyncSession,
) -> None:
    """The part that is easy to skip and expensive to skip.

    "No alert appeared" cannot distinguish a deliberate suppression from a
    pipeline that never ran, and a supervisor asking why nobody was told
    deserves better than a missing row.
    """
    jurisdiction_id = await _jurisdiction(session)

    decision = await evaluate_and_record(
        session,
        _candidate(jurisdiction_id, evidence=EvidenceSufficiency.INSUFFICIENT),
        now=NOW,
    )

    assert decision.raise_alert is False
    rows = await _rows(session, jurisdiction_id)
    assert len(rows) == 1
    assert rows[0].raised is False
    assert rows[0].severity is None, "a suppression was never rated"
    assert "INSUFFICIENT" in rows[0].reason


async def test_the_stored_reason_is_the_policy_reason_verbatim(
    session: AsyncSession,
) -> None:
    """A paraphrase would be a second copy that drifts from the policy."""
    jurisdiction_id = await _jurisdiction(session)

    decision = await evaluate_and_record(
        session, _candidate(jurisdiction_id, minutes_ago=120), now=NOW
    )

    rows = await _rows(session, jurisdiction_id)
    assert rows[0].reason == decision.reason
    assert "golden hour" in rows[0].reason


async def test_a_repeat_inside_the_window_does_not_raise_twice(
    session: AsyncSession,
) -> None:
    """Re-running the pipeline must be silent, not duplicative."""
    jurisdiction_id = await _jurisdiction(session)

    first = await evaluate_and_record(session, _candidate(jurisdiction_id), now=NOW)
    second = await evaluate_and_record(
        session, _candidate(jurisdiction_id), now=NOW + timedelta(minutes=5)
    )

    assert first.raise_alert is True
    assert second.raise_alert is False
    assert "suppression window" in second.reason

    rows = await _rows(session, jurisdiction_id)
    assert len(rows) == 2, "both decisions are recorded"
    assert [r.raised for r in rows] == [True, False]


async def test_a_suppression_does_not_suppress_the_next_decision(
    session: AsyncSession,
) -> None:
    """The subtle one, and the reason both queries filter on `raised`.

    A case refused at 10:00 for INSUFFICIENT evidence must be free to raise at
    10:20 when the evidence improves. Counting the suppression as an "equivalent
    alert already issued" would silence it for the rest of the window — for a
    reason that has stopped applying.
    """
    jurisdiction_id = await _jurisdiction(session)

    refused = await evaluate_and_record(
        session,
        _candidate(jurisdiction_id, evidence=EvidenceSufficiency.INSUFFICIENT),
        now=NOW,
    )
    improved = await evaluate_and_record(
        session,
        _candidate(
            jurisdiction_id, evidence=EvidenceSufficiency.STRONG, minutes_ago=25
        ),
        now=NOW + timedelta(minutes=15),
    )

    assert refused.raise_alert is False
    assert improved.raise_alert is True, "a suppression silenced a later valid alert"


async def test_suppressions_do_not_consume_the_budget(session: AsyncSession) -> None:
    """The budget limits interruptions, and a suppression interrupted nobody."""
    jurisdiction_id = await _jurisdiction(session)

    for i in range(3):
        await evaluate_and_record(
            session,
            _candidate(
                jurisdiction_id,
                case_ref=f"CASE-SUP-{i}",
                evidence=EvidenceSufficiency.INSUFFICIENT,
            ),
            now=NOW,
        )

    assert (
        await issued_in_window(session, jurisdiction_id=jurisdiction_id, now=NOW) == 0
    )

    decision = await evaluate_and_record(
        session, _candidate(jurisdiction_id, case_ref="CASE-REAL"), now=NOW, budget=1
    )
    assert decision.raise_alert is True


async def test_the_budget_stops_a_flood(session: AsyncSession) -> None:
    jurisdiction_id = await _jurisdiction(session)

    first = await evaluate_and_record(
        session, _candidate(jurisdiction_id, case_ref="CASE-A"), now=NOW, budget=1
    )
    second = await evaluate_and_record(
        session, _candidate(jurisdiction_id, case_ref="CASE-B"), now=NOW, budget=1
    )

    assert first.raise_alert is True
    assert second.raise_alert is False
    assert "budget exhausted" in second.reason


async def test_another_jurisdictions_alerts_do_not_count(
    session: AsyncSession,
) -> None:
    """An alert raised elsewhere interrupted a different person."""
    mine = await _jurisdiction(session)
    theirs = await _jurisdiction(session)

    await evaluate_and_record(session, _candidate(theirs), now=NOW)

    assert await recent_keys(session, jurisdiction_id=mine, now=NOW) == frozenset()
    assert await issued_in_window(session, jurisdiction_id=mine, now=NOW) == 0

    decision = await evaluate_and_record(session, _candidate(mine), now=NOW, budget=1)
    assert decision.raise_alert is True


async def test_a_key_outside_the_window_no_longer_suppresses(
    session: AsyncSession,
) -> None:
    """The suppression window is a window, not a permanent mute."""
    jurisdiction_id = await _jurisdiction(session)

    await evaluate_and_record(session, _candidate(jurisdiction_id), now=NOW)
    later = NOW + timedelta(hours=7)

    assert (
        await recent_keys(session, jurisdiction_id=jurisdiction_id, now=later)
        == frozenset()
    )


async def test_a_naive_now_is_refused(session: AsyncSession) -> None:
    jurisdiction_id = await _jurisdiction(session)
    with pytest.raises(ValueError, match="timezone-aware"):
        await evaluate_and_record(
            session,
            _candidate(jurisdiction_id),
            now=datetime(2026, 5, 1, 10, 0),  # noqa: DTZ001 - naive on purpose
        )


async def test_the_feature_role_cannot_read_alerts(session: AsyncSession) -> None:
    """§19.4: an alert derived from a prediction must not feed the next one.

    Asserted against the database rather than trusted from the migration —
    `ALTER DEFAULT PRIVILEGES` applies only to the role that issued it, and a new
    table landing with the wrong grants has bitten this project twice.
    """
    result = await session.execute(
        text(
            "SELECT has_table_privilege('atlas_app','alerts.alert','INSERT') AS app_write, "
            "has_table_privilege('atlas_features','alerts.alert','SELECT') AS features_read"
        )
    )
    row = result.one()
    assert row.app_write is True
    assert row.features_read is False


# --------------------------------------------------------------------------
# The endpoint
# --------------------------------------------------------------------------


async def test_listing_requires_a_token(client: TestClient) -> None:
    assert client.get(ALERTS).status_code == 401


async def test_listing_returns_raised_and_suppressed_together(
    client: TestClient, officer: Officer, session: AsyncSession
) -> None:
    """Lucky's page shows suppressed alerts in a collapsed section.

    Two requests to build one list is one forgotten call away from a screen that
    quietly claims nothing was decided.
    """
    await evaluate_and_record(
        session, _candidate(officer.jurisdiction_id, case_ref="CASE-RAISED"), now=NOW
    )
    await evaluate_and_record(
        session,
        _candidate(
            officer.jurisdiction_id,
            case_ref="CASE-SUPPRESSED",
            evidence=EvidenceSufficiency.INSUFFICIENT,
        ),
        now=NOW,
    )
    await session.commit()

    body = client.get(ALERTS, headers=officer.auth(client)).json()

    assert body["total"] == 2
    assert body["raised_total"] == 1
    assert body["suppressed_total"] == 1
    assert {item["raised"] for item in body["items"]} == {True, False}
    suppressed = next(i for i in body["items"] if not i["raised"])
    assert suppressed["severity"] is None
    assert suppressed["reason"]


async def test_listing_is_scoped_to_the_callers_jurisdiction(
    client: TestClient, officer: Officer, session: AsyncSession
) -> None:
    """Applied in the query: an alert outside scope is never loaded or counted."""
    other = await _jurisdiction(session)
    await evaluate_and_record(
        session, _candidate(other, case_ref="CASE-ELSEWHERE"), now=NOW
    )
    await evaluate_and_record(
        session, _candidate(officer.jurisdiction_id, case_ref="CASE-MINE"), now=NOW
    )
    await session.commit()

    body = client.get(ALERTS, headers=officer.auth(client)).json()

    refs = {item["case_ref"] for item in body["items"]}
    assert refs == {"CASE-MINE"}
    assert body["total"] == 1, (
        "a total that counted other jurisdictions would leak volume"
    )

    await session.execute(
        text("DELETE FROM alerts.alert WHERE jurisdiction_id = :j"), {"j": other}
    )
    await session.execute(
        text("DELETE FROM iam.jurisdiction WHERE id = :j"), {"j": other}
    )
    await session.commit()


async def test_the_totals_ignore_the_raised_filter(
    client: TestClient, officer: Officer, session: AsyncSession
) -> None:
    """A console filtered to raised alerts must still say how many were withheld.

    Counting only the filtered page would report zero suppressions — the one
    figure this endpoint exists to surface.
    """
    await evaluate_and_record(
        session, _candidate(officer.jurisdiction_id, case_ref="CASE-R"), now=NOW
    )
    await evaluate_and_record(
        session,
        _candidate(
            officer.jurisdiction_id,
            case_ref="CASE-S",
            evidence=EvidenceSufficiency.INSUFFICIENT,
        ),
        now=NOW,
    )
    await session.commit()

    body = client.get(
        ALERTS, params={"raised": "true"}, headers=officer.auth(client)
    ).json()

    assert [i["raised"] for i in body["items"]] == [True]
    assert body["suppressed_total"] == 1


async def test_a_role_without_alert_read_is_refused(
    client: TestClient, session: AsyncSession
) -> None:
    """`BANK_PARTNER` holds no investigative permission at all (§28.1)."""
    from atlas.iam.models import Investigator

    jurisdiction_id = await _jurisdiction(session)
    username = f"bank-{uuid.uuid4().hex[:8]}"
    secret = mfa.generate_secret()
    session.add(
        Investigator(
            username=username,
            display_name="Bank Partner",
            password_hash=passwords.hash_password(PASSWORD),
            mfa_secret=secret,
            mfa_enrolled=True,
            role=Role.BANK_PARTNER,
            jurisdiction_id=jurisdiction_id,
        )
    )
    await session.commit()

    partner = Officer(username, secret, jurisdiction_id)
    response = client.get(ALERTS, headers=partner.auth(client))
    # 404 rather than 403 — a 403 confirms the endpoint had something to withhold.
    assert response.status_code == 404

    await session.execute(
        text("DELETE FROM iam.investigator WHERE username = :u"), {"u": username}
    )
    await session.execute(
        text("DELETE FROM iam.jurisdiction WHERE id = :j"), {"j": jurisdiction_id}
    )
    await session.commit()
