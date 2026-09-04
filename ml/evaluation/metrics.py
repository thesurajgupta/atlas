"""
ATLAS evaluation harness — Issue #18.

Backs `make eval`. Produces a git-SHA-stamped report so every number
that ends up on a slide traces back to an exact, reproducible run.

Honesty rules this file exists to enforce:
  - The headline number is always UPLIFT OVER A BASELINE, never raw
    accuracy (raw accuracy is easy to game on an imbalanced problem
    like this — most zones/accounts are NOT fraud hotspots).
  - Every tier is scored on its own metric, never blended into one
    "confidence" number.
  - Nothing in this file may import from the simulator's hidden
    ground-truth objects directly — it only reads whatever the
    trained models predicted, plus the held-out labels released
    for evaluation. (See leakage-gate ADRs.)
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path


REPORT_DIR = Path("reports/eval")


# ---------------------------------------------------------------------
# Baselines — the "dumb but honest" comparison point for each tier.
# A model that can't beat these shouldn't ship.
# ---------------------------------------------------------------------
def baseline_zone_risk(historical_cashout_density: dict[str, float]) -> dict[str, float]:
    """Tier 1 baseline: 'risk = however often this zone has seen
    cash-out historically.' No model, just a lookup table.
    """
    return historical_cashout_density
    # TODO: replace input with the actual public feature the model sees,
    # once ml/features exists.


def baseline_endpoint_ranking(candidate_endpoints: list[str], last_hop_coords) -> list[str]:
    """Tier 2 baseline: rank candidate endpoints purely by physical
    distance from the last known mule hop. No network/behavioral signal
    at all — this is the bar the LambdaMART ranker has to clear.
    """
    # TODO: real distance calc once the geo utilities exist.
    return candidate_endpoints  # stub: unranked passthrough


def baseline_mule_risk(account_age_days: float, threshold_days: float = 14) -> bool:
    """Tier 3 baseline: 'flag it if the account is very new.'
    One rule, one threshold — the simplest thing that isn't random.
    """
    return account_age_days < threshold_days


# ---------------------------------------------------------------------
# Tier 1 — Zone risk: binary classification per H3 cell / window
# ---------------------------------------------------------------------
@dataclass
class Tier1Result:
    model_auc: float
    baseline_auc: float
    model_precision_at_10: float
    baseline_precision_at_10: float

    @property
    def uplift_auc_pct(self) -> float:
        return _pct_uplift(self.model_auc, self.baseline_auc)

    @property
    def uplift_precision_at_10_pct(self) -> float:
        return _pct_uplift(self.model_precision_at_10, self.baseline_precision_at_10)


def evaluate_tier1(model_scores: dict[str, float], baseline_scores: dict[str, float],
                    true_labels: dict[str, bool]) -> Tier1Result:
    """
    model_scores / baseline_scores: {h3_cell: risk_score}
    true_labels: {h3_cell: did_cashout_actually_happen_here} — from the
                 HELD-OUT evaluation release, never seen during training.
    """
    return Tier1Result(
        model_auc=_auc(model_scores, true_labels),
        baseline_auc=_auc(baseline_scores, true_labels),
        model_precision_at_10=_precision_at_k(model_scores, true_labels, k=10),
        baseline_precision_at_10=_precision_at_k(baseline_scores, true_labels, k=10),
    )
    # TODO: swap in sklearn.metrics.roc_auc_score for _auc once wired
    # to real arrays instead of dicts.


# ---------------------------------------------------------------------
# Tier 2 — Case-conditioned ranking: learning-to-rank metrics
# ---------------------------------------------------------------------
@dataclass
class Tier2Result:
    model_ndcg_at_5: float
    baseline_ndcg_at_5: float
    model_mrr: float
    baseline_mrr: float

    @property
    def uplift_ndcg_pct(self) -> float:
        return _pct_uplift(self.model_ndcg_at_5, self.baseline_ndcg_at_5)

    @property
    def uplift_mrr_pct(self) -> float:
        return _pct_uplift(self.model_mrr, self.baseline_mrr)


def evaluate_tier2(model_rankings: dict[str, list[str]],
                    baseline_rankings: dict[str, list[str]],
                    true_endpoint: dict[str, str]) -> Tier2Result:
    """
    *_rankings: {complaint_id: [endpoint_id, ...]} ordered most-likely first
    true_endpoint: {complaint_id: endpoint_id} the endpoint actually used —
                   again, only from the held-out evaluation release.
    """
    return Tier2Result(
        model_ndcg_at_5=_ndcg_at_k(model_rankings, true_endpoint, k=5),
        baseline_ndcg_at_5=_ndcg_at_k(baseline_rankings, true_endpoint, k=5),
        model_mrr=_mrr(model_rankings, true_endpoint),
        baseline_mrr=_mrr(baseline_rankings, true_endpoint),
    )


# ---------------------------------------------------------------------
# Tier 3 — Mule & endpoint risk: binary classification
# ---------------------------------------------------------------------
@dataclass
class Tier3Result:
    model_f1: float
    baseline_f1: float
    model_precision: float
    baseline_precision: float

    @property
    def uplift_f1_pct(self) -> float:
        return _pct_uplift(self.model_f1, self.baseline_f1)


def evaluate_tier3(model_flags: dict[str, bool], baseline_flags: dict[str, bool],
                    true_labels: dict[str, bool]) -> Tier3Result:
    return Tier3Result(
        model_f1=_f1(model_flags, true_labels),
        baseline_f1=_f1(baseline_flags, true_labels),
        model_precision=_precision(model_flags, true_labels),
        baseline_precision=_precision(baseline_flags, true_labels),
    )


# ---------------------------------------------------------------------
# Metric primitives — deliberately simple, swap for sklearn once real
# arrays exist. Kept dependency-free so this module is easy to unit test.
# ---------------------------------------------------------------------
def _pct_uplift(model_value: float, baseline_value: float) -> float:
    if baseline_value == 0:
        return float("nan")
    return 100.0 * (model_value - baseline_value) / baseline_value


def _auc(scores: dict, labels: dict) -> float:
    # TODO: real ROC-AUC. Stub returns a placeholder so the harness runs.
    return 0.0


def _precision_at_k(scores: dict, labels: dict, k: int) -> float:
    top_k = sorted(scores, key=scores.get, reverse=True)[:k]
    hits = sum(1 for cell in top_k if labels.get(cell, False))
    return hits / k if k else 0.0


def _ndcg_at_k(rankings: dict, true_endpoint: dict, k: int) -> float:
    # TODO: real NDCG computation with graded relevance.
    return 0.0


def _mrr(rankings: dict, true_endpoint: dict) -> float:
    reciprocal_ranks = []
    for cid, ranked_list in rankings.items():
        target = true_endpoint.get(cid)
        if target in ranked_list:
            rank = ranked_list.index(target) + 1
            reciprocal_ranks.append(1.0 / rank)
        else:
            reciprocal_ranks.append(0.0)
    return sum(reciprocal_ranks) / len(reciprocal_ranks) if reciprocal_ranks else 0.0


def _f1(flags: dict, labels: dict) -> float:
    p = _precision(flags, labels)
    tp = sum(1 for k, v in flags.items() if v and labels.get(k))
    fn = sum(1 for k, v in labels.items() if v and not flags.get(k))
    r = tp / (tp + fn) if (tp + fn) else 0.0
    return 2 * p * r / (p + r) if (p + r) else 0.0


def _precision(flags: dict, labels: dict) -> float:
    tp = sum(1 for k, v in flags.items() if v and labels.get(k))
    fp = sum(1 for k, v in flags.items() if v and not labels.get(k))
    return tp / (tp + fp) if (tp + fp) else 0.0


# ---------------------------------------------------------------------
# Report generation — the git-SHA-stamped output judges/teammates read
# ---------------------------------------------------------------------
def _current_git_sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], text=True
        ).strip()
    except Exception:
        return "unknown"


def generate_report(tier1: Tier1Result, tier2: Tier2Result, tier3: Tier3Result,
                     simulation_seed: int) -> dict:
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "git_sha": _current_git_sha(),
        "simulation_seed": simulation_seed,
        "tier1_zone_risk": {
            **asdict(tier1),
            "uplift_auc_pct": tier1.uplift_auc_pct,
            "uplift_precision_at_10_pct": tier1.uplift_precision_at_10_pct,
        },
        "tier2_case_ranking": {
            **asdict(tier2),
            "uplift_ndcg_pct": tier2.uplift_ndcg_pct,
            "uplift_mrr_pct": tier2.uplift_mrr_pct,
        },
        "tier3_mule_risk": {
            **asdict(tier3),
            "uplift_f1_pct": tier3.uplift_f1_pct,
        },
        "note": "Headline numbers are uplift-over-baseline. Raw accuracy "
                "is intentionally not surfaced as a standalone claim.",
    }
    return report


def write_report(report: dict) -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = REPORT_DIR / f"eval_{report['git_sha']}_{int(datetime.now().timestamp())}.json"
    out_path.write_text(json.dumps(report, indent=2))
    return out_path


# ---------------------------------------------------------------------
# Entry point — this is what `make eval` calls
# ---------------------------------------------------------------------
def main():
    # TODO: replace these stub inputs with real outputs from the
    # prediction layer, scored against the held-out evaluation release
    # produced by the simulator.
    stub_labels = {"h3_a": True, "h3_b": False, "h3_c": True}
    stub_scores_model = {"h3_a": 0.9, "h3_b": 0.2, "h3_c": 0.7}
    stub_scores_baseline = {"h3_a": 0.5, "h3_b": 0.5, "h3_c": 0.5}

    tier1 = evaluate_tier1(stub_scores_model, stub_scores_baseline, stub_labels)

    stub_rankings_model = {"CMP1": ["EPB", "EPA", "EPC"]}
    stub_rankings_baseline = {"CMP1": ["EPA", "EPB", "EPC"]}
    stub_true_endpoint = {"CMP1": "EPB"}
    tier2 = evaluate_tier2(stub_rankings_model, stub_rankings_baseline, stub_true_endpoint)

    stub_flags_model = {"ACC1": True, "ACC2": False}
    stub_flags_baseline = {"ACC1": False, "ACC2": False}
    stub_labels3 = {"ACC1": True, "ACC2": False}
    tier3 = evaluate_tier3(stub_flags_model, stub_flags_baseline, stub_labels3)

    report = generate_report(tier1, tier2, tier3, simulation_seed=26184)
    path = write_report(report)

    print(f"Eval report written to {path}")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
