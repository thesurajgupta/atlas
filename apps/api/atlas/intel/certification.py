"""Certification for outbound intelligence packages (master spec §28.3).

Mature national financial-intelligence systems do not let an investigator simply
message a bank. The request is **certified** by the requesting authority,
**scoped** to a stated purpose, and **audited** end to end. Certification is what
makes the request lawful; scoping is what keeps it proportionate.

Three properties this module enforces rather than documents:

**Expiry is mandatory.** A package confers time-bounded authority to act on
specific accounts, never standing access. An expired package is *refused* by the
recipient, not marked stale and processed anyway — the difference is whether
"expired" is a fact or a suggestion.

**Scope is enforced, not advisory.** A recipient may act on the accounts and
endpoints named in the package and nothing else. An unscoped package is not a
broad package; it is an invalid one.

**The signature covers a canonical serialisation.** Signing a dict as rendered
means two byte-identical packages can produce different signatures depending on
key order, and a verifier that re-serialises differently rejects a valid
package. The canonical form is defined here so both ends agree.

What this is not: a claim that ATLAS has legal authority. It carries the
authority the requesting officer asserts, records what they asserted, and makes
the assertion auditable. Whether the cited instrument actually authorises the
request is a question for a lawyer, and the block exists so that question has
something to examine.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

from atlas.core.clock import ensure_utc

#: Longest authority a single package may confer. A package is a time-boxed
#: instruction to act on named accounts; anything longer is standing access
#: wearing a package's clothes.
MAX_VALIDITY = timedelta(hours=72)


class CertificationError(ValueError):
    """A package cannot be certified, or its certification does not hold."""


@dataclass(frozen=True)
class Scope:
    """What the recipient may act on.

    Empty is invalid, not universal. A package that names nothing would let a
    recipient decide for itself what the request covers, which is the opposite
    of proportionate.
    """

    accounts: tuple[str, ...] = ()
    endpoints: tuple[str, ...] = ()
    window_start: datetime | None = None
    window_end: datetime | None = None

    def covers_account(self, account_ref: str) -> bool:
        return account_ref in self.accounts

    def covers_endpoint(self, endpoint_ref: str) -> bool:
        return endpoint_ref in self.endpoints


@dataclass(frozen=True)
class Certification:
    """The block every outbound package carries.

    Every field is required. There is no partial certification: a package
    missing a legal basis is not a slightly weaker package, it is one nobody
    can defend, and the outbound path should refuse it rather than send it with
    a gap somebody notices later.
    """

    requesting_officer_id: str
    requesting_jurisdiction: str
    legal_basis: str
    case_reference: str
    purpose: str
    scope: Scope
    issued_at: datetime
    expires_at: datetime
    signature: str | None = field(default=None)

    def is_expired(self, *, now: datetime) -> bool:
        return ensure_utc(now) >= ensure_utc(self.expires_at)

    def validity(self) -> timedelta:
        return ensure_utc(self.expires_at) - ensure_utc(self.issued_at)


def canonical_bytes(certification: Certification) -> bytes:
    """The exact bytes a signature covers.

    Sorted keys, no whitespace, ISO-8601 timestamps, tuples rendered as sorted
    lists. Two logically identical certifications must serialise identically or
    a verifier will reject packages that are in fact valid — and the failure
    would look like tampering rather than like a formatting difference.

    The signature itself is excluded, since it cannot cover itself.
    """
    payload = {
        "requesting_officer_id": certification.requesting_officer_id,
        "requesting_jurisdiction": certification.requesting_jurisdiction,
        "legal_basis": certification.legal_basis,
        "case_reference": certification.case_reference,
        "purpose": certification.purpose,
        "scope": {
            "accounts": sorted(certification.scope.accounts),
            "endpoints": sorted(certification.scope.endpoints),
            "window_start": _iso(certification.scope.window_start),
            "window_end": _iso(certification.scope.window_end),
        },
        "issued_at": _iso(certification.issued_at),
        "expires_at": _iso(certification.expires_at),
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()


def _iso(value: datetime | None) -> str | None:
    return ensure_utc(value).isoformat() if value is not None else None


def validate(certification: Certification, *, now: datetime) -> None:
    """Reject a package that cannot lawfully be sent.

    Raises rather than returning a verdict. A caller that receives a boolean can
    ignore it; a caller that receives an exception has to decide what to do, and
    the decision to send an uncertified package should be impossible to make by
    omission.
    """
    missing = [
        name
        for name, value in (
            ("requesting_officer_id", certification.requesting_officer_id),
            ("requesting_jurisdiction", certification.requesting_jurisdiction),
            ("legal_basis", certification.legal_basis),
            ("case_reference", certification.case_reference),
            ("purpose", certification.purpose),
        )
        if not value or not value.strip()
    ]
    if missing:
        raise CertificationError(
            f"certification is incomplete: {sorted(missing)}. A package without a "
            f"complete block is not a weaker request, it is an indefensible one "
            f"(spec §28.3)."
        )

    if not certification.scope.accounts and not certification.scope.endpoints:
        raise CertificationError(
            "scope names neither accounts nor endpoints. An unscoped package is "
            "not a broad package; it lets the recipient decide what the request "
            "covers, which is the opposite of proportionate."
        )

    validity = certification.validity()
    if validity <= timedelta(0):
        raise CertificationError(
            f"expires_at is not after issued_at ({validity}); a package that is "
            f"born expired confers nothing"
        )
    if validity > MAX_VALIDITY:
        raise CertificationError(
            f"validity {validity} exceeds the {MAX_VALIDITY} maximum. A package is "
            f"a time-boxed instruction; anything longer is standing access."
        )

    if certification.is_expired(now=now):
        raise CertificationError(
            f"package expired at {certification.expires_at.isoformat()}; expired "
            f"packages are refused, not processed as stale (spec §28.3)"
        )


def sign(certification: Certification, private_key: Ed25519PrivateKey) -> Certification:
    """Return the certification with a detached signature over its canonical form.

    Detached rather than embedded so the signed bytes are exactly the bytes a
    verifier reconstructs — an embedded signature has to be stripped before
    verification, and "strip it the same way both ends" is a rule that eventually
    is not followed.
    """
    signature = private_key.sign(canonical_bytes(certification))
    return Certification(
        requesting_officer_id=certification.requesting_officer_id,
        requesting_jurisdiction=certification.requesting_jurisdiction,
        legal_basis=certification.legal_basis,
        case_reference=certification.case_reference,
        purpose=certification.purpose,
        scope=certification.scope,
        issued_at=certification.issued_at,
        expires_at=certification.expires_at,
        signature=signature.hex(),
    )


def verify(certification: Certification, public_key: Ed25519PublicKey) -> None:
    """Check the signature. Raises when it does not hold.

    Does not check expiry — that is :func:`validate`'s job, and the separation
    matters: a correctly signed expired package and a forged current one are
    different failures, and a recipient's log should be able to say which.
    """
    if certification.signature is None:
        raise CertificationError("package is unsigned")
    try:
        public_key.verify(bytes.fromhex(certification.signature), canonical_bytes(certification))
    except (InvalidSignature, ValueError) as exc:
        raise CertificationError(
            "signature does not verify: the package was altered after signing, or "
            "was signed by a different key"
        ) from exc


def enforce_scope(
    certification: Certification,
    *,
    accounts: tuple[str, ...] = (),
    endpoints: tuple[str, ...] = (),
) -> None:
    """Reject an action on anything the package does not name.

    Called by the recipient adapter, not the sender. Scope enforced only at the
    point of sending is a promise; enforced at the point of acting, it is a
    control.
    """
    out_of_scope = sorted(
        [a for a in accounts if not certification.scope.covers_account(a)]
        + [e for e in endpoints if not certification.scope.covers_endpoint(e)]
    )
    if out_of_scope:
        raise CertificationError(
            f"outside the package scope: {out_of_scope}. The package authorises "
            f"action on named accounts and endpoints only (spec §28.3)."
        )
