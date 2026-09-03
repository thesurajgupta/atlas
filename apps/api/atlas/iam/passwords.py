"""Password hashing and verification (ADR-006).

argon2id, with parameters chosen for an interactive login rather than a
throughput-oriented service. Verification is deliberately slow — that is the
control.
"""

from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

# OWASP's argon2id guidance (2024): 19 MiB memory, 2 iterations, 1 lane.
# Memory cost matters more than time cost against GPU attack.
_hasher = PasswordHasher(memory_cost=19456, time_cost=2, parallelism=1, hash_len=32, salt_len=16)


def hash_password(password: str) -> str:
    """Return an argon2id verifier. The plaintext is never stored or logged."""
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    """Constant-time-ish verification that never raises on a wrong password.

    Returning ``False`` rather than propagating means callers cannot accidentally
    distinguish "wrong password" from "malformed hash" through exception type —
    a distinction that leaks whether an account exists.
    """
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    """Whether a stored hash uses outdated parameters.

    Checked on successful login so that raising the cost factor upgrades existing
    accounts transparently, instead of leaving old users on weak parameters
    forever.
    """
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True
