"""FastAPI dependencies for authentication (master spec §29)."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from atlas.core import context
from atlas.core.database import get_session
from atlas.core.errors import AuthenticationError
from atlas.iam import service, tokens
from atlas.iam.models import Investigator

# auto_error=False so a missing header raises our own AuthenticationError with a
# correlation id, rather than Starlette's bare 403 with no traceable context.
_bearer = HTTPBearer(auto_error=False)

SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def get_current_investigator(
    request: Request,
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
) -> Investigator:
    """Resolve and validate the caller.

    Four things are checked, and the order matters — cheapest and most decisive
    first, so an invalid token never reaches the database:

      1. a bearer token is present;
      2. it verifies, is unexpired, and is an *access* token specifically;
      3. its jti has not been revoked;
      4. the investigator still exists and is active.

    Step 4 is what makes deactivation take effect immediately rather than at
    token expiry.
    """
    if credentials is None or not credentials.credentials:
        raise AuthenticationError("no bearer token supplied")

    claims = tokens.decode_token(credentials.credentials, expect=tokens.TokenType.ACCESS)

    if await service.is_revoked(session, claims.jti):
        raise AuthenticationError("token revoked")

    investigator = await session.get(Investigator, claims.subject)
    if investigator is None or not investigator.is_active:
        raise AuthenticationError("investigator not active")

    context.set_actor(
        context.RequestActor(
            id=investigator.id,
            role=investigator.role.value,
            jurisdiction_id=investigator.jurisdiction_id,
            token_jti=claims.jti,
        )
    )
    return investigator


CurrentInvestigator = Annotated[Investigator, Depends(get_current_investigator)]
