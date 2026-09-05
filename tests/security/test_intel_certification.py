"""Certification of outbound intelligence packages (master spec §28.3).

These are security tests, not unit tests, and the distinction is the point:
every assertion here is about something a package must not be able to do. A
package that leaves ATLAS is an instruction to a bank to act on a citizen's
account, and the block is what makes that instruction defensible rather than
merely delivered.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from atlas.intel.certification import (
    MAX_VALIDITY,
    Certification,
    CertificationError,
    Scope,
    canonical_bytes,
    enforce_scope,
    sign,
    validate,
    verify,
)
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

NOW = datetime(2026, 6, 1, 10, 0, tzinfo=UTC)


def certification(**overrides: object) -> Certification:
    base: dict[str, object] = {
        "requesting_officer_id": "OFF-2291",
        "requesting_jurisdiction": "DL-CYB",
        "legal_basis": "CrPC §91 production request",
        "case_reference": "CASE-2026-0914",
        "purpose": "Freeze pending verification of a suspected mule account",
        "scope": Scope(
            accounts=("ACC-4471", "ACC-8802"),
            endpoints=("EP-0783",),
            window_start=NOW - timedelta(hours=6),
            window_end=NOW + timedelta(hours=6),
        ),
        "issued_at": NOW,
        "expires_at": NOW + timedelta(hours=24),
    }
    base.update(overrides)
    return Certification(**base)  # type: ignore[arg-type]


# --------------------------------------------------------------------------
# Completeness
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "field",
    [
        "requesting_officer_id",
        "requesting_jurisdiction",
        "legal_basis",
        "case_reference",
        "purpose",
    ],
)
def test_an_incomplete_block_is_refused(field: str) -> None:
    """There is no partial certification.

    A package missing a legal basis is not a slightly weaker package; it is one
    nobody can defend. Refusing at send is cheaper than explaining at audit.
    """
    with pytest.raises(CertificationError, match="incomplete"):
        validate(certification(**{field: ""}), now=NOW)


def test_whitespace_does_not_satisfy_a_required_field() -> None:
    """A space is not a legal basis, and a form that accepts one invites it."""
    with pytest.raises(CertificationError, match="incomplete"):
        validate(certification(legal_basis="   "), now=NOW)


# --------------------------------------------------------------------------
# Scope
# --------------------------------------------------------------------------


def test_an_unscoped_package_is_refused() -> None:
    """Empty scope is invalid, not universal.

    A package naming nothing lets the recipient decide what the request covers,
    which is the opposite of proportionate.
    """
    with pytest.raises(CertificationError, match="scope names neither"):
        validate(certification(scope=Scope()), now=NOW)


def test_acting_outside_scope_is_refused() -> None:
    cert = certification()

    enforce_scope(cert, accounts=("ACC-4471",))  # in scope, no raise

    with pytest.raises(CertificationError, match="outside the package scope"):
        enforce_scope(cert, accounts=("ACC-9999",))


def test_scope_is_enforced_at_the_point_of_acting() -> None:
    """Not only at the point of sending.

    Scope checked by the sender is a promise. Checked by the recipient before it
    acts, it is a control — and the recipient is where the account actually gets
    frozen.
    """
    cert = certification()
    with pytest.raises(CertificationError, match="EP-1092"):
        enforce_scope(cert, endpoints=("EP-0783", "EP-1092"))


# --------------------------------------------------------------------------
# Expiry
# --------------------------------------------------------------------------


def test_an_expired_package_is_refused_not_marked_stale() -> None:
    """The difference between "expired" being a fact and a suggestion."""
    cert = certification(expires_at=NOW + timedelta(hours=1))

    validate(cert, now=NOW)  # still valid

    with pytest.raises(CertificationError, match="expired"):
        validate(cert, now=NOW + timedelta(hours=2))


def test_a_package_cannot_confer_standing_authority() -> None:
    """Anything beyond the maximum is standing access wearing a package's clothes."""
    with pytest.raises(CertificationError, match="exceeds"):
        validate(
            certification(expires_at=NOW + MAX_VALIDITY + timedelta(minutes=1)), now=NOW
        )


def test_a_package_born_expired_is_refused() -> None:
    with pytest.raises(CertificationError, match="not after issued_at"):
        validate(certification(expires_at=NOW - timedelta(minutes=1)), now=NOW)


# --------------------------------------------------------------------------
# Signature
# --------------------------------------------------------------------------


def test_a_signed_package_verifies() -> None:
    key = Ed25519PrivateKey.generate()
    signed = sign(certification(), key)

    verify(signed, key.public_key())  # no raise
    assert signed.signature is not None


def test_altering_any_field_breaks_the_signature() -> None:
    """The signature covers the whole block, not a summary of it."""
    key = Ed25519PrivateKey.generate()
    signed = sign(certification(), key)

    tampered = Certification(
        requesting_officer_id=signed.requesting_officer_id,
        requesting_jurisdiction=signed.requesting_jurisdiction,
        legal_basis=signed.legal_basis,
        case_reference=signed.case_reference,
        purpose=signed.purpose,
        # One account added after signing — the whole point of the mechanism.
        scope=Scope(
            accounts=(*signed.scope.accounts, "ACC-SMUGGLED"),
            endpoints=signed.scope.endpoints,
            window_start=signed.scope.window_start,
            window_end=signed.scope.window_end,
        ),
        issued_at=signed.issued_at,
        expires_at=signed.expires_at,
        signature=signed.signature,
    )

    with pytest.raises(CertificationError, match="does not verify"):
        verify(tampered, key.public_key())


def test_another_key_does_not_verify() -> None:
    signed = sign(certification(), Ed25519PrivateKey.generate())

    with pytest.raises(CertificationError, match="does not verify"):
        verify(signed, Ed25519PrivateKey.generate().public_key())


def test_an_unsigned_package_is_refused() -> None:
    with pytest.raises(CertificationError, match="unsigned"):
        verify(certification(), Ed25519PrivateKey.generate().public_key())


def test_the_canonical_form_is_order_independent() -> None:
    """Two logically identical certifications must sign to the same bytes.

    If key or tuple order changed the serialisation, a verifier that rebuilt the
    block differently would reject valid packages — and the failure would read
    as tampering rather than as a formatting difference.
    """
    a = certification(
        scope=Scope(accounts=("ACC-4471", "ACC-8802"), endpoints=("EP-0783",))
    )
    b = certification(
        scope=Scope(accounts=("ACC-8802", "ACC-4471"), endpoints=("EP-0783",))
    )

    assert canonical_bytes(a) == canonical_bytes(b)


def test_expiry_and_signature_are_separate_failures() -> None:
    """A recipient's log should be able to say which one happened.

    A correctly signed expired package and a forged current one are different
    events: one is a process problem, the other is an attack.
    """
    key = Ed25519PrivateKey.generate()
    signed = sign(certification(expires_at=NOW + timedelta(hours=1)), key)

    verify(signed, key.public_key())  # signature still holds
    with pytest.raises(CertificationError, match="expired"):
        validate(signed, now=NOW + timedelta(hours=2))
