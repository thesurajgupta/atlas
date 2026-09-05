"""Point-in-time feature store (master spec §19.1, §18).

The store is append-only and every row carries ``observed_at`` — when the fact
became *knowable*, which is not when it happened and not when the row was
written. Training sets are built by as-of joins at the prediction timestamp, and
no row whose ``observed_at`` is after that timestamp may be read.

This is the mechanism the predecessor's "prevent data leakage" instruction
lacked. An instruction is not a control: it holds until the first person who has
not read it writes a query.

Append-only rather than a mutable current-value table, and the reason is the
whole point. A feature that can be updated in place has one value — today's —
and a model trained "as of last Tuesday" silently trains on facts from this
morning. Reconstructing what was knowable at a past instant is impossible
against a table that overwrites, and no error is raised when it happens.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Float, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from atlas.core.database import Base
from atlas.core.mixins import Observed, Timestamps, UUIDPrimaryKey

SCHEMA = "features"


class FeatureValue(Base, UUIDPrimaryKey, Timestamps, Observed):
    """One feature, for one subject, as it was knowable at one instant.

    ``subject_id`` is deliberately untyped by foreign key. Features are computed
    for entities, endpoints, H3 cells and complaints, which live in four
    different schemas that ``features`` sits above in the layering contract
    (ADR-009) — a foreign key into any of them would invert the dependency. The
    trade is real: nothing stops a row pointing at a subject that no longer
    exists, and the consistency check lives in a test rather than in the
    database.

    There is no ``value`` for categorical features on purpose. Everything here
    is numeric, because a model consumes numbers; an encoder that turns a
    category into a number belongs upstream, where the choice of encoding is
    visible and versioned rather than implicit in a string column.
    """

    __tablename__ = "feature_value"
    __table_args__ = (
        # The same feature can be recomputed as of a later instant — that is the
        # point of the store — but not twice for the same instant. A duplicate
        # at one timestamp makes the as-of read non-deterministic, and the two
        # values would differ by exactly the bug you are trying to find.
        UniqueConstraint(
            "subject_kind",
            "subject_id",
            "feature_name",
            "observed_at",
            name="uq_feature_value_point_in_time",
        ),
        # The index the as-of join runs on. Ordering by observed_at descending
        # inside the subject/feature group is what makes "latest value at or
        # before as_of" an index scan rather than a sort.
        Index(
            "ix_feature_value_as_of",
            "subject_kind",
            "subject_id",
            "feature_name",
            "observed_at",
        ),
        Index("ix_feature_value_name_observed", "feature_name", "observed_at"),
        {"schema": SCHEMA},
    )

    #: What the subject is — ENTITY, ENDPOINT, H3_CELL, COMPLAINT. A string
    #: rather than an enum because the feature pipeline gains new subject kinds
    #: faster than a migration cycle, and an unknown kind must be storable.
    subject_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    subject_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)

    feature_name: Mapped[str] = mapped_column(String(96), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)

    #: Which computation produced this. Two runs of different pipeline versions
    #: can disagree about the same feature at the same instant, and a metric
    #: that cannot say which version it used is not reproducible (CLAUDE.md
    #: rule 2).
    pipeline_version: Mapped[str] = mapped_column(String(64), nullable=False)

    #: Inherited from Observed, restated here for emphasis: this is the column
    #: every read is bounded by.
    observed_at: Mapped[datetime]
