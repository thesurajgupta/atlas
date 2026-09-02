"""Identity, roles and the federated jurisdiction tree (master spec §29)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from atlas.core.database import Base
from atlas.core.enums import JurisdictionLevel, Role
from atlas.core.mixins import Timestamps, UUIDPrimaryKey

SCHEMA = "iam"


class Jurisdiction(UUIDPrimaryKey, Timestamps, Base):
    """A node in the federated jurisdiction tree.

    National -> State -> Range -> District -> Police Station. The problem
    statement specifies LEAs "at the state and local levels, coordinated by I4C",
    so jurisdiction is structural: it drives authorization (§29), intelligence
    routing (§28) and the disparity report (§22.2).
    """

    __tablename__ = "jurisdiction"
    __table_args__ = (
        UniqueConstraint("code", name="uq_jurisdiction_code"),
        Index("ix_jurisdiction_parent", "parent_id"),
        {"schema": SCHEMA},
    )

    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    level: Mapped[JurisdictionLevel] = mapped_column(
        Enum(JurisdictionLevel, name="jurisdiction_level", schema=SCHEMA), nullable=False
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{SCHEMA}.jurisdiction.id", ondelete="RESTRICT")
    )

    parent: Mapped[Jurisdiction | None] = relationship(remote_side="Jurisdiction.id")


class Investigator(UUIDPrimaryKey, Timestamps, Base):
    """A human operator.

    Password and MFA material live here; both are stored only as verifier
    material, never recoverable. ``failed_login_count`` and ``locked_until``
    support lockout without a separate store.
    """

    __tablename__ = "investigator"
    __table_args__ = (
        UniqueConstraint("username", name="uq_investigator_username"),
        {"schema": SCHEMA},
    )

    username: Mapped[str] = mapped_column(String(80), nullable=False)
    display_name: Mapped[str] = mapped_column(String(160), nullable=False)

    # argon2id verifier. Never a recoverable value (ADR-006).
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    # TOTP shared secret, encrypted at rest by the application layer.
    mfa_secret: Mapped[str | None] = mapped_column(String(256), nullable=True)
    mfa_enrolled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    role: Mapped[Role] = mapped_column(Enum(Role, name="role", schema=SCHEMA), nullable=False)
    jurisdiction_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.jurisdiction.id", ondelete="RESTRICT"),
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    failed_login_count: Mapped[int] = mapped_column(nullable=False, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    jurisdiction: Mapped[Jurisdiction] = relationship()


class RevokedToken(UUIDPrimaryKey, Timestamps, Base):
    """Revoked access/refresh token identifiers (JTI).

    Short-lived tokens still need revocation: a compromised session must be
    killable before its natural expiry. Rows are purged after ``expires_at``,
    so the table stays bounded by token TTL rather than growing forever.
    """

    __tablename__ = "revoked_token"
    __table_args__ = (
        UniqueConstraint("jti", name="uq_revoked_token_jti"),
        Index("ix_revoked_token_expires_at", "expires_at"),
        {"schema": SCHEMA},
    )

    jti: Mapped[str] = mapped_column(String(64), nullable=False)
    investigator_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{SCHEMA}.investigator.id", ondelete="CASCADE")
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reason: Mapped[str] = mapped_column(String(120), nullable=False)


class BreakGlassGrant(UUIDPrimaryKey, Timestamps, Base):
    """Time-boxed emergency access with mandatory justification (master spec §29).

    Emergencies are real; unlogged emergencies are not. A grant expires on its
    own, names a second party who was notified, and is prominently audited.
    """

    __tablename__ = "break_glass_grant"
    __table_args__ = (
        Index("ix_break_glass_active", "investigator_id", "expires_at"),
        {"schema": SCHEMA},
    )

    investigator_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.investigator.id", ondelete="CASCADE"),
        nullable=False,
    )
    justification: Mapped[str] = mapped_column(String(1000), nullable=False)
    granted_by_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{SCHEMA}.investigator.id", ondelete="SET NULL")
    )
    notified_party_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{SCHEMA}.investigator.id", ondelete="SET NULL")
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
