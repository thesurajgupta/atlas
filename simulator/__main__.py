"""Generate a synthetic dataset and write its ground truth (master spec §23).

Backs ``make simulate``.

    python -m simulator --scenarios-per-typology 400 --seed 26184

Two things this command will not do.

It will not write a dataset that fails the realism checks unless told to. A
dataset that fails §23.3 produces metrics that look like measurements and are
not, and the failure is easy to scroll past — so it stops instead. ``--force``
exists for working on the generators themselves, and says plainly in the output
that the dataset is not validated.

It will not connect as the application user. The ``truth`` schema is reachable
only by ``atlas_sim``, and that is leakage gate 2 (§19.2) — the serving path's
credentials do not open this door.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from random import Random
from urllib.parse import quote_plus

from sqlalchemy.ext.asyncio import create_async_engine

from simulator.generators.endpoints import EndpointCatalog
from simulator.generators.population import Population
from simulator.truth.writer import ensure_schema, write_dataset
from simulator.validation import generate_scenario_batch, run_realism_checks
from simulator.validation.report import RealismReport

#: Committed default so `make simulate` with no arguments is reproducible.
DEFAULT_SEED = 26184
DEFAULT_VERSION = "v1"


def _sim_database_url() -> str:
    """Connection string for the simulator role.

    Built from the same settings the application uses, but with the ``atlas_sim``
    credentials substituted. Importing `atlas.core.config` here is safe in the
    direction that matters: the import-linter contract forbids `atlas.*` from
    importing `simulator`, not the reverse, and reusing the settings object
    avoids a second copy of the host/port/database that could drift.
    """
    sys.path.insert(0, "apps/api")
    from atlas.core.config import get_settings

    s = get_settings()
    user = quote_plus("atlas_sim")
    password = quote_plus(s.db_password)
    return f"postgresql+asyncpg://{user}:{password}@{s.db_host}:{s.db_port}/{s.db_name}"


#: Where the realism verdict is recorded for a dataset that was written.
#:
#: The evaluation harness runs in a separate process and cannot re-derive this —
#: the checks need the scenario objects, which only exist during generation. It
#: previously hardcoded ``realism_passed=False`` and failed closed, which was the
#: right default and also meant a validated dataset could never be reported as
#: validated. This is the missing channel between the two.
REALISM_DIR = Path(__file__).resolve().parents[1] / "reports" / "realism"


def _write_realism_record(
    version: str, seed: int, report: RealismReport, *, forced: bool
) -> None:
    """Record whether this dataset passed §23.3, next to the dataset it describes.

    ``forced`` is written as its own field rather than folded into ``passed``. A
    dataset written with ``--force`` did not pass, and a reader that only sees a
    boolean cannot tell "passed" from "was written anyway" — which is precisely
    the distinction the harness needs before it lets a number be quoted.
    """
    REALISM_DIR.mkdir(parents=True, exist_ok=True)
    (REALISM_DIR / f"{version}.json").write_text(
        json.dumps(
            {
                "dataset_version": version,
                "seed": seed,
                "generated_at": datetime.now(UTC).isoformat(),
                "passed": report.passes and not forced,
                "forced": forced,
                "benford": {
                    "mad": round(report.benford.statistic, 6),
                    "conformity": report.benford.conformity,
                    "sample_size": report.benford.sample_size,
                    "passed": report.benford.passes,
                },
                "degree_gini": round(report.degree_distribution.gini, 4),
                "separability_status": report.separability_status,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )


async def run(args: argparse.Namespace) -> int:
    rng = Random(args.seed)
    population = Population()
    endpoints = EndpointCatalog()

    print(f"generating  seed={args.seed}  version={args.version}")
    scenarios = generate_scenario_batch(
        rng, population, endpoints, count_per_typology=args.scenarios_per_typology
    )
    print(f"  {len(scenarios)} scenarios, {sum(len(s.hops) for s in scenarios)} hops")

    print("validating realism (§23.3)")
    report = run_realism_checks(scenarios, population)
    print(
        f"  benford            {'pass' if report.benford.passes else 'FAIL'}"
        f"  (MAD {report.benford.statistic:.4f}, {report.benford.conformity})"
    )
    print(
        f"  degree distribution {'pass' if report.degree_distribution.passes else 'FAIL'}"
        f"  (gini {report.degree_distribution.gini:.2f})"
    )
    amounts_ok = all(r.passes for r in report.amounts_by_typology.values())
    timing_ok = all(t.passes for rs in report.timing_by_typology.values() for t in rs)
    print(f"  amount sanity      {'pass' if amounts_ok else 'FAIL'}")
    print(f"  timing sanity      {'pass' if timing_ok else 'FAIL'}")
    print(f"  separability       {report.separability_status.split(':')[0]}")

    if not report.passes and not args.force:
        print("\nrefusing to write: realism checks did not pass.")
        print("Every metric computed against this dataset would be uninterpretable.")
        print(
            "Re-run with --force only if you are working on the generators themselves."
        )
        return 1

    engine = create_async_engine(_sim_database_url())
    try:
        await ensure_schema(engine)
        counts = await write_dataset(
            engine, scenarios, dataset_version=args.version, seed=args.seed
        )
    finally:
        await engine.dispose()

    _write_realism_record(args.version, args.seed, report, forced=args.force)

    print(f"\nwrote truth.{args.version}")
    print(f"  scenarios  {counts['scenarios']}")
    print(f"  hops       {counts['hops']}")
    print(f"  cash-outs  {counts['cash_outs']}")

    if not report.passes:
        print("\n  ⚠  written with --force. This dataset is NOT validated;")
        print("     do not quote any metric computed against it.")
    if report.separability_status.startswith("NOT_RUN"):
        print("\n  ⚠  the separability gate did not run — it needs the")
        print("     synthetic-normal population, which does not exist yet.")
        print("     See docs/ml/simulator-limitations.md.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m simulator", description=__doc__)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument(
        "--version", default=DEFAULT_VERSION, help="dataset version label"
    )
    # 400, not 100. Benford MAD is a large-sample statistic and at n≈2,700 amounts
    # its sampling error (sd ≈ 0.0010, measured over six seeds) is a sixth of the
    # 0.012 threshold — close enough that the committed seed alone decided whether
    # the gate passed. Seed 26184 scored 0.0122 while seeds 0–5 spanned 0.0067–0.0094
    # on identical generators, which makes the verdict a property of the draw rather
    # than of the data.
    #
    # At 400 per typology (n≈10,700) the mean falls to 0.0053 and the gate is
    # measuring the generators again. This raises the gate's power; it does not
    # relax it — the threshold is unchanged and the old amount distribution still
    # fails at 0.0188.
    parser.add_argument("--scenarios-per-typology", type=int, default=400)
    parser.add_argument(
        "--force",
        action="store_true",
        help="write even if realism checks fail (generator development only)",
    )
    return asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
