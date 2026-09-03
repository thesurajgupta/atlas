"""JWT issuance and verification (ADR-006, master spec §29).

Short-lived access tokens with refresh rotation and reuse detection. Every token
carries a ``jti`` so an individual session can be revoked before its natural
expiry — short TTLs reduce the window but do not remove the need to kill a
compromised session immediately.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any

import jwt

from atlas.core.clock import utc_now
from atlas.core.config import get_settings
from atlas.core.errors import AuthenticationError

ALGORITHM = "HS256"
AUDIENCE = "atlas-api"
ISSUER = "atlas"


class TokenType(StrEnum):
    ACCESS = "access"  # noqa: S105 — a token *type*, not a credential
    REFRESH = "refresh"  # noqa: S105


@dataclass(frozen=True)
class TokenClaims:
    """Verified claims. Constructed only by :func:`decode_token`."""

    subject: uuid.UUID
    jti: str
    token_type: TokenType
    role: str
    jurisdiction_id: uuid.UUID
    issued_at: datetime
    expires_at: datetime
    # Present on refresh tokens: the family this token belongs to. Reuse of a
    # rotated token is detected by family, which is what makes theft visible.
    family_id: str | None = None


def _encode(payload: dict[str, Any]) -> str:
    return jwt.encode(payload, get_settings().jwt_secret, algorithm=ALGORITHM)


def issue_access_token(
    *, subject: uuid.UUID, role: str, jurisdiction_id: uuid.UUID
) -> tuple[str, TokenClaims]:
    settings = get_settings()
    now = utc_now()
    expires = now + timedelta(seconds=settings.access_token_ttl_seconds)
    jti = uuid.uuid4().hex
    payload = {
        "sub": str(subject),
        "jti": jti,
        "typ": TokenType.ACCESS.value,
        "role": role,
        "jur": str(jurisdiction_id),
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
        "aud": AUDIENCE,
        "iss": ISSUER,
    }
    claims = TokenClaims(
        subject=subject,
        jti=jti,
        token_type=TokenType.ACCESS,
        role=role,
        jurisdiction_id=jurisdiction_id,
        issued_at=now,
        expires_at=expires,
    )
    return _encode(payload), claims


def issue_refresh_token(
    *, subject: uuid.UUID, role: str, jurisdiction_id: uuid.UUID, family_id: str | None = None
) -> tuple[str, TokenClaims]:
    """Issue a refresh token.

    ``family_id`` is carried across rotations. If a token from an already-rotated
    family is presented, the whole family is revoked: the only way that happens
    is if a token was captured, so the safe response is to end every session
    descended from it rather than just rejecting the one request.
    """
    settings = get_settings()
    now = utc_now()
    expires = now + timedelta(seconds=settings.refresh_token_ttl_seconds)
    jti = uuid.uuid4().hex
    family = family_id or uuid.uuid4().hex
    payload = {
        "sub": str(subject),
        "jti": jti,
        "typ": TokenType.REFRESH.value,
        "role": role,
        "jur": str(jurisdiction_id),
        "fam": family,
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
        "aud": AUDIENCE,
        "iss": ISSUER,
    }
    claims = TokenClaims(
        subject=subject,
        jti=jti,
        token_type=TokenType.REFRESH,
        role=role,
        jurisdiction_id=jurisdiction_id,
        issued_at=now,
        expires_at=expires,
        family_id=family,
    )
    return _encode(payload), claims


def decode_token(token: str, *, expect: TokenType | None = None) -> TokenClaims:
    """Verify and decode.

    Signature, expiry, audience and issuer are all verified. ``expect`` pins the
    token type: without it, a refresh token would be accepted wherever an access
    token is, which converts a long-lived credential into an API key.
    """
    try:
        payload = jwt.decode(
            token,
            get_settings().jwt_secret,
            algorithms=[ALGORITHM],
            audience=AUDIENCE,
            issuer=ISSUER,
            options={"require": ["exp", "iat", "sub", "jti", "aud", "iss"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AuthenticationError("token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthenticationError("invalid token") from exc

    try:
        token_type = TokenType(payload["typ"])
    except (KeyError, ValueError) as exc:
        raise AuthenticationError("token has no usable type") from exc

    if expect is not None and token_type is not expect:
        raise AuthenticationError(f"expected {expect.value} token, got {token_type.value}")

    return TokenClaims(
        subject=uuid.UUID(payload["sub"]),
        jti=payload["jti"],
        token_type=token_type,
        role=payload["role"],
        jurisdiction_id=uuid.UUID(payload["jur"]),
        issued_at=datetime.fromtimestamp(payload["iat"], tz=UTC),
        expires_at=datetime.fromtimestamp(payload["exp"], tz=UTC),
        family_id=payload.get("fam"),
    )
