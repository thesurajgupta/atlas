"""
Seed the ingestion pipeline with synthetic complaints (master spec §10, §23).

This is the piece that was actually missing: `SyntheticComplaintConnector`
and `ingest_complaints` already existed and are fully tested
(tests/integration/test_ingestion.py); nothing generated complaints to feed
them outside of hand-written test fixtures. This script is that wiring.

Usage:
    cd apps/api
    python -m scripts.seed_synthetic_complaints --count 50
    (adjust the import path below if run from elsewhere)

Lives under `scripts/`, not under `atlas/` — the import-linter boundary in
§19/§790 restricts what `atlas.features` and `atlas.predict` may import, not
whether a standalone operational script may import both `simulator` (to
generate) and `atlas.ingest`/`atlas.iam` (to persist). Nothing under
`atlas.features` or `atlas.predict` is imported here.
"""

from __future__ import annotations

import argparse
import asyncio
import random
import sys
import uuid
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "apps" / "api"))
sys.path.insert(0, str(REPO_ROOT))  # so `simulator` is importable too

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from atlas.core.config import get_settings
from atlas.core.enums import JurisdictionLevel
from atlas.iam.models import Jurisdiction
from atlas.ingest.connectors import SyntheticComplaintConnector
from atlas.ingest.pipeline import ingest_complaints
from simulator.generators.complaint_generator import generate_complaint_batch

DEMO_JURISDICTION_CODE = "SIM-SEED-DEMO"


async def _get_or_create_demo_jurisdiction(session: AsyncSession) -> Jurisdiction:
    """Idempotent: reruns of this script must not pile up duplicate jurisdictions."""
    existing = (
        await session.execute(
            select(Jurisdiction).where(Jurisdiction.code == DEMO_JURISDICTION_CODE)
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    jurisdiction = Jurisdiction(
        code=DEMO_JURISDICTION_CODE,
        name="Synthetic Seed District",
        level=JurisdictionLevel.DISTRICT,
    )
    session.add(jurisdiction)
    await session.flush()
    return jurisdiction


async def seed(count: int, seed: int | None) -> None:
    settings = get_settings()
    engine = create_async_engine(settings.database_url, poolclass=None)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    rng = random.Random(seed)  # unseeded (None) -> non-reproducible batch; pass --seed for reproducible demo runs

    async with factory() as session:
        jurisdiction = await _get_or_create_demo_jurisdiction(session)
        await session.commit()

        payloads = generate_complaint_batch(count, rng)
        for p in payloads:
            p["victim_jurisdiction_id"] = str(jurisdiction.id)

        connector = SyntheticComplaintConnector(payloads)
        outcome = await ingest_complaints(session, connector)
        await session.commit()

        print(f"jurisdiction: {jurisdiction.code} ({jurisdiction.id})")
        print(f"batch_id: {outcome.batch_id}")
        print(outcome.summary)
        if outcome.report.reasons:
            print("rejection reasons:", dict(outcome.report.reasons.most_common(5)))
        if outcome.suspect:
            print("WARNING: batch flagged suspect (low acceptance rate)")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=50, help="number of complaints to generate")
    parser.add_argument("--seed", type=int, default=None, help="RNG seed for a reproducible batch (e.g. for `make demo`)")
    args = parser.parse_args()
    asyncio.run(seed(args.count, args.seed))


if __name__ == "__main__":
    main()
