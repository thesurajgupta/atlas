"""TOTP multi-factor authentication (ADR-006, master spec §29)."""

from __future__ import annotations

import secrets

import pyotp

ISSUER = "ATLAS"

# One step of drift either side, to tolerate clock skew between the server and
# an investigator's phone. Wider windows meaningfully increase the value of a
# stolen code, so this stays at one.
VALID_WINDOW = 1


def generate_secret() -> str:
    """A fresh base32 TOTP secret."""
    return pyotp.random_base32()


def provisioning_uri(secret: str, username: str) -> str:
    """otpauth:// URI for enrolment via an authenticator app."""
    return pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=ISSUER)


def verify_totp(secret: str, code: str) -> bool:
    """Verify a 6-digit code.

    ``pyotp`` compares in constant time internally. The explicit length check
    first avoids doing any work on obviously malformed input.
    """
    if not code or not code.isdigit() or len(code) != 6:
        return False
    return bool(pyotp.TOTP(secret).verify(code, valid_window=VALID_WINDOW))


def generate_recovery_codes(count: int = 8) -> list[str]:
    """Single-use recovery codes for a lost authenticator.

    Stored hashed, never in plaintext — they are password-equivalent. Returned
    once at enrolment and never retrievable again.
    """
    return [f"{secrets.token_hex(4)}-{secrets.token_hex(4)}" for _ in range(count)]
