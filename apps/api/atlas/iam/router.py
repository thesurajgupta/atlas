"""Authentication endpoints (master spec §29, §35)."""

from __future__ import annotations

import pyotp
from fastapi import APIRouter, Request, status
from sqlalchemy import select

from atlas.audit.service import Actor, AuditRequest, record
from atlas.core import context
from atlas.core.config import Environment, get_settings
from atlas.core.errors import NotFoundError
from atlas.iam import service
from atlas.iam.dependencies import CurrentInvestigator, SessionDep
from atlas.iam.models import Investigator
from atlas.iam.schemas import (
    DemoLoginRequest,
    InvestigatorProfile,
    LoginRequest,
    RefreshRequest,
    TokenResponse,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _client_actor(request: Request, **overrides: object) -> Actor:
    return Actor(
        source_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:256] or None,
        **overrides,  # type: ignore[arg-type]
    )


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, request: Request, session: SessionDep) -> TokenResponse:
    """Authenticate and issue tokens.

    Both outcomes are audited. A failed login is arguably the more valuable
    record — a run of them is what credential stuffing looks like from the
    inside, and without the record nobody would see it.

    The audit detail deliberately carries the username but never the password or
    the TOTP code; `record()` redacts those keys regardless, so an added field
    cannot leak one by accident later.
    """
    try:
        result = await service.authenticate(
            session,
            username=payload.username,
            password=payload.password,
            totp_code=payload.totp_code,
        )
    except Exception:
        await record(
            session,
            AuditRequest(
                action="auth.login",
                resource_type="session",
                result="denied",
                correlation_id=context.get_correlation_id(),
                detail={"username": payload.username},
            ),
            _client_actor(request),
        )
        # Committed separately: the failure record must survive even though the
        # request itself errors out and the surrounding transaction unwinds.
        await session.commit()
        raise

    await record(
        session,
        AuditRequest(
            action="auth.login",
            resource_type="session",
            resource_id=str(result.investigator_id),
            result="allowed",
            correlation_id=context.get_correlation_id(),
            detail={"username": payload.username},
        ),
        _client_actor(request, id=result.investigator_id, role=result.role),
    )
    return TokenResponse(
        access_token=result.access_token,
        refresh_token=result.refresh_token,
        expires_in=result.expires_in,
    )


#: The only accounts `demo-login` will act for. An allow-list rather than a
#: pattern: "any username starting with demo." is a rule somebody satisfies by
#: accident, and this endpoint must never act for an account it was not built
#: for.
_DEMO_ACCOUNTS = frozenset({"demo.investigator", "demo.auditor"})


@router.post("/demo-login", response_model=TokenResponse)
async def demo_login(
    payload: DemoLoginRequest, request: Request, session: SessionDep
) -> TokenResponse:
    """Sign in as a seeded demo account without typing a TOTP code.

    **This is not an authentication bypass, and the distinction is the whole
    design.** The real :func:`service.authenticate` still runs: the password is
    still verified with argon2id, the TOTP is still verified, the account lockout
    still applies, and the login is audited like any other. The only thing that
    changes is *who computes the second factor* — the server generates the
    current code from the account's own secret instead of a human copying six
    digits before they expire.

    A code that expires mid-typing is real friction during a demo, and the
    tempting fix is to drop MFA in development. That would be worse than it
    looks: jurisdiction scoping and every audit row's actor both derive from the
    authenticated identity, so an unauthenticated mode would not be the same
    product with a step removed — it would be a different one where the controls
    cannot be demonstrated at all.

    Three gates, all of which must hold:

    * **development only.** Anywhere else this is a 404, exactly as if the route
      did not exist, so its presence is not discoverable in a deployed
      environment.
    * **allow-listed accounts only**, and the list is explicit rather than a
      pattern.
    * **the account must already be seeded.** This creates nothing.

    The password is *not* held here. The caller still sends it and it is still
    verified — an endpoint that knew a working password would be a credential in
    the source tree, which is what it exists to avoid.
    """
    if get_settings().env is not Environment.DEVELOPMENT:
        # 404 rather than 403: a 403 would confirm the endpoint exists, and the
        # first thing worth knowing about a convenience route is nothing at all.
        raise NotFoundError("not found")

    if payload.username not in _DEMO_ACCOUNTS:
        raise NotFoundError("not found")

    investigator = await session.scalar(
        select(Investigator).where(Investigator.username == payload.username)
    )
    if investigator is None or investigator.mfa_secret is None:
        raise NotFoundError("not found")

    # The second factor, computed rather than typed. Everything else below is
    # the ordinary login path.
    return await login(
        LoginRequest(
            username=payload.username,
            password=payload.password,
            totp_code=pyotp.TOTP(investigator.mfa_secret).now(),
        ),
        request,
        session,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest, request: Request, session: SessionDep) -> TokenResponse:
    """Rotate a refresh token.

    Reuse of an already-rotated token means it was captured. The service revokes
    the whole family and locks the account; here we make sure that event is
    recorded, because it is a security incident rather than a failed request.
    """
    try:
        result = await service.refresh_tokens(session, refresh_token=payload.refresh_token)
    except Exception as exc:
        await record(
            session,
            AuditRequest(
                action="auth.refresh",
                resource_type="session",
                result="denied",
                correlation_id=context.get_correlation_id(),
                detail={"reason": type(exc).__name__},
            ),
            _client_actor(request),
        )
        await session.commit()
        raise

    return TokenResponse(
        access_token=result.access_token,
        refresh_token=result.refresh_token,
        expires_in=result.expires_in,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, session: SessionDep, investigator: CurrentInvestigator) -> None:
    """Revoke the caller's current access token.

    Short token lifetimes shrink the window but do not remove the need for this:
    a compromised session has to be killable now, not in fifteen minutes.
    """
    actor = context.get_actor()
    if actor is not None:
        from datetime import timedelta

        from atlas.core.clock import utc_now

        await service.revoke(
            session,
            jti=actor.token_jti,
            investigator_id=investigator.id,
            expires_at=utc_now() + timedelta(days=1),
            reason="logout",
        )
    await record(
        session,
        AuditRequest(
            action="auth.logout",
            resource_type="session",
            resource_id=str(investigator.id),
            result="allowed",
            correlation_id=context.get_correlation_id(),
        ),
        _client_actor(request, id=investigator.id, role=investigator.role.value),
    )


@router.get("/me", response_model=InvestigatorProfile)
async def me(investigator: CurrentInvestigator) -> InvestigatorProfile:
    """The caller's own identity. Returns no one else's record."""
    return InvestigatorProfile(
        id=investigator.id,
        username=investigator.username,
        display_name=investigator.display_name,
        role=investigator.role.value,
        jurisdiction_id=investigator.jurisdiction_id,
        mfa_enrolled=investigator.mfa_enrolled,
    )
