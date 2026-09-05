"""
ATLAS evaluation harness — Issue #18.

Backs `make eval`. Produces a git-SHA-stamped report so every number
that ends up on a slide traces back to an exact, reproducible run.

Honesty rules this file exists to enforce:
  - The headline number is always UPLIFT OVER A BASELINE, never raw
    accuracy (raw accuracy is easy to game on an imbalanced problem
    like this - most zones/accounts are NOT fraud hotspots).
  - Every tier is scored on its own metric, never blended into one
    "confidence" number.
  - A metric that is not genuinely implemented must raise
    NotImplementedError, never return a placeholder value. A
    hardcoded 0.0 flowing into a SHA-stamped report is worse than no
    number at all, because it is reproducible and wrong.
  - Nothing in this file may import from the simulator's hidden
    ground-truth objects directly - it only reads whatever the
    trained models predicted, plus the held-out labels released for
    evaluation. (See leakage-gate ADRs.)

Status against Issue #18's six required metrics:
  PAI (Prediction Accuracy Index)   - IMPLEMENTED, hand-verified
  Recall@K (K = 1, 3, 5, 10)        - IMPLEMENTED, hand-verified
  ECE (calibration error)            - IMPLEMENTED, standard definition
  Lead time (distribution)           - IMPLEMENTED, late predictions
                                        reported separately, never
                                        folded into a mean
  PEI (Predictive Efficiency Index)  - NOT IMPLEMENTED - formula not
                                        yet confirmed against the issue
  Hit-within-radius (500m/2km/5km)   - NOT IMPLEMENTED - needs real
                                        lat/lon + haversine distance,
                                        which does not exist yet
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPORT_DIR = Path("reports/eval")


# =======================================================================
# PAI - Prediction Accuracy Index
# =======================================================================
@dataclass
class PAIResult:
    """value > 1.0 means you beat random area-proportional flagging.
    value == 1.0 means you did no better than flagging at random.
    """

    value: float
    h3_resolution: int
    hits: int
    total_hits: int
    flagged_area: float
    total_area: float


def prediction_accuracy_index(
    hits: int,
    total_hits: int,
    flagged_area: float,
    total_area: float,
    h3_resolution: int,
) -> PAIResult:
    """
    PAI = (hits / total_hits) / (flagged_area / total_area)

    Area-normalised: rewards catching a large share of cash-outs while
    flagging a small share of the map. A model that just flags 90% of
    the map and catches 90% of hits gets PAI = 1.0 - no better than
    chance. A model that flags 5% of the map and catches 40% of hits
    gets PAI = 8.0 - 8x better than random.

    Hand-verified example (from the review): 100 cash-outs total, 5%
    of the area flagged, 40 of the 100 caught inside the flagged area
    -> PAI = (40/100) / (5/100) = 0.40 / 0.05 = 8.0
    """
    if total_hits <= 0:
        raise ValueError(
            "total_hits must be > 0 - cannot compute PAI with no ground-truth events"
        )
    if total_area <= 0:
        raise ValueError("total_area must be > 0")
    if flagged_area <= 0:
        raise ValueError(
            "flagged_area must be > 0 - PAI is undefined for flagging nothing "
            "(division by zero); a model that flags nothing should be scored "
            "separately as a non-participation case, not fed into this formula"
        )
    if flagged_area > total_area:
        raise ValueError("flagged_area cannot exceed total_area")

    hit_rate = hits / total_hits
    area_fraction = flagged_area / total_area
    return PAIResult(
        value=hit_rate / area_fraction,
        h3_resolution=h3_resolution,
        hits=hits,
        total_hits=total_hits,
        flagged_area=flagged_area,
        total_area=total_area,
    )


def compare_pai(a: PAIResult, b: PAIResult) -> float:
    """Difference in PAI, a minus b.

    Refuses to compare across different H3 resolutions: PAI is area-
    normalised, and area itself changes with resolution, so a PAI of
    8.0 at resolution 8 is not comparable to a PAI of 8.0 at
    resolution 9. Comparing them silently would produce a number that
    looks meaningful and is not - exactly the failure mode this file
    exists to prevent.
    """
    if a.h3_resolution != b.h3_resolution:
        raise ValueError(
            f"Cannot compare PAI across different H3 resolutions "
            f"({a.h3_resolution} vs {b.h3_resolution}) - area "
            f"normalisation is resolution-dependent. Re-run both at "
            f"the same resolution before comparing."
        )
    return a.value - b.value


# =======================================================================
# Recall@K
# =======================================================================
def recall_at_k(
    rankings: dict[str, list[str]],
    true_endpoint: dict[str, str],
    k: int,
) -> float:
    """
    Fraction of cases where the true endpoint appears within the top K
    ranked candidates.

    rankings: {complaint_id: [endpoint_id, ...]} ordered most-likely first
    true_endpoint: {complaint_id: endpoint_id} - the endpoint actually
                   used, from the held-out evaluation release only.

    Hand-verified example: 2 cases.
      CMP1: true endpoint "B", ranked ["A", "B", "C"], k=2 -> hit (B is in top 2)
      CMP2: true endpoint "D", ranked ["A", "B", "C"], k=2 -> miss (D absent)
      recall@2 = 1 hit / 2 total = 0.5
    """
    if k < 1:
        raise ValueError("k must be >= 1")

    hits = 0
    total = 0
    for complaint_id, target in true_endpoint.items():
        total += 1
        ranked = rankings.get(complaint_id, [])
        if target in ranked[:k]:
            hits += 1

    return hits / total if total else 0.0


# =======================================================================
# ECE - Expected Calibration Error (standard definition)
# =======================================================================
def expected_calibration_error(
    predicted_probs: list[float],
    true_labels: list[bool],
    n_bins: int = 10,
) -> float:
    """
    Standard ECE: bin predictions by predicted probability, compare the
    average predicted probability in each bin against the actual
    positive rate in that bin, weight by bin size, sum.

    ECE = sum_over_bins( |bin_size| / N * |avg_predicted - actual_rate| )

    A well-calibrated model (when it says "70% risk", the zone is
    actually risky ~70% of the time) has ECE near 0.

    Hand-verified example: 4 predictions, 2 bins.
      Bin [0.0, 0.5): preds [0.2, 0.3], labels [False, False]
        avg_predicted = 0.25, actual_rate = 0/2 = 0.0, |diff| = 0.25
      Bin [0.5, 1.0]: preds [0.8, 0.9], labels [True, True]
        avg_predicted = 0.85, actual_rate = 2/2 = 1.0, |diff| = 0.15
      ECE = (2/4)*0.25 + (2/4)*0.15 = 0.125 + 0.075 = 0.20
    """
    if len(predicted_probs) != len(true_labels):
        raise ValueError("predicted_probs and true_labels must be the same length")
    if not predicted_probs:
        raise ValueError("cannot compute ECE on empty input")
    if n_bins < 1:
        raise ValueError("n_bins must be >= 1")

    n = len(predicted_probs)
    bin_width = 1.0 / n_bins
    total_error = 0.0

    for bin_idx in range(n_bins):
        lo = bin_idx * bin_width
        hi = (
            1.0 if bin_idx == n_bins - 1 else lo + bin_width
        )  # last bin is closed on the right

        bin_indices = [
            i
            for i, p in enumerate(predicted_probs)
            if (p >= lo and p < hi) or (bin_idx == n_bins - 1 and p == hi)
        ]
        if not bin_indices:
            continue

        bin_preds = [predicted_probs[i] for i in bin_indices]
        bin_labels = [true_labels[i] for i in bin_indices]

        avg_predicted = sum(bin_preds) / len(bin_preds)
        actual_rate = sum(1 for lbl in bin_labels if lbl) / len(bin_labels)
        bin_weight = len(bin_indices) / n

        total_error += bin_weight * abs(avg_predicted - actual_rate)

    return total_error


# =======================================================================
# Lead time - the distribution, never a mean; late predictions are
# reported as failures, never scored as successes regardless of rank
# =======================================================================
@dataclass
class LeadTimeReport:
    on_time_minutes: list[
        float
    ]  # lead time, only for predictions that arrived before cash-out
    late_count: int  # predictions that arrived at or after cash-out - zero warning
    total_count: int

    @property
    def late_fraction(self) -> float:
        return self.late_count / self.total_count if self.total_count else 0.0

    def percentile(self, p: float) -> float:
        """p in [0, 100]. Returns 0.0 if there are no on-time predictions
        at all - callers must check late_fraction before trusting this.
        """
        if not self.on_time_minutes:
            return 0.0
        ordered = sorted(self.on_time_minutes)
        idx = min(len(ordered) - 1, max(0, round((p / 100) * (len(ordered) - 1))))
        return ordered[idx]


def compute_lead_time(
    predicted_at: dict[str, datetime],
    actual_cashout_at: dict[str, datetime],
) -> LeadTimeReport:
    """
    Lead time = actual_cashout_at - predicted_at, in minutes.

    A prediction that arrives AT OR AFTER the cash-out already happened
    provides zero real warning, no matter how accurate it was - it is
    counted in late_count, never averaged into the timing distribution.
    This is the rule the review called out explicitly: a late-but-
    correct prediction must not score as a success.

    Hand-verified example: 3 cases.
      CMP1: predicted 10:00, cashed out 10:30 -> 30 min lead, on-time
      CMP2: predicted 10:00, cashed out 09:45 -> -15 min -> LATE
      CMP3: predicted 10:00, cashed out 10:00 -> 0 min -> LATE (not "on time")
      -> on_time_minutes = [30.0], late_count = 2, total_count = 3
    """
    on_time: list[float] = []
    late = 0
    total = 0

    for complaint_id, actual in actual_cashout_at.items():
        predicted = predicted_at.get(complaint_id)
        if predicted is None:
            continue
        total += 1
        delta_minutes = (actual - predicted).total_seconds() / 60.0
        if delta_minutes <= 0:
            late += 1
        else:
            on_time.append(delta_minutes)

    return LeadTimeReport(on_time_minutes=on_time, late_count=late, total_count=total)


# =======================================================================
# NOT YET IMPLEMENTED - raise loudly rather than return a stub value.
# See module docstring for why each is blocked.
# =======================================================================
def predictive_efficiency_index(*args: Any, **kwargs: Any) -> float:
    raise NotImplementedError(
        "PEI (Predictive Efficiency Index) formula has not been confirmed "
        "against Issue #18's actual spec text yet. Do not guess at this - "
        "paste the issue's definition before implementing."
    )


def hit_within_radius(*args: Any, **kwargs: Any) -> float:
    raise NotImplementedError(
        "Hit-within-radius (500m/2km/5km) needs real lat/lon coordinates "
        "and a haversine-distance utility, neither of which exist yet "
        "(atlas.geo is not implemented). Implementing this now would "
        "mean faking the geo layer just to satisfy this function."
    )


# =======================================================================
# Baselines - unchanged from before, still useful as comparison points
# for whichever metrics end up wrapping them.
# =======================================================================
def baseline_mule_risk(account_age_days: float, threshold_days: float = 14) -> bool:
    """'Flag it if the account is very new.' The bar a real model has to beat."""
    return account_age_days < threshold_days


# =======================================================================
# Report generation - the git-SHA-stamped output judges/teammates read
# =======================================================================
def _current_git_sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], text=True
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        return "unknown"


def generate_report(
    pai: PAIResult,
    recall_at_k_results: dict[int, float],
    ece: float,
    lead_time: LeadTimeReport,
) -> dict[str, Any]:
    """
    Only includes metrics that were actually computed. PEI and
    hit-within-radius are deliberately absent, not present-as-null -
    their functions raise before this is ever called, so there is no
    silent placeholder to accidentally serialise.
    """
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "git_sha": _current_git_sha(),
        "pai": asdict(pai),
        "recall_at_k": recall_at_k_results,
        "ece": ece,
        "lead_time": {
            "on_time_minutes": lead_time.on_time_minutes,
            "late_count": lead_time.late_count,
            "total_count": lead_time.total_count,
            "late_fraction": lead_time.late_fraction,
            "p50_minutes": lead_time.percentile(50),
            "p90_minutes": lead_time.percentile(90),
        },
        "note": (
            "PEI and hit-within-radius are not yet implemented and are "
            "intentionally omitted from this report rather than filled "
            "with a placeholder. Lead time excludes late predictions from "
            "the timing distribution - see late_fraction."
        ),
    }


def write_report(report: dict[str, Any]) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = (
        REPORT_DIR
        / f"eval_{report['git_sha']}_{int(datetime.now(timezone.utc).timestamp())}.json"
    )
    # allow_nan=False: fail loudly at write time if a NaN/Infinity ever
    # sneaks in, rather than writing invalid JSON that only Python's own
    # parser tolerates. jq, JSON.parse, and the dashboard all reject NaN.
    out_path.write_text(json.dumps(report, indent=2, allow_nan=False))
    return out_path


def main() -> None:
    # TODO: replace these stub inputs with real outputs from the
    # prediction layer, scored against the held-out evaluation release
    # produced by the simulator, once both exist.
    pai = prediction_accuracy_index(
        hits=40,
        total_hits=100,
        flagged_area=5.0,
        total_area=100.0,
        h3_resolution=8,
    )

    rankings = {"CMP1": ["A", "B", "C"], "CMP2": ["A", "B", "C"]}
    true_endpoint = {"CMP1": "B", "CMP2": "D"}
    recall_results = {k: recall_at_k(rankings, true_endpoint, k) for k in (1, 3, 5, 10)}

    ece = expected_calibration_error(
        predicted_probs=[0.2, 0.3, 0.8, 0.9],
        true_labels=[False, False, True, True],
        n_bins=2,
    )

    lead_time = compute_lead_time(
        predicted_at={"CMP1": datetime(2026, 1, 1, 10, 0, tzinfo=timezone.utc)},
        actual_cashout_at={"CMP1": datetime(2026, 1, 1, 10, 30, tzinfo=timezone.utc)},
    )

    report = generate_report(pai, recall_results, ece, lead_time)
    path = write_report(report)

    print(f"Eval report written to {path}")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
