"""Password hashing and TOTP behaviour (ADR-006)."""

from __future__ import annotations

from atlas.iam import mfa, passwords


def test_hash_is_salted_so_identical_passwords_differ() -> None:
    """Without a per-hash salt, identical passwords are visibly identical."""
    assert passwords.hash_password("same") != passwords.hash_password("same")


def test_verify_accepts_correct_and_rejects_wrong() -> None:
    stored = passwords.hash_password("correct-horse-battery-staple")
    assert passwords.verify_password(stored, "correct-horse-battery-staple") is True
    assert passwords.verify_password(stored, "wrong") is False


def test_verify_returns_false_on_malformed_hash_rather_than_raising() -> None:
    """A raised exception would let callers distinguish failure modes."""
    assert passwords.verify_password("not-a-hash", "anything") is False


def test_plaintext_never_appears_in_the_hash() -> None:
    assert "hunter2" not in passwords.hash_password("hunter2")


def test_totp_round_trip() -> None:
    import pyotp

    secret = mfa.generate_secret()
    assert mfa.verify_totp(secret, pyotp.TOTP(secret).now()) is True


def test_totp_rejects_malformed_codes() -> None:
    secret = mfa.generate_secret()
    for bad in ("", "12345", "1234567", "abcdef", "12 345"):
        assert mfa.verify_totp(secret, bad) is False


def test_totp_rejects_a_code_from_a_different_secret() -> None:
    import pyotp

    assert (
        mfa.verify_totp(mfa.generate_secret(), pyotp.TOTP(mfa.generate_secret()).now())
        is False
    )


def test_recovery_codes_are_unique() -> None:
    codes = mfa.generate_recovery_codes(8)
    assert len(set(codes)) == 8
