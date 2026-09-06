"""The evaluation harness. Backs ``make eval`` (master spec §21, §49).

Produces a git-SHA-stamped report from **real data**: rankers scored against
ground-truth cash-out locations on a temporal split. Nothing here is a fixture.

Two rules shape the whole file.

**It refuses to report a metric it cannot stand behind.** Before scoring
anything it runs the dataset diagnostics from the Phase 2.5 probe. If the labels
carry no signal — because the generator assigned them at random — then every
metric below is the arithmetic of that randomness, and a report that prints them
without saying so is worse than no report. It is a defensible-looking number
about the wrong thing.

**Every number carries the exact revision that produced it.** A metric nobody
can re-derive is not a metric (CLAUDE.md rule 2). The report records the git SHA,
the dataset version, the seed and whether the working tree was dirty when it ran.

Reads ground truth for labels, offline, as ``atlas_sim``. Evaluation may see the
answer; the serving path may not, and the import contract keeps
``atlas.features`` and ``atlas.predict`` away from anything that can reach it.
"""

from __future__ import annotations

import asyncio
import json
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "apps" / "api"))
sys.path.insert(0, str(REPO))

from ml.evaluation.metrics import (
    prediction_accuracy_index,
    recall_at_k,
)
from ml.evaluation.quotable import assess
from ml.probe.run import (
    Case,
    diagnose_dataset,
    load_cases,
    rank_by_prior,
    rank_conditional,
)

REPORT_DIR = REPO / "reports" / "eval"
DATASET_VERSION = "v1"
K_VALUES = (1, 2, 3, 5)


def _git(*args: str) -> str:
    try:
        return subprocess.check_output(["git", *args], cwd=REPO, text=True).strip()
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        return "unknown"


def _provenance() -> dict[str, Any]:
    """What produced this report.

    ``working_tree_dirty`` matters more than it looks: a SHA identifies the last
    commit, not the code that ran. A report generated from uncommitted changes is
    stamped with a revision that does not contain them, and nothing about the
    number would show it.
    """
    dirty = _git("status", "--porcelain") != ""
    return {
        "git_sha": _git("rev-parse", "--short", "HEAD"),
        "git_branch": _git("rev-parse", "--abbrev-ref", "HEAD"),
        "working_tree_dirty": dirty,
        "generated_at": datetime.now(UTC).isoformat(),
        "dataset_version": DATASET_VERSION,
    }


def _score(
    name: str,
    test: list[Case],
    zones: list[str],
    ranking_for: Any,
) -> dict[str, Any]:
    """Recall@K and PAI for one ranker, at each K."""
    labelled = [c for c in test if c.cash_out_zone]
    rankings = {str(i): ranking_for(case) for i, case in enumerate(labelled)}
    truth = {
        str(i): case.cash_out_zone
        for i, case in enumerate(labelled)
        if case.cash_out_zone
    }

    per_k = []
    for k in K_VALUES:
        if k > len(zones):
            continue
        recall = recall_at_k(rankings, truth, k)
        pai = prediction_accuracy_index(
            hits=round(recall * len(labelled)),
            total_hits=len(labelled),
            flagged_area=float(k),
            total_area=float(len(zones)),
            # Zones are administrative areas of unequal size, so this is a zone
            # count and not true area. PAI is only comparable at a fixed H3
            # resolution (ADR-011), which needs endpoint coordinates the
            # simulator does not yet emit — recorded here so a reader cannot
            # mistake this for the comparable form.
            h3_resolution=0,
        )
        per_k.append(
            {
                "k": k,
                "recall_at_k": round(recall, 4),
                "pai": round(pai.value, 4),
                "area_flagged_fraction": round(k / len(zones), 4),
            }
        )

    return {"ranker": name, "cases_scored": len(labelled), "by_k": per_k}


def _uplift(model: dict[str, Any], baseline: dict[str, Any]) -> list[dict[str, Any]]:
    """Uplift over the baseline at each K.

    The headline is always uplift, never raw accuracy (CLAUDE.md rule 3). On an
    imbalanced problem a raw number can look impressive while being worse than
    flagging at random, and the baseline is the only thing that says which.
    """
    by_k = {row["k"]: row for row in baseline["by_k"]}
    out = []
    for row in model["by_k"]:
        base = by_k.get(row["k"])
        if base is None:
            continue
        out.append(
            {
                "k": row["k"],
                "recall_delta": round(row["recall_at_k"] - base["recall_at_k"], 4),
                "pai_delta": round(row["pai"] - base["pai"], 4),
                "beats_baseline": row["pai"] > base["pai"],
            }
        )
    return out


