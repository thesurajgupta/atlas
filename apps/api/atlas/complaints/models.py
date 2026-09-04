"""Canonical complaint schema (master spec §11)."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, Index, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from atlas.core.database import Base
from atlas.core.enums import FraudTypology
from atlas.core.mixins import ObservationBase

SCHEMA = "complaints"


class Complaint(ObservationBase, Base):
    """A normalised cybercrime complaint.

    Three timestamps, deliberately distinct, because conflating them is how a
    prediction system quietly cheats:

    * ``fraud_initiated_at`` — when the fraud began (often reported, approximate).
    * ``reported_at`` — when the citizen filed it.
    * ``observed_at`` — when ATLAS could first have known (from ``ObservationBase``).

    Only ``observed_at`` may bound a feature read. Using ``fraud_initiated_at``
    would let a model see a case before the complaint existed.
    """

    __tablename__ = "complaint"
    __table_args__ = (
        UniqueConstraint("public_ref", name="uq_complaint_public_ref"),
        UniqueConstraint(
            "source_system", "source_record_id", name="uq_complaint_source_idempotency"
        ),
        Index("ix_complaint_reported_at", "reported_at"),
        Index("ix_complaint_typology", "typology"),
        Index("ix_complaint_jurisdiction", "victim_jurisdiction_id"),
        Index("ix_complaint_observed_at_id", "observed_at", "id"),
        {"schema": SCHEMA},
    )

    public_ref: Mapped[str] = mapped_column(String(32), nullable=False)

    fraud_initiated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    typology: Mapped[FraudTypology] = mapped_column(
        Enum(FraudTypology, name="fraud_typology", schema=SCHEMA), nullable=False
    )
    reported_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")

    victim_jurisdiction_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), nullable=True
    )

    # Attacker-controlled free text. Isolated before it reaches any model, and
    # never an authoritative source of a financial fact (master spec §11, §34).
    narrative: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Beneficiary details as reported. Stored as claims, not as verified facts.
    reported_beneficiary_account: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reported_beneficiary_ifsc: Mapped[str | None] = mapped_column(String(16), nullable=True)

    @property
    def has_actionable_window(self) -> bool:
        """Whether a prediction on this complaint could still be acted upon.

        A complaint whose fraud time is unknown is treated as actionable rather
        than discarded — absence of a timestamp is not evidence that the money
        has gone.
        """
        return self.fraud_initiated_at is None or self.fraud_initiated_at <= self.reported_at
