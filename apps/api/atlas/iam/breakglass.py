"""Break-glass access (master spec §29).

Emergencies are real. Unlogged emergencies are not.

A grant widens an investigator's jurisdiction scope to national for a bounded
period. Four properties make that acceptable rather than a backdoor:

  * it expires on its own, so nobody has to remember to revoke it;
  * it requires a written justification, stored and audited;
  * it names a second party who was notified, so it is never silent;
  * every use of it is marked in the audit trail, not just the grant itself.

The last one matters most. A grant that is audited once, then used invisibly for
an hour, tells you almost nothing after the fact.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from atlas.core.clock import utc_now
from atlas.core.config import get_settings
from atlas.core.errors import ValidationError
from atlas.iam.models import BreakGlassGrant

MIN_JUSTIFICATION_LENGTH = 20


async def grant(
    session: AsyncSession,
    *,
    investigator_id: uuid.UUID,
    justification: str,
    granted_by_id: uuid.UUID,
    notified_party_id: uuid.UUID | None = None,
) -> BreakGlassGrant:
    """Open a time-boxed grant.

    The justification minimum is deliberate. "urgent" is not a reason, and a
    field that accepts it produces an audit trail that cannot be reviewed later.
    """
    reason = justification.strip()
    if len(reason) < MIN_JUSTIFICATION_LENGTH:
        raise ValidationError(
            f"justification must be at least {MIN_JUSTIFICATION_LENGTH} characters; "
            f"it is read during review and 'urgent' is not a reason"
        )
    if investigator_id == granted_by_id:
        raise ValidationError("break-glass cannot be self-granted")

    record = BreakGlassGrant(
        investigator_id=investigator_id,
        justification=reason,
        granted_by_id=granted_by_id,
        notified_party_id=notified_party_id,
        expires_at=utc_now() + timedelta(seconds=get_settings().break_glass_ttl_seconds),
    )
    session.add(record)
    await session.flush()
    return record


async def active_grant(session: AsyncSession, investigator_id: uuid.UUID) -> BreakGlassGrant | None:
    """The caller's live grant, if any."""
    now = utc_now()
    result = await session.execute(
        select(BreakGlassGrant)
        .where(
            BreakGlassGrant.investigator_id == investigator_id,
            BreakGlassGrant.expires_at > now,
            BreakGlassGrant.revoked_at.is_(None),
        )
        .order_by(BreakGlassGrant.expires_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def revoke(session: AsyncSession, grant_id: uuid.UUID) -> None:
    record = await session.get(BreakGlassGrant, grant_id)
    if record is not None and record.revoked_at is None:
        record.revoked_at = utc_now()
        await session.flush()
