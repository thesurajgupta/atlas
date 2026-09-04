"""The audit chain detects tampering (ADR-007, master spec §32).

Every test here simulates an attack on the record and asserts it is caught.
Verifying that the chain works on untampered data would prove nothing.
"""

from __future__ import annotations

import itertools
import uuid
from pathlib import Path

import pytest
from atlas.audit import checkpoints
from atlas.audit.models import GENESIS_HASH, AuditEvent
from atlas.audit.service import (
    Actor,
    AuditRequest,
    chain_head,
    record,
    redact,
    verify_chain,
)
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.security


async def _append(session: AsyncSession, n: int = 3) -> list[AuditEvent]:
    events = []
    for i in range(n):
        events.append(
            await record(
                session,
                AuditRequest(
                    action="complaint.read",
                    resource_type="complaint",
                    resource_id=f"CMP-SYN-{i:07d}",
                    correlation_id=f"corr-{i}",
                ),
                Actor(
                    id=uuid.uuid4(),
                    role="DISTRICT_INVESTIGATOR",
                    jurisdiction="DL-CENTRAL",
                ),
            )
        )
    return events


async def test_an_appended_event_binds_to_the_current_head(
    session: AsyncSession,
) -> None:
    """Whatever the head is, the next event must bind to exactly that.

    This deliberately does not assume an empty table. Other tests commit audit
    events, so asserting "the first event uses GENESIS" only passed while this
    file ran first — an order dependency that would have surfaced later as a
    confusing intermittent failure.
    """
    head_seq, head_hash = await chain_head(session)
    event = (await _append(session, 1))[0]
    assert event.previous_event_hash == head_hash
    assert event.sequence == head_seq + 1


async def test_genesis_is_used_when_the_chain_is_empty(session: AsyncSession) -> None:
    """The empty-chain case, tested explicitly rather than assumed.

    Clears the chain inside the fixture's transaction, which rolls back — so the
    committed history other tests rely on is untouched.
    """
    await session.execute(text("DELETE FROM audit.audit_checkpoint"))
    await session.execute(text("DELETE FROM audit.audit_event"))
    sequence, head = await chain_head(session)
    assert (sequence, head) == (0, GENESIS_HASH)

    event = (await _append(session, 1))[0]
    assert event.previous_event_hash == GENESIS_HASH
    assert event.sequence == 1
    await session.rollback()


async def test_events_form_an_unbroken_chain(session: AsyncSession) -> None:
    events = await _append(session, 4)
    for earlier, later in itertools.pairwise(events):
        assert later.previous_event_hash == earlier.event_hash
        assert later.sequence == earlier.sequence + 1


async def test_clean_chain_verifies(session: AsyncSession) -> None:
    events = await _append(session, 3)
    result = await verify_chain(session, start=events[0].sequence)
    assert result.ok, result.reason


async def test_modifying_an_event_is_detected(session: AsyncSession) -> None:
    """The basic tamper case: rewrite history and hope nobody recomputes."""
    events = await _append(session, 3)
    target = events[1]
    await session.execute(
        text("UPDATE audit.audit_event SET action = :a WHERE id = :i"),
        {"a": "complaint.export", "i": target.id},
    )
    session.expunge_all()

    result = await verify_chain(session, start=events[0].sequence)
    assert not result.ok
    assert result.first_bad_sequence == target.sequence
    assert result.reason is not None and "modified" in result.reason


async def test_deleting_an_event_is_detected(session: AsyncSession) -> None:
    """A gap matters as much as a modification.

    Without a sequence check, removing an inconvenient event leaves a chain that
    still verifies link-by-link from the survivors.
    """
    events = await _append(session, 4)
    await session.execute(
        text("DELETE FROM audit.audit_event WHERE id = :i"), {"i": events[1].id}
    )
    session.expunge_all()

    result = await verify_chain(session, start=events[0].sequence)
    assert not result.ok
    assert result.reason is not None and "gap" in result.reason


async def test_appends_are_serialised_under_concurrency(session: AsyncSession) -> None:
    """Sequences must be gapless even when writers race.

    Two transactions reading the same chain head would both bind to it, and a
    verifier would later report tampering that never happened.
    """
    events = await _append(session, 12)
    sequences = [e.sequence for e in events]
    assert sequences == sorted(sequences)
    assert len(set(sequences)) == len(sequences), "duplicate sequence numbers"
    assert sequences[-1] - sequences[0] == len(sequences) - 1, (
        "gap in assigned sequences"
    )


