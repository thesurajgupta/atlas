"""Persist generated scenarios into the ``truth`` schema (master spec §23.2).

Connects as ``atlas_sim``, which is the only role with a grant on ``truth``.
That is not a convenience — it means this module physically cannot be reached
from the serving path even by accident, because the serving path's credentials
do not open the door.

A dataset version is written whole or not at all. A half-written version would
produce metrics computed against a partial answer key, and nothing about the
number would show that it happened.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from simulator.truth.models import CashOutEvent, LayeringHop, Scenario, truth_metadata
from simulator.typologies import FraudScenario


async def ensure_schema(engine: AsyncEngine) -> None:
    """Create the truth tables if they are not there.

    Deliberately not an Alembic migration. Alembic runs as the application
    migration user against the serving schemas; putting ground-truth DDL in the
    same chain would mean the serving deployment creates, owns and knows about
    the answer key. The simulator owns this schema and creates it itself.
    """
    async with engine.begin() as conn:
        await conn.run_sync(truth_metadata.create_all)


async def write_dataset(
    engine: AsyncEngine,
    scenarios: Sequence[FraudScenario],
    *,
    dataset_version: str,
    seed: int,
    replace: bool = True,
) -> dict[str, int]:
    """Write a whole dataset version.

    ``replace`` drops any existing rows for this ``dataset_version`` first, so
    re-running a version is idempotent rather than additive. Appending to a
    version silently doubles the label set, and the resulting recall number
    looks plausible.
    """
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as session:
        if replace:
            await _delete_version(session, dataset_version)

        # Parents are flushed before children, explicitly.
        #
        # These models carry foreign keys but no `relationship()`, so
        # SQLAlchemy's unit of work has no dependency to sort on and orders
        # inserts by table name — cash_out_event, layering_hop, scenario. The
        # children go first and the foreign key rejects them.
        #
        # Two phases rather than a relationship: this writer only ever inserts,
        # and a relationship would add lazy-load machinery to tables that exist
        # to be written once and read by SQL.
        rows: list[tuple[uuid.UUID, FraudScenario]] = [
            (uuid.uuid4(), scenario) for scenario in scenarios
        ]

        session.add_all(
            Scenario(
                id=scenario_id,
                dataset_version=dataset_version,
                scenario_ref=str(scenario.scenario_id),
                seed=seed,
                typology=scenario.typology.value,
                victim_account=scenario.victim.account_id,
                victim_jurisdiction=scenario.victim.jurisdiction_id,
                fraud_initiated_at=scenario.fraud_initiated_at,
            )
            for scenario_id, scenario in rows
        )
        await session.flush()

        for scenario_id, scenario in rows:
            session.add_all(
                LayeringHop(
                    id=uuid.uuid4(),
                    scenario_id=scenario_id,
                    hop_index=hop_index,
                    from_account=hop.from_account.account_id,
                    to_account=hop.to_account.account_id,
                    amount=hop.amount,
                    occurred_at=hop.occurred_at,
                )
                for hop_index, hop in enumerate(scenario.hops)
            )
            event = scenario.cash_out
            session.add(
                CashOutEvent(
                    id=uuid.uuid4(),
                    scenario_id=scenario_id,
                    endpoint_ref=event.endpoint.endpoint_id,
                    channel=event.endpoint.channel.value,
                    endpoint_jurisdiction=event.endpoint.jurisdiction_id,
                    amount=event.amount,
                    occurred_at=event.occurred_at,
                )
            )

        await session.commit()

    return await count_version(engine, dataset_version)


async def count_version(engine: AsyncEngine, dataset_version: str) -> dict[str, int]:
    """Row counts for a dataset version, for the writer to report honestly."""
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        scenario_ids = select(Scenario.id).where(
            Scenario.dataset_version == dataset_version
        )
        return {
            "scenarios": await _count(
                session, Scenario.dataset_version == dataset_version, Scenario
            ),
            "hops": await _count(
                session, LayeringHop.scenario_id.in_(scenario_ids), LayeringHop
            ),
            "cash_outs": await _count(
                session, CashOutEvent.scenario_id.in_(scenario_ids), CashOutEvent
            ),
        }


async def _count(session: AsyncSession, condition: object, model: type) -> int:
    result = await session.scalar(
        select(func.count()).select_from(model).where(condition)  # type: ignore[arg-type]
    )
    return int(result or 0)


async def _delete_version(session: AsyncSession, dataset_version: str) -> None:
    """Remove a dataset version.

    Hops and cash-outs cascade from the scenario rows, so only the parent needs
    deleting — and relying on the FK rather than three deletes means a future
    child table cannot be forgotten here.
    """
    await session.execute(
        delete(Scenario).where(Scenario.dataset_version == dataset_version)
    )
