"""Reusable column mixins.

Master spec §8 requires every sensitive entity to carry an immutable internal id,
timestamps, ``observed_at``, provenance, classification and audit metadata. These
mixins make that structural rather than a convention that erodes.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, String, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from atlas.core.classification import Classification


class UUIDPrimaryKey:
    """Immutable internal identifier.

    A real account number is never a primary key, in any environment
    (master spec §5). Business references are separate, synthetic, and mutable.
    """

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )


class Timestamps:
    """Row lifecycle timestamps. Always timezone-aware, always stored UTC."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Observed:
    """When this fact became knowable to ATLAS.

    This is the single most important column in the schema for honesty, and it is
    not the same as ``created_at``:

    * ``created_at`` — when *we wrote the row*.
    * ``observed_at`` — when *the fact became knowable*.

    A complaint filed at 09:00 and ingested at 11:00 has ``observed_at`` of 11:00,
    because 09:00 is when the event happened, not when we could have known about
    it. Feature reads join as-of ``observed_at`` (master spec §19.1), so a model
    can never be trained on something that had not yet arrived.

    Retrofitting this column is painful and error-prone, which is why it is here
    in the first commit rather than added when the feature store lands.
    """

    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )


class Provenance:
    """Where this record came from.

    Every ingested record is tagged at the boundary (master spec §10.2). Without
    provenance, a data-quality problem cannot be traced to its connector, and an
    outbound intelligence package cannot state the basis of its own claims.
    """

    source_system: Mapped[str] = mapped_column(String(64), nullable=False)
    source_record_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    ingestion_batch_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), nullable=True
    )


class Classified:
    """Sensitivity of the row, travelling with the data (master spec §30)."""

    classification: Mapped[Classification] = mapped_column(
        Enum(Classification, name="classification", schema="core"),
        nullable=False,
        default=Classification.SENSITIVE,
    )


class SyntheticGuard:
    """Marks a row as synthetic, and defaults to true.

    Everything in this repository is synthetic (master spec §5). Defaulting to
    ``True`` means the *unsafe* value must be set deliberately: a row can only be
    marked non-synthetic by explicit action, never by forgetting to set a flag.
    An audit query for ``is_synthetic = false`` should return nothing here, and
    that query is worth running before any public demo.
    """

    is_synthetic: Mapped[bool] = mapped_column(nullable=False, default=True, server_default="true")


class ObservationBase(UUIDPrimaryKey, Timestamps, Observed, Provenance, Classified, SyntheticGuard):
    """Everything ATLAS observes about the world.

    Composed rather than inherited-from-a-God-object so that a table which is
    genuinely not an observation — a lookup, a config row — is not forced to
    carry ``observed_at`` and provenance it cannot meaningfully populate.

    Note this mixin deliberately does *not* define ``__table_args__``. Every
    concrete model needs its own (schema, unique constraints, spatial indexes),
    so a mixin-supplied version would be overridden every time — dead weight that
    also makes the subclass tuple types unassignable. Each model declares its own
    ``ix_<table>_observed_at_id`` index instead; the composite index on
    ``(observed_at, id)`` is what makes as-of joins efficient (master spec §19.1).
    """
