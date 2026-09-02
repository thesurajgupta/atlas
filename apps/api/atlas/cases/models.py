"""Case lifecycle, typed interventions and outcomes (master spec §26)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from atlas.core.database import Base
from atlas.core.enums import CaseStatus, InterventionType
from atlas.core.mixins import Timestamps, UUIDPrimaryKey

SCHEMA = "cases"


class Case(UUIDPrimaryKey, Timestamps, Base):
    """An investigation.

    A case may be created from a single complaint, or from a **grouping
    proposal** covering complaints across several jurisdictions (§26.1). Grouped
    cases carry multiple owning jurisdictions: ownership is per-complaint, not
    per-case, and authorization is evaluated per-complaint so a district
    investigator sees their own complaints in full and the others only as
    linkage.
    """

    __tablename__ = "case"
    __table_args__ = (
        UniqueConstraint("public_ref", name="uq_case_public_ref"),
        Index("ix_case_status", "status"),
        Index("ix_case_assigned", "assigned_to_id"),
        Index("ix_case_opened_at", "opened_at"),
        {"schema": SCHEMA},
    )

    public_ref: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[CaseStatus] = mapped_column(
        Enum(CaseStatus, name="case_status", schema=SCHEMA),
        nullable=False,
        default=CaseStatus.NEW,
    )
    title: Mapped[str] = mapped_column(String(240), nullable=False)

    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    assigned_to_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    owning_jurisdiction_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)

    amount_at_risk: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)

    # Set when the case came from a grouping proposal (§27.1). Kept so a grouping
    # can be split back into its constituent cases without losing history.
    grouping_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)


class CaseComplaintLink(UUIDPrimaryKey, Timestamps, Base):
    """Join between a case and the complaints it covers.

    Explicit rather than a foreign key on ``Complaint`` because the relationship
    is many-to-many once grouping exists, and because the link itself carries the
    jurisdiction that owns that complaint within the case.
    """

    __tablename__ = "case_complaint_link"
    __table_args__ = (
        UniqueConstraint("case_id", "complaint_id", name="uq_case_complaint"),
        Index("ix_case_complaint_complaint", "complaint_id"),
        {"schema": SCHEMA},
    )

    case_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{SCHEMA}.case.id", ondelete="CASCADE"), nullable=False
    )
    complaint_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    owning_jurisdiction_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)


class Intervention(UUIDPrimaryKey, Timestamps, Base):
    """A typed action taken on a case.

    Typed because intervention type is what outcomes are measured against, and
    free text cannot be aggregated. Records what was predicted at the time, what
    was done, by whom, and what happened — which is the only way lead time and
    recovery can be measured at all (master spec §21.4).
    """

    __tablename__ = "intervention"
    __table_args__ = (
        Index("ix_intervention_case", "case_id", "performed_at"),
        Index("ix_intervention_type", "intervention_type"),
        {"schema": SCHEMA},
    )

    case_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{SCHEMA}.case.id", ondelete="CASCADE"), nullable=False
    )
    intervention_type: Mapped[InterventionType] = mapped_column(
        Enum(InterventionType, name="intervention_type", schema=SCHEMA), nullable=False
    )
    performed_by_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    performed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Mandatory for NO_ACTION. A null result is data, and recording why nothing
    # was done is what stops it being read as "nothing happened".
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # What the system predicted when this action was taken. Frozen at write time
    # so later model changes cannot retroactively flatter the outcome record.
    prediction_snapshot: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)

    outcome: Mapped[str | None] = mapped_column(String(48), nullable=True)
    outcome_recorded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    amount_recovered: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
