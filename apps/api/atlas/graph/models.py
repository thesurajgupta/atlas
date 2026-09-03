"""Materialised transaction graph (master spec §14, ADR-002).

Stored in PostgreSQL rather than a graph database. ADR-002 records the reasoning:
the traversals this project actually needs are bounded-depth and time-filtered,
recursive CTEs do them well, and a second datastore would mean a second copy of
the truth to keep consistent — and a second place for an authorization boundary
to be forgotten.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from atlas.core.database import Base
from atlas.core.enums import CashOutChannel, EdgeType, NodeKind
from atlas.core.mixins import ObservationBase

SCHEMA = "graph"


class TransactionEdge(ObservationBase, Base):
    """One directed movement of value between two canonical entities.

    Two timestamps, and the distinction is what makes trail reconstruction
    honest rather than merely plausible:

    * ``occurred_at`` — when the money moved. Ordering hops by this is what
      makes a path physically possible.
    * ``observed_at`` — when ATLAS could first have known (``ObservationBase``).
      Bounding a traversal by this is what stops a reconstruction from using a
      bank response that had not yet arrived.

    Using either one for the other's job produces a trail that looks correct and
    is not: order by ``observed_at`` and the hops come back in the order the
    banks happened to reply; filter by ``occurred_at`` and a feature can read a
    disclosure from the future.

    The foreign keys reference ``entity.canonical_entity`` by string rather than
    by importing the model, because ``graph`` and ``entity`` are siblings in the
    layering contract and may not import one another (ADR-009). The database
    still enforces referential integrity.
    """

    __tablename__ = "transaction_edge"
    __table_args__ = (
        # Replaying a batch must not double the graph. Idempotency at the edge
        # level matters more than elsewhere: a duplicated hop inflates every
        # fan-out and degree feature computed downstream of it.
        UniqueConstraint(
            "source_system", "source_record_id", name="uq_transaction_edge_source_idempotency"
        ),
        CheckConstraint("amount > 0", name="ck_transaction_edge_amount_positive"),
        CheckConstraint("from_entity_id <> to_entity_id", name="ck_transaction_edge_no_self_loop"),
        # The two indexes that carry the recursive traversal. Forward walks join
        # on ``from_entity_id`` and filter on time; backward walks (given an
        # endpoint, where did this money come from?) need the mirror.
        Index("ix_transaction_edge_from_time", "from_entity_id", "occurred_at"),
        Index("ix_transaction_edge_to_time", "to_entity_id", "occurred_at"),
        Index("ix_transaction_edge_observed_at_id", "observed_at", "id"),
        Index("ix_transaction_edge_channel", "channel"),
        {"schema": SCHEMA},
    )

    from_entity_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("entity.canonical_entity.id", ondelete="CASCADE"),
        nullable=False,
    )
    to_entity_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("entity.canonical_entity.id", ondelete="CASCADE"),
        nullable=False,
    )

    edge_type: Mapped[EdgeType] = mapped_column(
        Enum(EdgeType, name="edge_type", schema=SCHEMA), nullable=False
    )

    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Only set on a WITHDREW_AT edge. A transfer between accounts has no
    # cash-out channel, and defaulting one would invent a fact.
    #
    # This reuses the PostgreSQL type ``geo.cash_out_channel`` rather than
    # declaring a second copy in this schema. A database enum is a shared
    # vocabulary for exactly the reason the Python enum lives in ``core``: two
    # copies are two places to add a new channel, and the day someone adds one
    # to a single copy is the day the two schemas quietly disagree. The type
    # arguably belongs in the ``core`` schema; moving it is a separate migration
    # and is noted in the PR rather than smuggled into this one.
    channel: Mapped[CashOutChannel | None] = mapped_column(
        Enum(CashOutChannel, name="cash_out_channel", schema="geo", create_type=False),
        nullable=True,
    )

    # UPI / IMPS / NEFT / RTGS / AEPS / CARD. Free-form because payment rails are
    # added faster than a deployment cycle, and an unknown rail must be storable
    # rather than rejected.
    rail: Mapped[str | None] = mapped_column(String(24), nullable=True)


class ArtefactLink(ObservationBase, Base):
    """A typed link where at least one end is an investigative artefact.

    Spec §14.1 calls this the single highest-leverage change to the graph model,
    and the reason is operational rather than architectural: it turns "this
    complaint connects to a case opened in another state four months ago through
    a shared endpoint" from a report somebody has to run into a traversal that
    is simply there.

    **Polymorphic, with no foreign keys, and that is forced rather than chosen.**
    ``graph`` sits below ``cases``, ``alerts`` and ``predict`` in the layering
    contract (ADR-009), so it cannot import their models — and a foreign key to
    a table this module may not know about is not available to it. The honest
    consequence is that the database cannot stop a link pointing at a deleted
    case; that has to be checked, not assumed, and
    ``tests/integration/test_artefact_neighbourhood.py`` does exactly that —
    reporting the node kinds whose owning table does not exist yet as
    *unchecked*, rather than letting a coverage gap read as a clean result.

    The alternative was materialising every artefact into a node table owned by
    ``graph``. That would buy referential integrity and cost a second copy of
    every complaint and case — and, more seriously, a second place for an
    authorization check to be forgotten. Duplicated authority is a worse failure
    mode than a dangling row.
    """

    __tablename__ = "artefact_link"
    __table_args__ = (
        UniqueConstraint(
            "source_kind",
            "source_id",
            "target_kind",
            "target_id",
            "edge_type",
            name="uq_artefact_link_unique_edge",
        ),
        CheckConstraint(
            "NOT (source_kind = target_kind AND source_id = target_id)",
            name="ck_artefact_link_no_self_loop",
        ),
        Index("ix_artefact_link_source", "source_kind", "source_id"),
        Index("ix_artefact_link_target", "target_kind", "target_id"),
        Index("ix_artefact_link_observed_at_id", "observed_at", "id"),
        {"schema": SCHEMA},
    )

    source_kind: Mapped[NodeKind] = mapped_column(
        Enum(NodeKind, name="node_kind", schema=SCHEMA), nullable=False
    )
    source_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    target_kind: Mapped[NodeKind] = mapped_column(
        Enum(NodeKind, name="node_kind", schema=SCHEMA, create_type=False), nullable=False
    )
    target_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)

    edge_type: Mapped[EdgeType] = mapped_column(
        Enum(EdgeType, name="edge_type", schema=SCHEMA, create_type=False), nullable=False
    )

    # Which jurisdiction owns each end. Denormalised deliberately: the
    # authorization decision for a cross-jurisdiction traversal has to be made
    # without reading the far row, because reading it is the thing being
    # authorized. Kept in step by the owning module when an artefact moves.
    #
    # Both ends are stored, not just the target. Links are directed, but a
    # traversal is not — an investigator asking what their complaint touches
    # means both directions — and the backward hop needs the source's
    # jurisdiction to authorize against. Storing only one end made every
    # backward link redact, including links from inside the viewer's own
    # district: fail-closed, and wrong.
    source_jurisdiction_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), nullable=True
    )
    target_jurisdiction_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), nullable=True
    )

    # Why this link exists, as a sentence an investigator can weigh — "both
    # reached BC agent HR-0142 within 90 minutes". Never a bare score: a link an
    # investigator cannot interrogate is one they will either over-trust or
    # ignore, and both are worse than no link (spec §28.4).
    basis: Mapped[str] = mapped_column(String(280), nullable=False)
