"""Append-only, hash-chained audit with signed checkpoints (ADR-007, spec §32).

Three layers, all required, because the first two alone are not tamper-evidence:

1. **Append-only storage** — no UPDATE/DELETE grant for any application role,
   asserted by a migration test.
2. **Hash chaining** — each event binds its predecessor.
3. **Signed checkpoints** — the chain head is periodically signed with a key held
   *outside* the application database.

Without layer 3, an administrator with write access can alter an event and
recompute every subsequent hash. The chain would detect corruption but not an
authorised rewrite, and insider misuse is explicitly in our threat model. With
layer 3, rewriting history requires forging a signature.

The claim this supports is **tamper-evident**. Not "immutable", not "legal chain
of custody" — that wording is binding on all documents and answers (§32.1).
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from atlas.core.database import Base
from atlas.core.mixins import UUIDPrimaryKey

SCHEMA = "audit"

# Written into the first row of a chain. Any value works provided it is fixed and
# public; naming it explicitly stops it looking like a truncated hash.
GENESIS_HASH = "0" * 64


class AuditEvent(UUIDPrimaryKey, Base):
    """One audited operation.

    Deliberately does not use :class:`Timestamps`: an audit row must never be
    updated, so an ``updated_at`` column would imply a capability the schema
    forbids.
    """

    __tablename__ = "audit_event"
    __table_args__ = (
        UniqueConstraint("sequence", name="uq_audit_event_sequence"),
        Index("ix_audit_event_occurred_at", "occurred_at"),
        Index("ix_audit_event_actor", "actor_id", "occurred_at"),
        Index("ix_audit_event_resource", "resource_type", "resource_id"),
        {"schema": SCHEMA},
    )

    # Gapless ordering. A missing sequence number is itself evidence of tampering,
    # which a timestamp alone would not reveal.
    sequence: Mapped[int] = mapped_column(BigInteger, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    actor_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    actor_role: Mapped[str | None] = mapped_column(String(64), nullable=True)
    actor_jurisdiction: Mapped[str | None] = mapped_column(String(32), nullable=True)

    action: Mapped[str] = mapped_column(String(96), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(96), nullable=True)
    case_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)

    result: Mapped[str] = mapped_column(String(32), nullable=False)
    source_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(256), nullable=True)
    correlation_id: Mapped[str] = mapped_column(String(64), nullable=False)

    # Never contains passwords, tokens, secrets or unnecessary PII (spec §30).
    detail: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    previous_event_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    event_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    def canonical_payload(self) -> str:
        """Deterministic serialisation used for hashing.

        Determinism is the whole point: sorted keys, explicit separators, ISO
        timestamps. If two processes serialise the same event differently, the
        chain breaks for a reason that has nothing to do with tampering — and a
        verifier that cries wolf gets ignored.
        """
        return json.dumps(
            {
                "sequence": self.sequence,
                "occurred_at": self.occurred_at.isoformat(),
                "actor_id": str(self.actor_id) if self.actor_id else None,
                "actor_role": self.actor_role,
                "actor_jurisdiction": self.actor_jurisdiction,
                "action": self.action,
                "resource_type": self.resource_type,
                "resource_id": self.resource_id,
                "case_id": str(self.case_id) if self.case_id else None,
                "result": self.result,
                "correlation_id": self.correlation_id,
                "detail": self.detail,
                "previous_event_hash": self.previous_event_hash,
            },
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        )

    def compute_hash(self) -> str:
        return hashlib.sha256(self.canonical_payload().encode("utf-8")).hexdigest()


class AuditCheckpoint(UUIDPrimaryKey, Base):
    """A signed attestation of the chain head at a point in time.

    The signature is produced with a key held outside the application database
    (KMS/HSM in production). This is the layer that turns a hash chain into
    genuine tamper-evidence.
    """

    __tablename__ = "audit_checkpoint"
    __table_args__ = (
        UniqueConstraint("sequence", name="uq_audit_checkpoint_sequence"),
        Index("ix_audit_checkpoint_created", "created_at"),
        {"schema": SCHEMA},
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    sequence: Mapped[int] = mapped_column(BigInteger, nullable=False)
    chain_head_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    signature: Mapped[str] = mapped_column(Text, nullable=False)
    key_id: Mapped[str] = mapped_column(String(128), nullable=False)
    algorithm: Mapped[str] = mapped_column(String(32), nullable=False, default="Ed25519")

    event_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{SCHEMA}.audit_event.id", ondelete="RESTRICT")
    )

    def signing_payload(self) -> bytes:
        """Bytes actually signed. Binds sequence to hash so neither can move alone."""
        return f"{self.sequence}:{self.chain_head_hash}".encode()
