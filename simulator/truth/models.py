"""Hidden ground truth (master spec §23.2, §19.2).

For every generated fraud scenario the simulator knows the real answer: the
path the money took, the endpoint where it was withdrawn, and when. **The
prediction system must never receive this.**

These tables live in the ``truth`` schema, which is owned by ``atlas_sim`` and
on which ``atlas_app`` and ``atlas_features`` hold no grant at all — checked by
``tests/leakage/test_truth_schema_isolation.py``. That is leakage gate 2, and it
is physical rather than conventional: a coding error in the serving path cannot
read what the database will not serve it.

They are declared on their own ``MetaData``, not on ``atlas.core.database.Base``.
Sharing the application's metadata would put ground-truth tables into the same
``create_all`` and the same Alembic autogenerate as the serving schema — one
import away from being created, migrated and reasoned about as if they were
ordinary application tables. The separation is the point.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

SCHEMA = "truth"

#: Separate from the application metadata on purpose — see the module docstring.
truth_metadata = MetaData(schema=SCHEMA)


class TruthBase(DeclarativeBase):
    metadata = truth_metadata


class Scenario(TruthBase):
    """One generated fraud case, with the seed that produced it.

    ``seed`` and ``dataset_version`` together make a scenario reproducible: the
    same version and seed regenerate byte-identical output (ADR-005). Without
    them a metric can be quoted but never re-derived, which is the same as not
    having it.
    """

    __tablename__ = "scenario"
    __table_args__ = (
        UniqueConstraint(
            "dataset_version", "scenario_ref", name="uq_truth_scenario_ref"
        ),
        Index("ix_truth_scenario_version", "dataset_version"),
        Index("ix_truth_scenario_typology", "typology"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    dataset_version: Mapped[str] = mapped_column(String(64), nullable=False)
    scenario_ref: Mapped[str] = mapped_column(String(64), nullable=False)
    seed: Mapped[int] = mapped_column(Integer, nullable=False)

    typology: Mapped[str] = mapped_column(String(48), nullable=False)
    victim_account: Mapped[str] = mapped_column(String(64), nullable=False)
    victim_jurisdiction: Mapped[str | None] = mapped_column(String(32), nullable=True)
    fraud_initiated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class LayeringHop(TruthBase):
    """One transfer on the true money path.

    Ordinary transaction data in shape, ground truth in status: knowing which
    hops belong to *this* scenario is exactly what a model is supposed to work
    out. ``hop_index`` preserves order independently of timestamps, because
    automated layering produces hops inside the same second.
    """

    __tablename__ = "layering_hop"
    __table_args__ = (
        UniqueConstraint("scenario_id", "hop_index", name="uq_truth_hop_order"),
        Index("ix_truth_hop_scenario", "scenario_id"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    scenario_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.scenario.id", ondelete="CASCADE"),
        nullable=False,
    )
    hop_index: Mapped[int] = mapped_column(Integer, nullable=False)
    from_account: Mapped[str] = mapped_column(String(64), nullable=False)
    to_account: Mapped[str] = mapped_column(String(64), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class CashOutEvent(TruthBase):
    """The answer. Where and when the money actually left the system.

    This single row is what all three prediction tiers are scored against, and
    the one thing that must never reach the serving path — a feature derived
    from it would produce a model that appears to work perfectly and predicts
    nothing.

    ``endpoint_jurisdiction`` is nullable because ``CRYPTO_P2P`` has no physical
    location. That is a modelled fact, not missing data: a crypto off-ramp is a
    real cash-out the geospatial tiers structurally cannot rank, and evaluation
    excludes it rather than scoring it as a miss (§17).
    """

    __tablename__ = "cash_out_event"
    __table_args__ = (
        UniqueConstraint("scenario_id", name="uq_truth_cash_out_per_scenario"),
        Index("ix_truth_cash_out_endpoint", "endpoint_ref"),
        Index("ix_truth_cash_out_occurred_at", "occurred_at"),
        {"schema": SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    scenario_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.scenario.id", ondelete="CASCADE"),
        nullable=False,
    )
    endpoint_ref: Mapped[str] = mapped_column(String(64), nullable=False)
    channel: Mapped[str] = mapped_column(String(32), nullable=False)
    endpoint_jurisdiction: Mapped[str | None] = mapped_column(String(32), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
