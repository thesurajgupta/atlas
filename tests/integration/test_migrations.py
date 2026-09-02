"""Migrations produce the schema the models expect."""

from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio

EXPECTED_TABLES = {
    ("iam", "jurisdiction"),
    ("iam", "investigator"),
    ("iam", "revoked_token"),
    ("iam", "break_glass_grant"),
    ("complaints", "complaint"),
    ("entity", "canonical_entity"),
    ("entity", "entity_resolution_decision"),
    ("entity", "entity_risk_score"),
    ("geo", "cash_out_endpoint"),
    ("geo", "geographic_zone"),
    ("cases", "case"),
    ("cases", "case_complaint_link"),
    ("cases", "intervention"),
    ("audit", "audit_event"),
    ("audit", "audit_checkpoint"),
}


async def test_all_expected_tables_exist(session: AsyncSession) -> None:
    result = await session.execute(
        text("SELECT schemaname, tablename FROM pg_tables WHERE schemaname = ANY(:s)"),
        {"s": ["iam", "complaints", "entity", "geo", "cases", "audit"]},
    )
    actual = {(r[0], r[1]) for r in result}
    assert EXPECTED_TABLES <= actual, f"missing: {EXPECTED_TABLES - actual}"


async def test_observation_tables_carry_observed_at(session: AsyncSession) -> None:
    """`observed_at` is what makes point-in-time correctness possible (§19.1).

    Retrofitting it later is painful, so it is asserted from the first migration.
    """
    observation_tables = [
        ("complaints", "complaint"),
        ("entity", "canonical_entity"),
        ("geo", "cash_out_endpoint"),
        ("geo", "geographic_zone"),
    ]
    for schema, table in observation_tables:
        result = await session.execute(
            text(
                "SELECT data_type FROM information_schema.columns "
                "WHERE table_schema = :s AND table_name = :t AND column_name = 'observed_at'"
            ),
            {"s": schema, "t": table},
        )
        data_type = result.scalar()
        assert data_type is not None, f"{schema}.{table} has no observed_at column"
        assert data_type == "timestamp with time zone", (
            f"{schema}.{table}.observed_at is {data_type}; storage must be timezone-aware"
        )


async def test_all_timestamps_are_timezone_aware(session: AsyncSession) -> None:
    """A naive timestamp in a temporal prediction system is a latent bug."""
    result = await session.execute(
        text(
            "SELECT table_schema, table_name, column_name FROM information_schema.columns "
            "WHERE table_schema = ANY(:s) AND data_type = 'timestamp without time zone'"
        ),
        {"s": ["iam", "complaints", "entity", "geo", "cases", "audit"]},
    )
    naive = list(result)
    assert not naive, f"naive timestamp columns found: {naive}"


async def test_synthetic_guard_defaults_to_true(session: AsyncSession) -> None:
    """The unsafe value must require deliberate action (master spec §5)."""
    result = await session.execute(
        text(
            "SELECT column_default FROM information_schema.columns "
            "WHERE table_schema = 'complaints' AND table_name = 'complaint' "
            "AND column_name = 'is_synthetic'"
        )
    )
    assert "true" in (result.scalar() or "").lower()