async def build_report() -> dict[str, Any]:
    cases = await load_cases(DATASET_VERSION)
    if not cases:
        return {
            "provenance": _provenance(),
            "status": "NO_DATA",
            "detail": (
                f"truth.{DATASET_VERSION} is empty. Run "
                f"`python -m simulator --force` to generate a dataset."
            ),
        }

    zones = sorted({c.cash_out_zone for c in cases if c.cash_out_zone})
    split = len(cases) // 2
    train, test = cases[:split], cases[split:]

    usable = diagnose_dataset(cases, zones)

    prior = rank_by_prior(train, zones)
    conditional = rank_conditional(train, zones)

    baseline = _score("historical zone frequency", test, zones, lambda c: prior)
    model = _score(
        "victim zone x typology, backing off to prior",
        test,
        zones,
        lambda c: conditional.get((c.victim_zone or "", c.typology), prior),
    )

    distinct_times = len({c.fraud_initiated_at for c in cases})
    # `realism_passed=False` is not a measurement — this harness has no way to
    # run the Benford check, which lives in `simulator/validation` and scores the
    # generator's own amounts. It fails closed rather than assuming: an
    # unverified dataset must not be reported as a verified one, and #45 says
    # this one does in fact fail.
    verdict = assess(
        has_data=True,
        realism_passed=False,
        has_signal=usable,
        distinct_event_times=distinct_times,
    )

    return {
        "provenance": _provenance(),
        "status": "OK" if usable else "DATASET_HAS_NO_SIGNAL",
        "quotable": {
            "verdict": verdict.quotable,
            "blockers": list(verdict.blockers),
        },
        "dataset": {
            "scenarios": len(cases),
            "candidate_zones": len(zones),
            "train": len(train),
            "test": len(test),
            "distinct_fraud_timestamps": distinct_times,
        },
        "baseline": baseline,
        "model": model,
        "uplift_over_baseline": _uplift(model, baseline),
        "not_computed": {
            "PEI": "formula not implemented (ml/evaluation/metrics.py)",
            "hit_within_radius": "needs endpoint coordinates; atlas.geo does not supply them yet",
            "ECE": "no calibrated probabilities exist to score",
            "lead_time": "every scenario shares one fraud timestamp (issue #50)",
        },
        "caveats": [
            "Dataset failed the Benford realism check (issue #45); it is not validated.",
            (
                "Cash-out zone is independent of the money trail (issue #50), so "
                "these numbers measure the generator, not the approach."
            ),
            (
                "PAI here is normalised by zone count, not area. It is not "
                "comparable to PAI at a fixed H3 resolution (ADR-011)."
            ),
            (
                "The separability gate has never run — a feature could be leaking "
                "the label with nothing to catch it."
            ),
        ],
    }


def write_report(report: dict[str, Any]) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    sha = report["provenance"]["git_sha"]
    stamp = int(datetime.now(UTC).timestamp())
    path = REPORT_DIR / f"eval_{sha}_{stamp}.json"
    # allow_nan=False: NaN is not valid JSON, and Python is the only parser that
    # tolerates it. A report jq and the dashboard cannot read is not a report.
    path.write_text(json.dumps(report, indent=2, allow_nan=False))
    return path


def _print(report: dict[str, Any]) -> None:
    p = report["provenance"]
    print(f"\nATLAS evaluation · {p['git_sha']} · {p['dataset_version']}")
    if p["working_tree_dirty"]:
        print("  ⚠  working tree is dirty — this report does not match its own SHA")

    if report["status"] == "NO_DATA":
        print(f"  {report['detail']}")
        return

    quotable = report.get("quotable", {})
    if not quotable.get("verdict", False):
        print("\n  ⛔ NOT QUOTABLE — nothing below may be published as a metric")
        for blocker in quotable.get("blockers", []):
            print(f"     · {blocker}")

    d = report["dataset"]
    print(
        f"  {d['scenarios']} scenarios · {d['candidate_zones']} zones · "
        f"{d['train']}/{d['test']} train/test"
    )

    for section in ("baseline", "model"):
        block = report[section]
        print(f"\n  {section}: {block['ranker']}")
        print(f"    {'K':>3}  {'recall@K':>9}  {'PAI':>7}")
        for row in block["by_k"]:
            print(f"    {row['k']:>3}  {row['recall_at_k']:>8.1%}  {row['pai']:>7.2f}")

    print("\n  uplift over baseline")
    for row in report["uplift_over_baseline"]:
        mark = "+" if row["beats_baseline"] else " "
        print(
            f"    K={row['k']}  PAI {row['pai_delta']:+.2f}  "
            f"recall {row['recall_delta']:+.1%}  {mark}"
        )

    if report["status"] != "OK":
        print(f"\n  ── {report['status']} ──")
        print("  These numbers are not project metrics. See caveats in the report.")

    print("\n  not computed:")
    for name, why in report["not_computed"].items():
        print(f"    {name:20} {why}")


async def main() -> int:
    report = await build_report()
    _print(report)
    path = write_report(report)
    print(f"\n  written to {path.relative_to(REPO)}")
    return 0 if report["status"] in ("OK", "DATASET_HAS_NO_SIGNAL") else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