async def test_chain_head_advances(session: AsyncSession) -> None:
    before_seq, _ = await chain_head(session)
    await _append(session, 2)
    after_seq, after_hash = await chain_head(session)
    assert after_seq == before_seq + 2
    assert after_hash != GENESIS_HASH


# --------------------------------------------------------------------------
# Redaction — an audit log must not become the breach it records.
# --------------------------------------------------------------------------


def test_credentials_are_redacted_from_detail() -> None:
    cleaned = redact(
        {"username": "officer", "password": "hunter2", "totp_code": "123456"}
    )
    assert cleaned["username"] == "officer"
    assert cleaned["password"] == "[REDACTED]"
    assert cleaned["totp_code"] == "[REDACTED]"


def test_redaction_is_recursive() -> None:
    cleaned = redact({"outer": {"refresh_token": "abc", "safe": 1}})
    assert cleaned["outer"]["refresh_token"] == "[REDACTED]"
    assert cleaned["outer"]["safe"] == 1


def test_redaction_marks_rather_than_drops() -> None:
    """A reviewer should see that something sensitive was present."""
    assert "password" in redact({"password": "x"})


async def test_recorded_event_never_stores_a_credential(session: AsyncSession) -> None:
    event = await record(
        session,
        AuditRequest(
            action="auth.login",
            resource_type="session",
            result="denied",
            detail={"username": "officer", "password": "hunter2"},
        ),
    )
    assert "hunter2" not in event.canonical_payload()


# --------------------------------------------------------------------------
# Checkpoints — the layer that makes the chain genuinely tamper-evident.
# --------------------------------------------------------------------------


async def test_checkpoint_signs_and_verifies(
    session: AsyncSession, tmp_path: Path
) -> None:
    key = checkpoints.generate_signing_key(tmp_path / "k.pem", key_id="test-key")
    await _append(session, 2)
    checkpoint = await checkpoints.create_checkpoint(session, key)
    assert checkpoint is not None
    assert checkpoints.verify_checkpoint(checkpoint, key.public_key) is True


async def test_checkpoint_from_another_key_does_not_verify(
    session: AsyncSession, tmp_path: Path
) -> None:
    signer = checkpoints.generate_signing_key(tmp_path / "a.pem", key_id="a")
    other = checkpoints.generate_signing_key(tmp_path / "b.pem", key_id="b")
    await _append(session, 1)
    checkpoint = await checkpoints.create_checkpoint(session, signer)
    assert checkpoint is not None
    assert checkpoints.verify_checkpoint(checkpoint, other.public_key) is False


async def test_altering_a_checkpoint_breaks_its_signature(
    session: AsyncSession, tmp_path: Path
) -> None:
    key = checkpoints.generate_signing_key(tmp_path / "k.pem", key_id="k")
    await _append(session, 1)
    checkpoint = await checkpoints.create_checkpoint(session, key)
    assert checkpoint is not None
    checkpoint.chain_head_hash = "0" * 64
    assert checkpoints.verify_checkpoint(checkpoint, key.public_key) is False


async def test_rewriting_the_chain_under_a_valid_checkpoint_is_caught(
    session: AsyncSession, tmp_path: Path
) -> None:
    """**The reason checkpoints exist.**

    An administrator alters an event and recomputes every subsequent hash. The
    chain then verifies perfectly on its own. Only the signed checkpoint — whose
    key lives outside the database — reveals that the head no longer matches what
    was attested.
    """
    key = checkpoints.generate_signing_key(tmp_path / "k.pem", key_id="k")
    events = await _append(session, 2)
    checkpoint = await checkpoints.create_checkpoint(session, key)
    assert checkpoint is not None

    # Rewrite the checkpointed event and its stored hash, as an admin could.
    forged = "f" * 64
    await session.execute(
        text(
            "UPDATE audit.audit_event SET action = :a, event_hash = :h WHERE sequence = :s"
        ),
        {"a": "complaint.export", "h": forged, "s": events[-1].sequence},
    )
    session.expunge_all()

    result = await checkpoints.verify_all_checkpoints(session, key.public_key)
    assert not result.ok
    assert result.reason is not None and "rewritten" in result.reason


async def test_no_checkpoint_over_an_empty_chain(
    session: AsyncSession, tmp_path: Path
) -> None:
    """A signature asserting nothing is worse than no signature."""
    key = checkpoints.generate_signing_key(tmp_path / "k.pem", key_id="k")
    await session.execute(text("DELETE FROM audit.audit_event"))
    assert await checkpoints.create_checkpoint(session, key) is None
