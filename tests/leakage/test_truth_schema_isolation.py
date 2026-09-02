"""Leakage gate 2: physical separation of ground truth (master spec §19.2).

Ground truth lives in the `truth` schema, owned by a role the serving and
feature-pipeline users have no grant on. Even a coding error cannot read what the
database will not serve.

These tests assert the *absence* of a privilege. That is unusual and deliberate:
a test that only checks the happy path would pass just as well on a database
where every role can read everything.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = [pytest.mark.leakage, pytest.mark.asyncio]

SERVING_ROLES = ("atlas_app", "atlas_features")


async def test_truth_schema_exists(session: AsyncSession) -> None:
    """If it is missing, the isolation tests below would pass vacuously."""
    result = await session.execute(
        text("SELECT 1 FROM pg_namespace WHERE nspname = 'truth'")
    )
    assert result.scalar() == 1, "truth schema missing; isolation cannot be verified"


@pytest.mark.parametrize("role", SERVING_ROLES)
async def test_serving_roles_have_no_usage_on_truth(
    session: AsyncSession, role: str
) -> None:
    """The load-bearing assertion of the whole leakage design."""
    result = await session.execute(
        text("SELECT has_schema_privilege(:role, 'truth', 'USAGE')"), {"role": role}
    )
    assert result.scalar() is False, (
        f"{role} has USAGE on the truth schema. The prediction path can reach "
        f"ground truth, and every metric this project reports is invalid."
    )


@pytest.mark.parametrize("role", SERVING_ROLES)
async def test_serving_roles_cannot_create_in_truth(
    session: AsyncSession, role: str
) -> None:
    """Blocks the obvious workaround of writing a view into `truth`."""
    result = await session.execute(
        text("SELECT has_schema_privilege(:role, 'truth', 'CREATE')"), {"role": role}
    )
    assert result.scalar() is False, f"{role} can create objects inside truth"


async def test_gate_would_fail_if_grant_were_added(session: AsyncSession) -> None:
    """Prove the gate fires.

    A safety control that has never been observed to trigger is not known to
    work. This grants USAGE, confirms the check flips to True, then rolls back
    so the database is left exactly as found.
    """
    before = await session.execute(
        text("SELECT has_schema_privilege('atlas_app', 'truth', 'USAGE')")
    )
    assert before.scalar() is False

    await session.execute(text("GRANT USAGE ON SCHEMA truth TO atlas_app"))
    during = await session.execute(
        text("SELECT has_schema_privilege('atlas_app', 'truth', 'USAGE')")
    )
    assert during.scalar() is True, (
        "grant had no effect; the check is not measuring anything"
    )

    await session.rollback()
    after = await session.execute(
        text("SELECT has_schema_privilege('atlas_app', 'truth', 'USAGE')")
    )
    assert after.scalar() is False, "rollback failed; test left the database modified"
