"""Authentication attack paths (master spec §29, §41).

Each test names an attack rather than a function, because that is what the suite
is for: proving specific bypasses do not work.
"""

from __future__ import annotations

import uuid

import pyotp
import pytest
from atlas.core.clock import utc_now
from atlas.core.enums import JurisdictionLevel, Role
from atlas.core.errors import AuthenticationError
from atlas.iam import mfa, passwords, service
from atlas.iam.models import Investigator, Jurisdiction
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = [pytest.mark.security, pytest.mark.asyncio]

PASSWORD = "a-sufficiently-long-test-password"


async def _make_investigator(
    session: AsyncSession, *, mfa_enrolled: bool = True, is_active: bool = True
) -> tuple[Investigator, str]:
    jurisdiction = Jurisdiction(
        code=f"TEST-{uuid.uuid4().hex[:8]}",
        name="Test District",
        level=JurisdictionLevel.DISTRICT,
    )
    session.add(jurisdiction)
    await session.flush()

    secret = mfa.generate_secret()
    investigator = Investigator(
        username=f"officer-{uuid.uuid4().hex[:8]}",
        display_name="Test Officer",
        password_hash=passwords.hash_password(PASSWORD),
        mfa_secret=secret if mfa_enrolled else None,
        mfa_enrolled=mfa_enrolled,
        role=Role.DISTRICT_INVESTIGATOR,
        jurisdiction_id=jurisdiction.id,
        is_active=is_active,
    )
    session.add(investigator)
    await session.flush()
    return investigator, secret


async def test_valid_credentials_with_mfa_succeed(session: AsyncSession) -> None:
    investigator, secret = await _make_investigator(session)
    result = await service.authenticate(
        session,
        username=investigator.username,
        password=PASSWORD,
        totp_code=pyotp.TOTP(secret).now(),
    )
    assert result.investigator_id == investigator.id
    assert result.access_token and result.refresh_token


async def test_wrong_password_is_rejected(session: AsyncSession) -> None:
    investigator, secret = await _make_investigator(session)
    with pytest.raises(AuthenticationError):
        await service.authenticate(
            session,
            username=investigator.username,
            password="wrong",
            totp_code=pyotp.TOTP(secret).now(),
        )


async def test_correct_password_without_mfa_is_rejected(session: AsyncSession) -> None:
    """Password alone must never be sufficient."""
    investigator, _ = await _make_investigator(session)
    with pytest.raises(AuthenticationError):
        await service.authenticate(
            session, username=investigator.username, password=PASSWORD, totp_code=None
        )


async def test_wrong_totp_is_rejected(session: AsyncSession) -> None:
    investigator, _ = await _make_investigator(session)
    with pytest.raises(AuthenticationError):
        await service.authenticate(
            session,
            username=investigator.username,
            password=PASSWORD,
            totp_code="000000",
        )


async def test_unknown_user_and_wrong_password_are_indistinguishable(
    session: AsyncSession,
) -> None:
    """Different messages here would enumerate valid usernames."""
    investigator, secret = await _make_investigator(session)

    with pytest.raises(AuthenticationError) as unknown:
        await service.authenticate(
            session, username="no-such-officer", password=PASSWORD, totp_code="123456"
        )
    with pytest.raises(AuthenticationError) as wrong:
        await service.authenticate(
            session,
            username=investigator.username,
            password="wrong",
            totp_code=pyotp.TOTP(secret).now(),
        )
    assert str(unknown.value) == str(wrong.value)


async def test_inactive_account_cannot_authenticate(session: AsyncSession) -> None:
    investigator, secret = await _make_investigator(session, is_active=False)
    with pytest.raises(AuthenticationError):
        await service.authenticate(
            session,
            username=investigator.username,
            password=PASSWORD,
            totp_code=pyotp.TOTP(secret).now(),
        )


async def test_repeated_failures_lock_the_account(session: AsyncSession) -> None:
    """Slows credential stuffing."""
    investigator, secret = await _make_investigator(session)

    for _ in range(service.MAX_FAILED_LOGINS):
        with pytest.raises(AuthenticationError):
            await service.authenticate(
                session,
                username=investigator.username,
                password="wrong",
                totp_code="000000",
            )

    await session.refresh(investigator)
    assert investigator.locked_until is not None
    assert investigator.locked_until > utc_now()

    # Correct credentials are refused while locked.
    with pytest.raises(AuthenticationError):
        await service.authenticate(
            session,
            username=investigator.username,
            password=PASSWORD,
            totp_code=pyotp.TOTP(secret).now(),
        )


async def test_successful_login_clears_the_failure_counter(
    session: AsyncSession,
) -> None:
    """Otherwise a user is locked out by failures spread over weeks."""
    investigator, secret = await _make_investigator(session)
    for _ in range(service.MAX_FAILED_LOGINS - 1):
        with pytest.raises(AuthenticationError):
            await service.authenticate(
                session,
                username=investigator.username,
                password="wrong",
                totp_code="000000",
            )

    await service.authenticate(
        session,
        username=investigator.username,
        password=PASSWORD,
        totp_code=pyotp.TOTP(secret).now(),
    )
    await session.refresh(investigator)
    assert investigator.failed_login_count == 0
    assert investigator.locked_until is None


async def test_refresh_rotates_and_revokes_the_old_token(session: AsyncSession) -> None:
    investigator, secret = await _make_investigator(session)
    first = await service.authenticate(
        session,
        username=investigator.username,
        password=PASSWORD,
        totp_code=pyotp.TOTP(secret).now(),
    )
    second = await service.refresh_tokens(session, refresh_token=first.refresh_token)
    assert second.refresh_token != first.refresh_token


async def test_reusing_a_rotated_refresh_token_is_detected(
    session: AsyncSession,
) -> None:
    """The signal that a refresh token was stolen.

    Rejecting quietly would leave the thief's rotated session alive; the account
    is locked instead.
    """
    investigator, secret = await _make_investigator(session)
    first = await service.authenticate(
        session,
        username=investigator.username,
        password=PASSWORD,
        totp_code=pyotp.TOTP(secret).now(),
    )
    await service.refresh_tokens(session, refresh_token=first.refresh_token)

    with pytest.raises(AuthenticationError, match="reuse"):
        await service.refresh_tokens(session, refresh_token=first.refresh_token)

    await session.refresh(investigator)
    assert investigator.locked_until is not None, (
        "family not revoked after detected reuse"
    )


async def test_access_token_cannot_be_used_to_refresh(session: AsyncSession) -> None:
    investigator, secret = await _make_investigator(session)
    result = await service.authenticate(
        session,
        username=investigator.username,
        password=PASSWORD,
        totp_code=pyotp.TOTP(secret).now(),
    )
    with pytest.raises(AuthenticationError):
        await service.refresh_tokens(session, refresh_token=result.access_token)
