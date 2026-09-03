"""Audit event emission with hash chaining (ADR-007, master spec §32).

The chain's value depends entirely on being gapless and correctly ordered, which
makes concurrent appends the hard part: two transactions reading the same chain
head would both bind to it, and one would silently overwrite the other's
sequence. A verifier would then report tampering where none occurred.

Appends are therefore serialised with a PostgreSQL transaction-scoped advisory
lock. It is held only for the append, released automatically at commit or
rollback, and costs nothing at our volume (~0.1 events/sec mean, ADR-003).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from atlas.audit.models import GENESIS_HASH, AuditEvent
from atlas.core.clock import utc_now

# Arbitrary but fixed key identifying the audit-chain lock. Any other advisory
# lock in the system must not reuse it.
_CHAIN_LOCK_KEY = 0x4154_4C41  # "ATLA"


@dataclass(frozen=True)
class Actor:
    """Who performed the operation. All fields optional for system actions."""

    id: uuid.UUID | None = None
    role: str | None = None
    jurisdiction: str | None = None
    source_ip: str | None = None
    user_agent: str | None = None


@dataclass(frozen=True)
class AuditRequest:
    """One thing worth recording."""

    action: str
    resource_type: str
    resource_id: str | None = None
    case_id: uuid.UUID | None = None
    result: str = "allowed"
    correlation_id: str = ""
    detail: dict[str, Any] = field(default_factory=dict)


# Keys that must never reach the audit detail blob (master spec §30). Recording
# a denied login is useful; recording the password that was tried is a breach.
_FORBIDDEN_DETAIL_KEYS = frozenset(
    {
        "password",
        "passwd",
        "secret",
        "token",
        "access_token",
        "refresh_token",
        "jwt",
        "authorization",
        "api_key",
        "mfa_secret",
        "totp",
        "totp_code",
        "private_key",
        "session",
        "cookie",
    }
)


def redact(detail: dict[str, Any]) -> dict[str, Any]:
    """Strip credential-bearing keys, recursively.

    Redacts rather than dropping the key, so a reviewer can see that something
    sensitive was present without seeing its value.
    """
    cleaned: dict[str, Any] = {}
    for key, value in detail.items():
        if key.lower() in _FORBIDDEN_DETAIL_KEYS:
            cleaned[key] = "[REDACTED]"
        elif isinstance(value, dict):
            cleaned[key] = redact(value)
        else:
            cleaned[key] = value
    return cleaned


async def _lock_chain(session: AsyncSession) -> None:
    """Serialise appends for the remainder of this transaction."""
    await session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _CHAIN_LOCK_KEY})


async def chain_head(session: AsyncSession) -> tuple[int, str]:
    """Current (sequence, hash) of the chain head, or the genesis values."""
    result = await session.execute(
        select(AuditEvent.sequence, AuditEvent.event_hash)
        .order_by(AuditEvent.sequence.desc())
        .limit(1)
    )
    row = result.first()
    return (0, GENESIS_HASH) if row is None else (row[0], row[1])


async def record(
    session: AsyncSession, request: AuditRequest, actor: Actor | None = None
) -> AuditEvent:
    """Append one audit event, binding it to the current chain head.

    The caller's transaction owns the commit. An audit event and the operation it
    describes must land together or not at all — writing the audit row in its own
    transaction would produce records of operations that were later rolled back.
    """
    await _lock_chain(session)
    previous_sequence, previous_hash = await chain_head(session)
    actor = actor or Actor()

    event = AuditEvent(
        sequence=previous_sequence + 1,
        occurred_at=utc_now(),
        actor_id=actor.id,
        actor_role=actor.role,
        actor_jurisdiction=actor.jurisdiction,
        action=request.action,
        resource_type=request.resource_type,
        resource_id=request.resource_id,
        case_id=request.case_id,
        result=request.result,
        source_ip=actor.source_ip,
        user_agent=actor.user_agent,
        correlation_id=request.correlation_id or uuid.uuid4().hex,
        detail=redact(request.detail),
        previous_event_hash=previous_hash,
    )
    event.event_hash = event.compute_hash()
    session.add(event)
    await session.flush()
    return event


@dataclass(frozen=True)
class ChainVerification:
    """Outcome of verifying a stretch of the chain."""

    events_checked: int
    ok: bool
    first_bad_sequence: int | None = None
    reason: str | None = None


async def verify_chain(session: AsyncSession, *, start: int = 1) -> ChainVerification:
    """Recompute every hash and confirm each event binds to its predecessor.

    Detects three distinct problems, and says which:
      * a modified event (recomputed hash differs from the stored one);
      * a broken link (an event whose predecessor hash does not match);
      * a missing event (a gap in the sequence).

    A gap matters as much as a modification: deleting an inconvenient event would
    otherwise leave a chain that still verifies link-by-link.
    """
    result = await session.execute(
        select(AuditEvent).where(AuditEvent.sequence >= start).order_by(AuditEvent.sequence)
    )
    events = list(result.scalars())

    expected_previous = GENESIS_HASH
    expected_sequence = start
    if start > 1:
        prior = await session.execute(
            select(AuditEvent.event_hash).where(AuditEvent.sequence == start - 1)
        )
        found = prior.scalar_one_or_none()
        if found is None:
            return ChainVerification(0, False, start - 1, "predecessor missing")
        expected_previous = found

    for event in events:
        if event.sequence != expected_sequence:
            return ChainVerification(
                len(events), False, expected_sequence, "gap in sequence — an event was deleted"
            )
        if event.previous_event_hash != expected_previous:
            return ChainVerification(
                len(events), False, event.sequence, "broken link to predecessor"
            )
        if event.compute_hash() != event.event_hash:
            return ChainVerification(
                len(events), False, event.sequence, "event content was modified"
            )
        expected_previous = event.event_hash
        expected_sequence += 1

    return ChainVerification(len(events), True)


async def count_events(session: AsyncSession) -> int:
    result = await session.execute(select(func.count()).select_from(AuditEvent))
    return int(result.scalar_one())
