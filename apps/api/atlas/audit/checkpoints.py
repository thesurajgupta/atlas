"""Signed chain checkpoints (ADR-007, master spec §32.1).

A hash chain alone is not tamper-evidence. An administrator with UPDATE rights
can alter an event and recompute every subsequent hash; the chain would verify
perfectly afterwards. Insider misuse is explicitly in our threat model, so that
matters.

Periodically signing the chain head with a key held **outside the application
database** closes it. Rewriting history now requires forging a signature, not
merely writing to a table. Checkpoints are the reason we may say
*tamper-evident* — and still may not say "immutable" or "legal chain of custody".
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from atlas.audit.models import AuditCheckpoint, AuditEvent
from atlas.audit.service import chain_head
from atlas.core.clock import utc_now

ALGORITHM = "Ed25519"


class SigningKeyError(RuntimeError):
    """The signing key is missing, unreadable, or of the wrong type."""


@dataclass(frozen=True)
class KeyRef:
    """A signing key and the identifier recorded alongside its signatures.

    ``key_id`` is stored on every checkpoint so signatures remain verifiable
    across key rotation — without it, rotating the key would invalidate every
    historical checkpoint and destroy the evidence it exists to protect.
    """

    key_id: str
    # A type annotation, not a value. The private key is never a literal in this
    # repository; in production it lives in a KMS/HSM and never enters memory here.
    private_key: Ed25519PrivateKey | None  # gitleaks:allow
    public_key: Ed25519PublicKey


def load_signing_key(path: Path, *, key_id: str) -> KeyRef:
    """Load an Ed25519 private key from disk.

    Development only. In production this is a KMS/HSM reference and the private
    key never reaches application memory — which is the entire point of holding
    it outside the database.
    """
    if not path.exists():
        raise SigningKeyError(f"signing key not found at {path}")
    try:
        key = serialization.load_pem_private_key(path.read_bytes(), password=None)
    except (ValueError, TypeError) as exc:
        raise SigningKeyError(f"could not read signing key at {path}") from exc
    if not isinstance(key, Ed25519PrivateKey):
        raise SigningKeyError(f"expected an Ed25519 key at {path}, got {type(key).__name__}")
    return KeyRef(key_id=key_id, private_key=key, public_key=key.public_key())


def generate_signing_key(path: Path, *, key_id: str) -> KeyRef:
    """Create a development signing key. Never used in production."""
    key = Ed25519PrivateKey.generate()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    path.chmod(0o600)
    return KeyRef(key_id=key_id, private_key=key, public_key=key.public_key())


async def create_checkpoint(session: AsyncSession, key: KeyRef) -> AuditCheckpoint | None:
    """Sign the current chain head.

    Returns ``None`` when the chain is empty — there is nothing to attest to, and
    a checkpoint over zero events would be a signature asserting nothing.
    """
    if key.private_key is None:
        raise SigningKeyError("no private key available for signing")

    sequence, head_hash = await chain_head(session)
    if sequence == 0:
        return None

    event = await session.execute(select(AuditEvent).where(AuditEvent.sequence == sequence))
    head_event = event.scalar_one()

    checkpoint = AuditCheckpoint(
        created_at=utc_now(),
        sequence=sequence,
        chain_head_hash=head_hash,
        signature="",
        key_id=key.key_id,
        algorithm=ALGORITHM,
        event_id=head_event.id,
    )
    checkpoint.signature = key.private_key.sign(checkpoint.signing_payload()).hex()
    session.add(checkpoint)
    await session.flush()
    return checkpoint


def verify_checkpoint(checkpoint: AuditCheckpoint, public_key: Ed25519PublicKey) -> bool:
    """Verify one checkpoint's signature."""
    try:
        public_key.verify(bytes.fromhex(checkpoint.signature), checkpoint.signing_payload())
    except (InvalidSignature, ValueError):
        return False
    return True


@dataclass(frozen=True)
class CheckpointVerification:
    checkpoints_checked: int
    ok: bool
    first_bad_sequence: int | None = None
    reason: str | None = None


async def verify_all_checkpoints(
    session: AsyncSession, public_key: Ed25519PublicKey
) -> CheckpointVerification:
    """Verify every checkpoint signature, and that each still matches the chain.

    Two failures are distinguished, because they mean different things:
      * a bad signature — the checkpoint row itself was altered;
      * a signature that verifies but no longer matches the event at that
        sequence — the *chain* was rewritten under a valid checkpoint, which is
        precisely the insider-tampering case checkpoints exist to catch.
    """
    result = await session.execute(select(AuditCheckpoint).order_by(AuditCheckpoint.sequence))
    checkpoints = list(result.scalars())

    for checkpoint in checkpoints:
        if not verify_checkpoint(checkpoint, public_key):
            return CheckpointVerification(
                len(checkpoints), False, checkpoint.sequence, "signature does not verify"
            )
        event = await session.execute(
            select(AuditEvent.event_hash).where(AuditEvent.sequence == checkpoint.sequence)
        )
        actual = event.scalar_one_or_none()
        if actual is None:
            return CheckpointVerification(
                len(checkpoints), False, checkpoint.sequence, "checkpointed event is missing"
            )
        if actual != checkpoint.chain_head_hash:
            return CheckpointVerification(
                len(checkpoints),
                False,
                checkpoint.sequence,
                "chain was rewritten beneath a valid checkpoint",
            )

    return CheckpointVerification(len(checkpoints), True)
