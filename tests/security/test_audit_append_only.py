"""Audit is append-only and hash-chained (ADR-007, master spec §32).

A hash chain alone is not tamper-evidence: an administrator with UPDATE rights
can alter an event and recompute every subsequent hash. These tests assert the
storage-level constraint that makes the chain meaningful.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from atlas.audit.models import GENESIS_HASH, AuditEvent
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = [pytest.mark.security, pytest.mark.asyncio]


# Fixed so the helper is deterministic. Using uuid4() here made the determinism
# test fail against itself — the hash was fine, the test was not.
ACTOR_ID = uuid.UUID("11111111-2222-3333-4444-555555555555")


def _event(sequence: int, previous_hash: str = GENESIS_HASH) -> AuditEvent:
    event = AuditEvent(
        sequence=sequence,
        occurred_at=datetime(2026, 9, 1, 12, 0, tzinfo=UTC),
        actor_id=ACTOR_ID,
        actor_role="DISTRICT_INVESTIGATOR",
        actor_jurisdiction="DL-CENTRAL",
        action="complaint.read",
        resource_type="complaint",
        resource_id="CMP-SYN-0000001",
        result="allowed",
        correlation_id="corr-test-0001",
        detail={"reason": "case review"},
        previous_event_hash=previous_hash,
    )
    event.event_hash = event.compute_hash()
    return event


async def test_hash_is_deterministic() -> None:
    """Two processes must serialise the same event identically.

    If they do not, the chain breaks for reasons unrelated to tampering — and a
    verifier that cries wolf gets ignored.
    """
    assert _event(1).event_hash == _event(1).event_hash


async def test_hash_changes_when_any_field_changes() -> None:
    baseline = _event(1)
    tampered = _event(1)
    tampered.result = "denied"
    assert tampered.compute_hash() != baseline.event_hash


async def test_chain_binds_to_predecessor() -> None:
    """Altering an earlier event must invalidate everything after it."""
    first = _event(1)
    second = _event(2, previous_hash=first.event_hash)

    forged_first = _event(1)
    forged_first.action = "complaint.export"
    assert second.previous_event_hash != forged_first.compute_hash()


async def test_application_role_can_read_and_append_audit(
    session: AsyncSession,
) -> None:
    """Guards against passing for the wrong reason.

    A role with no privileges at all also "cannot UPDATE". Asserting the positive
    case first means the tests below prove a deliberate revoke rather than an
    accidental absence of any grant.
    """
    for privilege in ("SELECT", "INSERT"):
        result = await session.execute(
            text("SELECT has_table_privilege('atlas_app', 'audit.audit_event', :p)"),
            {"p": privilege},
        )
        assert result.scalar() is True, f"atlas_app lacks {privilege} on audit_event"


async def test_application_role_cannot_update_audit_events(
    session: AsyncSession,
) -> None:
    """The privilege that makes the chain worth having."""
    result = await session.execute(
        text("SELECT has_table_privilege('atlas_app', 'audit.audit_event', 'UPDATE')")
    )
    assert result.scalar() is False, (
        "atlas_app can UPDATE audit events. The hash chain is then only a "
        "corruption check, not tamper-evidence."
    )


async def test_application_role_cannot_delete_audit_events(
    session: AsyncSession,
) -> None:
    result = await session.execute(
        text("SELECT has_table_privilege('atlas_app', 'audit.audit_event', 'DELETE')")
    )
    assert result.scalar() is False, "atlas_app can DELETE audit events"
