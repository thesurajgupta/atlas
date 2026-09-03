"""The ingestion pipeline against a real database (master spec §10.2).

Idempotency is the property under test. A source will replay a batch after a
network failure — at 8,000 complaints a day that is a certainty, not a risk.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from atlas.core.clock import utc_now
from atlas.core.enums import JurisdictionLevel
from atlas.iam.models import Jurisdiction
from atlas.ingest.connectors import SyntheticComplaintConnector
from atlas.ingest.pipeline import ingest_complaints
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.fixture
async def jurisdiction(session: AsyncSession) -> Jurisdiction:
    j = Jurisdiction(
        code=f"ING-{uuid.uuid4().hex[:8]}",
        name="Ingest District",
        level=JurisdictionLevel.DISTRICT,
    )
    session.add(j)
    await session.flush()
    return j


def _payload(
    jurisdiction_id: uuid.UUID, ref: str, **overrides: object
) -> dict[str, object]:
    now = utc_now()
    base: dict[str, object] = {
        "public_ref": ref,
        "reported_at": (now - timedelta(minutes=5)).isoformat(),
        "fraud_initiated_at": (now - timedelta(minutes=50)).isoformat(),
        "typology": "DIGITAL_ARREST",
        "reported_amount": "1240000.00",
        "victim_jurisdiction_id": str(jurisdiction_id),
        "narrative": "Victim reports coercion over a video call.",
    }
    base.update(overrides)
    return base


async def test_valid_batch_is_ingested(session: AsyncSession, jurisdiction) -> None:  # type: ignore[no-untyped-def]
    refs = [f"CMP-SYN-{uuid.uuid4().hex[:6]}" for _ in range(3)]
    connector = SyntheticComplaintConnector(
        [_payload(jurisdiction.id, r) for r in refs]
    )

    outcome = await ingest_complaints(session, connector)
    assert outcome.report.accepted == 3
    assert outcome.report.rejected == 0
    assert outcome.suspect is False


async def test_replaying_a_batch_creates_no_duplicates(
    session: AsyncSession, jurisdiction
) -> None:  # type: ignore[no-untyped-def]
    """The property that matters most. Sources replay after a network failure."""
    payloads = [
        _payload(jurisdiction.id, f"CMP-SYN-{uuid.uuid4().hex[:6]}") for _ in range(4)
    ]

    first = await ingest_complaints(session, SyntheticComplaintConnector(payloads))
    assert first.report.accepted == 4

    second = await ingest_complaints(session, SyntheticComplaintConnector(payloads))
    assert second.report.accepted == 0
    assert second.report.duplicates == 4


async def test_invalid_records_are_rejected_with_a_reason(
    session: AsyncSession, jurisdiction
) -> None:  # type: ignore[no-untyped-def]
    """Rejections are counted by reason, never silently dropped."""
    good = _payload(jurisdiction.id, f"CMP-SYN-{uuid.uuid4().hex[:6]}")
    negative = _payload(
        jurisdiction.id, f"CMP-SYN-{uuid.uuid4().hex[:6]}", reported_amount="-5"
    )
    backwards = _payload(
        jurisdiction.id,
        f"CMP-SYN-{uuid.uuid4().hex[:6]}",
        reported_at=(utc_now() - timedelta(hours=2)).isoformat(),
        fraud_initiated_at=utc_now().isoformat(),
    )

    outcome = await ingest_complaints(
        session, SyntheticComplaintConnector([good, negative, backwards])
    )
    assert outcome.report.accepted == 1
    assert outcome.report.rejected == 2
    assert outcome.report.reasons, "rejections must carry a reason"


async def test_a_mostly_rejected_batch_is_flagged_suspect(
    session: AsyncSession, jurisdiction
) -> None:
    """A sudden drop usually means the source changed format.

    Accepting the survivors quietly would bias everything built on them.
    """
    payloads = [
        _payload(
            jurisdiction.id, f"CMP-SYN-{uuid.uuid4().hex[:6]}", reported_amount="-1"
        )
        for _ in range(5)
    ]
    payloads.append(_payload(jurisdiction.id, f"CMP-SYN-{uuid.uuid4().hex[:6]}"))

    outcome = await ingest_complaints(session, SyntheticComplaintConnector(payloads))
    assert outcome.suspect is True


async def test_observed_at_is_set_at_the_boundary(
    session: AsyncSession, jurisdiction
) -> None:  # type: ignore[no-untyped-def]
    """`observed_at` must be when ATLAS learned it, not when the fraud happened.

    Conflating them moves the point-in-time boundary and lets a feature read
    something fractionally before it was knowable (§19.1).
    """
    ref = f"CMP-SYN-{uuid.uuid4().hex[:6]}"
    await ingest_complaints(
        session, SyntheticComplaintConnector([_payload(jurisdiction.id, ref)])
    )
    row = (
        await session.execute(
            text(
                "SELECT observed_at, reported_at, fraud_initiated_at, source_system "
                "FROM complaints.complaint WHERE public_ref = :r"
            ),
            {"r": ref},
        )
    ).first()
    assert row is not None
    observed, reported, initiated, source = row
    assert observed > reported, "observed_at must be after the report reached us"
    assert observed > initiated
    assert source == "synthetic-ncrp", "provenance must be recorded"


async def test_batch_is_audited(session: AsyncSession, jurisdiction) -> None:  # type: ignore[no-untyped-def]
    outcome = await ingest_complaints(
        session,
        SyntheticComplaintConnector(
            [_payload(jurisdiction.id, f"CMP-SYN-{uuid.uuid4().hex[:6]}")]
        ),
    )
    row = (
        await session.execute(
            text(
                "SELECT result, detail::text FROM audit.audit_event "
                "WHERE action = 'ingest.batch' AND resource_id = :b"
            ),
            {"b": str(outcome.batch_id)},
        )
    ).first()
    assert row is not None, "an ingestion batch must leave an audit record"
    assert "acceptance_rate" in row[1]


async def test_empty_batch_is_not_suspect(session: AsyncSession) -> None:
    """A quiet period is not a failure."""
    outcome = await ingest_complaints(session, SyntheticComplaintConnector([]))
    assert outcome.suspect is False
    assert outcome.report.total == 0
