"""graph artefact link

Revision ID: 1950dbb695a5
Revises: fc804f9715c2
Create Date: 2026-09-04 02:41:12.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "1950dbb695a5"
down_revision: str | None = "fc804f9715c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Autogenerate emits a fresh sa.Enum for every column, which re-runs CREATE TYPE
# and fails on the second use. Types already owned by an earlier migration are
# referenced with create_type=False; node_kind is new here and is created once,
# explicitly, before the table.
node_kind = postgresql.ENUM(
    "ACCOUNT",
    "WALLET",
    "ENTITY",
    "MERCHANT",
    "CASH_OUT_ENDPOINT",
    "BC_AGENT",
    "FINANCIAL_INSTITUTION",
    "DEVICE",
    "NETWORK_INDICATOR",
    "GEOGRAPHIC_ZONE",
    "COMPLAINT",
    "CASE",
    "ALERT",
    "PREDICTION",
    "INTERVENTION",
    name="node_kind",
    schema="graph",
    create_type=False,
)
edge_type = postgresql.ENUM(name="edge_type", schema="graph", create_type=False)
classification = postgresql.ENUM(name="classification", schema="core", create_type=False)


def upgrade() -> None:
    node_kind.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "artefact_link",
        sa.Column("source_kind", node_kind, nullable=False),
        sa.Column("source_id", sa.UUID(), nullable=False),
        sa.Column("target_kind", node_kind, nullable=False),
        sa.Column("target_id", sa.UUID(), nullable=False),
        sa.Column("edge_type", edge_type, nullable=False),
        sa.Column("source_jurisdiction_id", sa.UUID(), nullable=True),
        sa.Column("target_jurisdiction_id", sa.UUID(), nullable=True),
        sa.Column("basis", sa.String(length=280), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_system", sa.String(length=64), nullable=False),
        sa.Column("source_record_id", sa.String(length=128), nullable=True),
        sa.Column("ingestion_batch_id", sa.UUID(), nullable=True),
        sa.Column("classification", classification, nullable=False),
        sa.Column("is_synthetic", sa.Boolean(), server_default="true", nullable=False),
        sa.CheckConstraint(
            "NOT (source_kind = target_kind AND source_id = target_id)",
            name="ck_artefact_link_no_self_loop",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_kind",
            "source_id",
            "target_kind",
            "target_id",
            "edge_type",
            name="uq_artefact_link_unique_edge",
        ),
        schema="graph",
    )
    op.create_index(
        op.f("ix_graph_artefact_link_observed_at"),
        "artefact_link",
        ["observed_at"],
        unique=False,
        schema="graph",
    )
    op.create_index(
        "ix_artefact_link_observed_at_id",
        "artefact_link",
        ["observed_at", "id"],
        unique=False,
        schema="graph",
    )
    op.create_index(
        "ix_artefact_link_source",
        "artefact_link",
        ["source_kind", "source_id"],
        unique=False,
        schema="graph",
    )
    op.create_index(
        "ix_artefact_link_target",
        "artefact_link",
        ["target_kind", "target_id"],
        unique=False,
        schema="graph",
    )

    # ------------------------------------------------------------------
    # Spec §14.1: artefact edges never feed prediction features.
    #
    # A Prediction node linked to a Case is investigative context. Let it into
    # the feature pipeline and the model reads its own prior output back as
    # evidence, growing more confident the more it has already said — the
    # self-fulfilling loop §22.1 exists to prevent.
    #
    # The `graph` schema grant is inherited from ALTER DEFAULT PRIVILEGES, so
    # atlas_features would otherwise get SELECT here automatically. Revoked
    # explicitly, and the default revoked too so a future table in this schema
    # does not silently re-open it.
    #
    # This makes the constraint structural rather than a sentence in a spec.
    # A comment saying "do not use this in features" is a comment; a role with
    # no grant is a boundary.
    # ------------------------------------------------------------------
    op.execute("REVOKE ALL ON graph.artefact_link FROM atlas_features")


def downgrade() -> None:
    op.drop_index("ix_artefact_link_target", table_name="artefact_link", schema="graph")
    op.drop_index("ix_artefact_link_source", table_name="artefact_link", schema="graph")
    op.drop_index("ix_artefact_link_observed_at_id", table_name="artefact_link", schema="graph")
    op.drop_index(
        op.f("ix_graph_artefact_link_observed_at"), table_name="artefact_link", schema="graph"
    )
    op.drop_table("artefact_link", schema="graph")
    node_kind.drop(op.get_bind(), checkfirst=True)
