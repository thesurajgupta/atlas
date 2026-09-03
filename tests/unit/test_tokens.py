"""JWT issuance and verification (ADR-006)."""

from __future__ import annotations

import uuid

import jwt
import pytest
from atlas.core.config import get_settings
from atlas.core.errors import AuthenticationError
from atlas.iam import tokens

SUBJECT = uuid.uuid4()
JURISDICTION = uuid.uuid4()


def _access() -> tuple[str, tokens.TokenClaims]:
    return tokens.issue_access_token(
        subject=SUBJECT, role="DISTRICT_INVESTIGATOR", jurisdiction_id=JURISDICTION
    )


def test_access_token_round_trip() -> None:
    token, claims = _access()
    decoded = tokens.decode_token(token, expect=tokens.TokenType.ACCESS)
    assert decoded.subject == SUBJECT
    assert decoded.jurisdiction_id == JURISDICTION
    assert decoded.jti == claims.jti


def test_refresh_token_cannot_be_used_as_an_access_token() -> None:
    """Otherwise a long-lived credential becomes a permanent API key."""
    refresh, _ = tokens.issue_refresh_token(
        subject=SUBJECT, role="STATE_ANALYST", jurisdiction_id=JURISDICTION
    )
    with pytest.raises(AuthenticationError):
        tokens.decode_token(refresh, expect=tokens.TokenType.ACCESS)


def test_tampered_signature_is_rejected() -> None:
    token, _ = _access()
    head, payload, _ = token.split(".")
    with pytest.raises(AuthenticationError):
        tokens.decode_token(f"{head}.{payload}.forged", expect=tokens.TokenType.ACCESS)


@pytest.mark.filterwarnings("ignore::jwt.warnings.InsecureKeyLengthWarning")
def test_token_signed_with_another_key_is_rejected() -> None:
    """The signature must be what authenticates, not the payload shape.

    The attacker key is deliberately short; the warning that provokes is scoped
    here rather than silenced globally, so a real one still gets noticed.
    """
    forged = jwt.encode(
        {
            "sub": str(SUBJECT),
            "jti": "x",
            "typ": "access",
            "role": "SUPER_ADMIN",
            "jur": str(JURISDICTION),
            "iat": 1,
            "exp": 9999999999,
            "aud": tokens.AUDIENCE,
            "iss": tokens.ISSUER,
        },
        "an-attacker-chosen-key",
        algorithm="HS256",
    )
    with pytest.raises(AuthenticationError):
        tokens.decode_token(forged, expect=tokens.TokenType.ACCESS)


def test_alg_none_is_rejected() -> None:
    """The classic JWT bypass: strip the signature by declaring alg=none."""
    forged = jwt.encode(
        {
            "sub": str(SUBJECT),
            "jti": "x",
            "typ": "access",
            "role": "SUPER_ADMIN",
            "jur": str(JURISDICTION),
            "iat": 1,
            "exp": 9999999999,
            "aud": tokens.AUDIENCE,
            "iss": tokens.ISSUER,
        },
        key="",
        algorithm="none",
    )
    with pytest.raises(AuthenticationError):
        tokens.decode_token(forged, expect=tokens.TokenType.ACCESS)


def test_expired_token_is_rejected() -> None:
    settings = get_settings()
    expired = jwt.encode(
        {
            "sub": str(SUBJECT),
            "jti": "x",
            "typ": "access",
            "role": "AUDITOR",
            "jur": str(JURISDICTION),
            "iat": 1,
            "exp": 2,
            "aud": tokens.AUDIENCE,
            "iss": tokens.ISSUER,
        },
        settings.jwt_secret,
        algorithm="HS256",
    )
    with pytest.raises(AuthenticationError, match="expired"):
        tokens.decode_token(expired, expect=tokens.TokenType.ACCESS)


def test_wrong_audience_is_rejected() -> None:
    """Stops a token minted for another service being replayed at ours."""
    settings = get_settings()
    other = jwt.encode(
        {
            "sub": str(SUBJECT),
            "jti": "x",
            "typ": "access",
            "role": "AUDITOR",
            "jur": str(JURISDICTION),
            "iat": 1,
            "exp": 9999999999,
            "aud": "some-other-service",
            "iss": tokens.ISSUER,
        },
        settings.jwt_secret,
        algorithm="HS256",
    )
    with pytest.raises(AuthenticationError):
        tokens.decode_token(other, expect=tokens.TokenType.ACCESS)


def test_every_token_has_a_unique_jti() -> None:
    """Revocation is per-token, so jti collisions would revoke the wrong session."""
    assert len({_access()[1].jti for _ in range(50)}) == 50


def test_refresh_rotation_preserves_the_family() -> None:
    _, first = tokens.issue_refresh_token(
        subject=SUBJECT, role="STATE_ANALYST", jurisdiction_id=JURISDICTION
    )
    _, rotated = tokens.issue_refresh_token(
        subject=SUBJECT,
        role="STATE_ANALYST",
        jurisdiction_id=JURISDICTION,
        family_id=first.family_id,
    )
    assert rotated.family_id == first.family_id
    assert rotated.jti != first.jti
