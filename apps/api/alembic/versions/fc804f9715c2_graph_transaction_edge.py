"""graph transaction edge

Revision ID: fc804f9715c2
Revises: d4d0b7466ec8
Create Date: 2026-09-04 01:28:55.975569
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "fc804f9715c2"
down_revision: str | None = "d4d0b7466ec8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Autogenerate does not carry ``create_type=False`` from the model into the
# migration: it emitted a plain ``sa.Enum`` and the upgrade failed with
# "type cash_out_channel already exists", because ``geo`` declared it first.
# Declared explicitly here so the type is referenced, never re-created.
cash_out_channel = postgresql.ENUM(
    "ATM",
    "AEPS_BC",
    "BANK_BRANCH",
    "POS_CASHBACK",
    "MERCHANT_QR",
    "PREPAID_GIFT",
    "CRYPTO_P2P",
    name="cash_out_channel",
    schema="geo",
    create_type=False,
)

classification = postgresql.ENUM(
    "PUBLIC",
    "INTERNAL",
    "SENSITIVE",
    "HIGHLY_SENSITIVE",
    "RESTRICTED",
    name="classification",
    schema="core",
    create_type=False,
)


def upgrade() -> None:
    op.create_table(
        "transaction_edge",
        sa.Column("from_entity_id", sa.UUID(), nullable=False),
        sa.Column("to_entity_id", sa.UUID(), nullable=False),
        sa.Column(
            "edge_type",
            sa.Enum(
                "TRANSFERRED_TO",
                "WITHDREW_AT",
                "OWNS",
                "HOLDS",
                "SUBJECT_OF",
                "LINKED_ALERT",
                "RELATED_CASE",
                "PREDICTED_FOR",
                "ACTED_ON",
                "SHARES_DEVICE",
                "SHARES_BENEFICIARY",
                name="edge_type",
                schema="graph",
            ),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("channel", cash_out_channel, nullable=True),
        sa.Column("rail", sa.String(length=24), nullable=True),
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
        sa.CheckConstraint("amount > 0", name="ck_transaction_edge_amount_positive"),
        sa.CheckConstraint(
            "from_entity_id <> to_entity_id", name="ck_transaction_edge_no_self_loop"
        ),
        sa.ForeignKeyConstraint(
            ["from_entity_id"], ["entity.canonical_entity.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["to_entity_id"], ["entity.canonical_entity.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_system", "source_record_id", name="uq_transaction_edge_source_idempotency"
        ),
        schema="graph",
    )
    op.create_index(
        op.f("ix_graph_transaction_edge_observed_at"),
        "transaction_edge",
        ["observed_at"],
        unique=False,
        schema="graph",
    )
    op.create_index(
        "ix_transaction_edge_channel",
        "transaction_edge",
        ["channel"],
        unique=False,
        schema="graph",
    )
    op.create_index(
        "ix_transaction_edge_from_time",
        "transaction_edge",
        ["from_entity_id", "occurred_at"],
        unique=False,
        schema="graph",
    )
    op.create_index(
        "ix_transaction_edge_observed_at_id",
        "transaction_edge",
        ["observed_at", "id"],
        unique=False,
        schema="graph",
    )
    op.create_index(
        "ix_transaction_edge_to_time",
        "transaction_edge",
        ["to_entity_id", "occurred_at"],
        unique=False,
        schema="graph",
    )

    # No explicit grants here on purpose. b1c2d3e4f5a6 set ALTER DEFAULT
    # PRIVILEGES on the `graph` schema for both atlas_app and atlas_features, so
    # this table inherits them on creation. Restating them would work today and
    # rot the moment the two disagree.
    #
    # This is only true because migrations run as the same role that issued the
    # ALTER — default privileges are per-creating-role, not global. The
    # integration test asserts the outcome rather than trusting the reasoning.


def downgrade() -> None:
    op.drop_index("ix_transaction_edge_to_time", table_name="transaction_edge", schema="graph")
    op.drop_index(
        "ix_transaction_edge_observed_at_id", table_name="transaction_edge", schema="graph"
    )
    op.drop_index("ix_transaction_edge_from_time", table_name="transaction_edge", schema="graph")
    op.drop_index("ix_transaction_edge_channel", table_name="transaction_edge", schema="graph")
    op.drop_index(
        op.f("ix_graph_transaction_edge_observed_at"),
        table_name="transaction_edge",
        schema="graph",
    )
    op.drop_table("transaction_edge", schema="graph")
    # graph.edge_type is created by create_table above and dropped with it; the
    # geo and core enums are owned by earlier migrations and must survive.
    sa.Enum(name="edge_type", schema="graph").drop(op.get_bind(), checkfirst=True)
