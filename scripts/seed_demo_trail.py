#!/usr/bin/env python3
"""Load simulator layering hops into the serving transaction graph.

`make simulate` writes to the `truth` schema, which the serving path has no
grant on (§19.2). So `graph.transaction_edge` is empty and
`GET /api/v1/graph/trail` correctly returns nothing — there is no observable
data to walk.

**What is safe to move, and what is not.** A layering hop is an ordinary
transaction record: account A paid account B this much at this time. A bank
supplies those, and ATLAS is meant to reconstruct a trail from them. The
*cash-out event* is different — where the money finally left the banking system
is the thing the model is asked to predict, so it is the answer key and stays
in `truth`. This script moves the first and never the second.

That distinction is the whole reason this is not a leak. Loading cash-out events
here would put the label in the feature path and every metric downstream would
become meaningless.

This is the demo-shaped stand-in for the real ingest connector (#65), which
belongs in `atlas.ingest` and goes through the quality gates. Development only.

    .venv/bin/python scripts/seed_demo_trail.py --scenarios 12
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import uuid
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "apps" / "api"))

from atlas.core.config import Environment, get_settings
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

#: Fixed namespace so an account reference always maps to the same entity id.
#: Without this, re-running the script would mint new ids and a trail that used
#: to reconnect would silently fall apart.
ACCOUNT_NAMESPACE = uuid.UUID("a71a5000-0000-4000-8000-000000000001")

BATCH = uuid.UUID("a71a5000-0000-4000-8000-0000000000b1")


def entity_id(account_ref: str) -> uuid.UUID:
    return uuid.uuid5(ACCOUNT_NAMESPACE, account_ref)


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenarios", type=int, default=12)
    parser.add_argument("--dataset-version", default="v1")
    args = parser.parse_args()

    settings = get_settings()
    if settings.env is not Environment.DEVELOPMENT:
        print(f"refusing: ATLAS_ENV is {settings.env.value}, not development")
        return 1

    engine = create_async_engine(settings.database_url)
    try:
        async with engine.begin() as conn:
            scenarios = list(
                await conn.execute(
                    text(
                        "SELECT id, scenario_ref, typology, victim_account, "
                        "       fraud_initiated_at "
                        "FROM truth.scenario WHERE dataset_version = :v "
                        "ORDER BY fraud_initiated_at DESC LIMIT :n"
                    ),
                    {"v": args.dataset_version, "n": args.scenarios},
                )
            )
            if not scenarios:
                print(
                    f"no scenarios for dataset_version={args.dataset_version!r} — "
                    f"run `make simulate` first"
                )
                return 1

            await conn.execute(
                text(
                    "DELETE FROM graph.transaction_edge WHERE ingestion_batch_id = :b"
                ),
                {"b": BATCH},
            )

            # Pass one: the accounts. `transaction_edge` has a foreign key into
            # `entity.canonical_entity`, and that is the right shape — an edge
            # between entities nobody has resolved is an edge nobody can explain.
            # Collected first so every edge below lands against a row that exists.
            edges = 0
            skipped = 0
            accounts: set[str] = set()
            hops_by_scenario: dict[uuid.UUID, list[tuple]] = {}
            for scenario_id, scenario_ref, _typology, victim, _started in scenarios:
                hops = list(
                    await conn.execute(
                        text(
                            "SELECT hop_index, from_account, to_account, amount, "
                            "       occurred_at "
                            "FROM truth.layering_hop WHERE scenario_id = :s "
                            "ORDER BY hop_index"
                        ),
                        {"s": scenario_id},
                    )
                )
                hops_by_scenario[scenario_id] = hops
                accounts.add(victim)
                for _i, src, dst, _a, _o in hops:
                    accounts.update((src, dst))

            for account_ref in sorted(accounts):
                await conn.execute(
                    text(
                        "INSERT INTO entity.canonical_entity "
                        "(id, public_ref, kind, attributes, observed_at, "
                        " source_system, source_record_id, ingestion_batch_id, "
                        " classification, is_synthetic) "
                        "VALUES (:id, :ref, 'ACCOUNT', '{}'::jsonb, now(), "
                        " 'simulator', :ref, :batch, 'SENSITIVE', true) "
                        "ON CONFLICT (id) DO NOTHING"
                    ),
                    {"id": entity_id(account_ref), "ref": account_ref, "batch": BATCH},
                )

            for scenario_id, scenario_ref, _typology, victim, _started in scenarios:
                for hop_index, src, dst, amount, occurred_at in hops_by_scenario[
                    scenario_id
                ]:
                    if src == dst:
                        # `graph.transaction_edge` rejects these outright and it
                        # is right to: money from an account to itself is not a
                        # hop. Fixed at source in `Population.sample_mule`, and
                        # skipped here too so an older dataset still loads.
                        skipped += 1
                        continue
                    await conn.execute(
                        text(
                            "INSERT INTO graph.transaction_edge "
                            "(id, from_entity_id, to_entity_id, edge_type, amount, "
                            " currency, occurred_at, observed_at, source_system, "
                            " source_record_id, ingestion_batch_id, classification, "
                            " is_synthetic) "
                            "VALUES (:id, :src, :dst, "
                            " CAST('TRANSFERRED_TO' AS graph.edge_type), :amt, 'INR', "
                            " :occ, :occ, 'simulator', :rec, :batch, 'SENSITIVE', true)"
                        ),
                        {
                            "id": uuid.uuid4(),
                            "src": entity_id(src),
                            "dst": entity_id(dst),
                            "amt": amount,
                            # `observed_at` equals `occurred_at` here because the
                            # simulator emits a complete record at the moment the
                            # money moves. A real feed lags, and the gap between
                            # the two is exactly what §19.1 exists to protect.
                            "occ": occurred_at,
                            "rec": f"{scenario_ref}:{hop_index}",
                            "batch": BATCH,
                        },
                    )
                    edges += 1

        # The victims, written where the demo page can read them. These are the
        # entity ids that actually have outbound money in the graph — without
        # them the walkthrough would have to guess an origin and would usually
        # walk nothing. Generated from what was really ingested, not invented.
        # Ordered by chain length, longest first. The page then takes the first
        # origin that walks rather than probing all of them — forty sequential
        # trail calls is slow enough to outlive an access token, which is how
        # the ranking stage ended up never running.
        origins = sorted(
            (
                {
                    "entity_id": str(entity_id(v)),
                    "account_ref": v,
                    "scenario": ref,
                    "hops": len(hops_by_scenario[sid]),
                }
                for sid, ref, _t, v, _s in scenarios
            ),
            key=lambda o: -int(o["hops"]),
        )
        manifest = REPO / "apps" / "web" / "public" / "demo-origins.json"
        manifest.parent.mkdir(parents=True, exist_ok=True)
        manifest.write_text(
            json.dumps(
                {
                    "dataset_version": args.dataset_version,
                    "batch": str(BATCH),
                    "origins": [o["entity_id"] for o in origins],
                    "detail": origins,
                },
                indent=2,
            )
            + "\n"
        )

        print(f"loaded {edges} hops from {len(scenarios)} scenarios")
        print(f"  origins written     apps/web/public/demo-origins.json")
        if skipped:
            print(f"  skipped             {skipped} self-loop hops (see #50 follow-up)")
        print(f"  distinct accounts   {len(accounts)}")
        print(f"  batch               {BATCH}")
        print("\n  cash-out events stay in `truth` — they are the answer key.")
        print("  Walk a trail from a victim:")
        first_victim = scenarios[0][3]
        print(f"    origin_entity_id  {entity_id(first_victim)}   ({first_victim})")
    finally:
        await engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
