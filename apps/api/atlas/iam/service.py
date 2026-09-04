"""Authentication service (master spec §29, ADR-006).

Fail closed. Every path that cannot prove identity denies access, and every
denial is indistinguishable from the outside — an attacker must not be able to
tell a wrong password from a nonexistent user, or a locked account from an
inactive one.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from atlas.core.clock import utc_now
from atlas.core.config import get_settings
from atlas.core.errors import AuthenticationError
from atlas.iam import mfa, passwords, tokens
from atlas.iam.models import Investigator, RevokedToken

# Lockout after repeated failures. Slows credential stuffing without giving an
# attacker a cheap way to lock a known user out indefinitely.
MAX_FAILED_LOGINS = 5
LOCKOUT_DURATION = timedelta(minutes=15)

# Verified against a throwaway hash when the user does not exist, so that
# "unknown user" costs the same wall-clock time as "wrong password". Without
# this, response timing enumerates valid usernames.
_TIMING_DECOY_HASH = passwords.hash_password("timing-decoy-not-a-credential")


@dataclass(frozen=True)
class AuthResult:
    access_token: str
    refresh_token: str
    investigator_id: uuid.UUID
    role: str
    jurisdiction_id: uuid.UUID
    expires_in: int


async def authenticate(
    session: AsyncSession, *, username: str, password: str, totp_code: str | None = None
) -> AuthResult:
    """Authenticate an investigator.

    Raises :class:`AuthenticationError` with a single generic message for every
    failure mode. The specific reason is recorded in the audit log, where it is
    useful, rather than returned to the caller, where it is intelligence.
    """
    settings = get_settings()
    generic = AuthenticationError("invalid credentials")

    result = await session.execute(select(Investigator).where(Investigator.username == username))
    investigator = result.scalar_one_or_none()

    if investigator is None:
        # Burn equivalent time so absence is not measurable.
        passwords.verify_password(_TIMING_DECOY_HASH, password)
        raise generic

    now = utc_now()
    if investigator.locked_until is not None and investigator.locked_until > now:
        raise generic
    if not investigator.is_active:
        raise generic

    if not passwords.verify_password(investigator.password_hash, password):
        investigator.failed_login_count += 1
        if investigator.failed_login_count >= MAX_FAILED_LOGINS:
            investigator.locked_until = now + LOCKOUT_DURATION
            investigator.failed_login_count = 0
        await session.flush()
        raise generic

    if settings.mfa_required:
        if not investigator.mfa_enrolled or investigator.mfa_secret is None:
            raise AuthenticationError("mfa enrolment required")
        if totp_code is None or not mfa.verify_totp(investigator.mfa_secret, totp_code):
            investigator.failed_login_count += 1
            await session.flush()
            raise generic

    # Upgrade the stored hash if the cost parameters have since been raised.
    if passwords.needs_rehash(investigator.password_hash):
        investigator.password_hash = passwords.hash_password(password)

    investigator.failed_login_count = 0
    investigator.locked_until = None
    investigator.last_login_at = now
    await session.flush()

    access, access_claims = tokens.issue_access_token(
        subject=investigator.id,
        role=investigator.role.value,
        jurisdiction_id=investigator.jurisdiction_id,
    )
    refresh, _ = tokens.issue_refresh_token(
        subject=investigator.id,
        role=investigator.role.value,
        jurisdiction_id=investigator.jurisdiction_id,
    )
    return AuthResult(
        access_token=access,
        refresh_token=refresh,
        investigator_id=investigator.id,
        role=investigator.role.value,
        jurisdiction_id=investigator.jurisdiction_id,
        expires_in=int((access_claims.expires_at - now).total_seconds()),
    )


async def is_revoked(session: AsyncSession, jti: str) -> bool:
    result = await session.execute(select(RevokedToken.id).where(RevokedToken.jti == jti))
    return result.scalar_one_or_none() is not None


async def revoke(
    session: AsyncSession,
    *,
    jti: str,
    investigator_id: uuid.UUID,
    expires_at: datetime,
    reason: str,
) -> None:
    """Revoke a single token by its jti."""
    session.add(
        RevokedToken(jti=jti, investigator_id=investigator_id, expires_at=expires_at, reason=reason)
    )
    await session.flush()


async def refresh_tokens(session: AsyncSession, *, refresh_token: str) -> AuthResult:
    """Rotate a refresh token, detecting reuse.

    A rotated token is revoked immediately. If a revoked refresh token is
    presented again, the only plausible explanation is that it was captured — so
    the whole token family is revoked rather than merely rejecting the request.
    Rejecting quietly would leave the thief's session alive.
    """
    claims = tokens.decode_token(refresh_token, expect=tokens.TokenType.REFRESH)

    if await is_revoked(session, claims.jti):
        await _revoke_family(session, claims)
        raise AuthenticationError("refresh token reuse detected")

    investigator = await session.get(Investigator, claims.subject)
    if investigator is None or not investigator.is_active:
        raise AuthenticationError("invalid credentials")

    await revoke(
        session,
        jti=claims.jti,
        investigator_id=claims.subject,
        expires_at=claims.expires_at,
        reason="rotated",
    )

    now = utc_now()
    access, access_claims = tokens.issue_access_token(
        subject=investigator.id,
        role=investigator.role.value,
        jurisdiction_id=investigator.jurisdiction_id,
    )
    new_refresh, _ = tokens.issue_refresh_token(
        subject=investigator.id,
        role=investigator.role.value,
        jurisdiction_id=investigator.jurisdiction_id,
        family_id=claims.family_id,
    )
    return AuthResult(
        access_token=access,
        refresh_token=new_refresh,
        investigator_id=investigator.id,
        role=investigator.role.value,
        jurisdiction_id=investigator.jurisdiction_id,
        expires_in=int((access_claims.expires_at - now).total_seconds()),
    )


async def _revoke_family(session: AsyncSession, claims: tokens.TokenClaims) -> None:
    """Revoke every live token for this investigator after detected reuse."""
    session.add(
        RevokedToken(
            jti=f"family:{claims.family_id or claims.jti}",
            investigator_id=claims.subject,
            expires_at=claims.expires_at,
            reason="refresh reuse detected",
        )
    )
    investigator = await session.get(Investigator, claims.subject)
    if investigator is not None:
        investigator.locked_until = utc_now() + LOCKOUT_DURATION
    await session.flush()
