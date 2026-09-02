"""Entity resolution and dynamic entity risk (master spec §13, ADR-013)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from atlas.core.database import Base
from atlas.core.mixins import ObservationBase, Timestamps, UUIDPrimaryKey

SCHEMA = "entity"


class CanonicalEntity(ObservationBase, Base):
    """A resolved real-world actor or object.

    Accounts, endpoints, devices, beneficiaries and BC agents all resolve into
    canonical entities. A system that cannot tell that two accounts belong to the
    same actor cannot detect a mule network, which is the entire subject.
    """

    __tablename__ = "canonical_entity"
    __table_args__ = (
        UniqueConstraint("public_ref", name="uq_canonical_entity_public_ref"),
        Index("ix_canonical_entity_kind", "kind"),
        Index("ix_canonical_entity_observed_at_id", "observed_at", "id"),
        {"schema": SCHEMA},
    )

    public_ref: Mapped[str] = mapped_column(String(32), nullable=False)
    kind: Mapped[str] = mapped_column(String(48), nullable=False)
    attributes: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False, default=dict)


class EntityResolutionDecision(UUIDPrimaryKey, Timestamps, Base):
    """A merge or split, recorded so it can be reversed.

    An entity merge is a *hypothesis*. When it turns out to be wrong it must be
    splittable without destroying the cases, alerts and audit records attached to
    it — an unrecoverable wrong merge in a law-enforcement context is a serious
    harm, not an inconvenience.

    ``decided_at`` is also what makes point-in-time entity joins possible: a merge
    made today must not change what a prediction made last week could see
    (leakage gate 4, master spec §19.3).
    """

    __tablename__ = "entity_resolution_decision"
    __table_args__ = (
        Index("ix_entity_decision_canonical", "canonical_entity_id", "decided_at"),
        Index("ix_entity_decision_decided_at", "decided_at"),
        {"schema": SCHEMA},
    )

    canonical_entity_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.canonical_entity.id", ondelete="CASCADE"),
        nullable=False,
    )
    decision: Mapped[str] = mapped_column(String(16), nullable=False)
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    method: Mapped[str] = mapped_column(String(64), nullable=False)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    evidence: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False, default=dict)
    reversed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.entity_resolution_decision.id", ondelete="SET NULL"),
    )


class EntityRiskScore(UUIDPrimaryKey, Timestamps, Base):
    """A risk score for an entity, at a point in time.

    Append-only and versioned rather than a mutable column on the entity, for
    three reasons:

    * "When did this endpoint become risky?" is the question investigators
      actually ask, and a current-value column cannot answer it.
    * Point-in-time reconstruction is required to train honestly.
    * Scores **decay**. A system that never forgets eventually flags everything,
      and an entity risky in 2024 but quiet since is not risky today.
    """

    __tablename__ = "entity_risk_score"
    __table_args__ = (
        Index("ix_entity_risk_entity_valid", "canonical_entity_id", "valid_from"),
        Index("ix_entity_risk_valid_from", "valid_from"),
        {"schema": SCHEMA},
    )

    canonical_entity_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.canonical_entity.id", ondelete="CASCADE"),
        nullable=False,
    )
    score: Mapped[float] = mapped_column(Float, nullable=False)
    model_version: Mapped[str] = mapped_column(String(96), nullable=False)
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Ranked drivers, rendered to investigators as sentences with a quantity and
    # a window — never as raw coefficients (master spec §25.4).
    contributing_factors: Mapped[list[dict[str, object]]] = mapped_column(
        JSONB, nullable=False, default=list
    )
