"""Unit tests for ml.evaluation.metrics — Issue #18."""

import math

from ml.evaluation.metrics import (
    _f1,
    _mrr,
    _pct_uplift,
    _precision,
    _precision_at_k,
    baseline_mule_risk,
    evaluate_tier1,
    evaluate_tier2,
    evaluate_tier3,
    generate_report,
)


# ---------------------------------------------------------------------
# Metric primitives
# ---------------------------------------------------------------------
def test_pct_uplift_positive():
    assert math.isclose(_pct_uplift(model_value=0.8, baseline_value=0.5), 60.0)


def test_pct_uplift_negative_when_model_worse():
    assert math.isclose(_pct_uplift(model_value=0.3, baseline_value=0.5), -40.0)


def test_pct_uplift_nan_when_baseline_zero():
    assert math.isnan(_pct_uplift(model_value=0.5, baseline_value=0.0))


def test_precision_at_k_counts_hits_in_top_k():
    scores = {"a": 0.9, "b": 0.8, "c": 0.1}
    labels = {"a": True, "b": False, "c": False}
    # top 2 by score: a, b -> 1 hit / k=2
    assert _precision_at_k(scores, labels, k=2) == 0.5


def test_precision_handles_no_predicted_positives():
    flags = {"a": False, "b": False}
    labels = {"a": True, "b": False}
    assert _precision(flags, labels) == 0.0


def test_f1_perfect_prediction():
    flags = {"a": True, "b": False}
    labels = {"a": True, "b": False}
    assert _f1(flags, labels) == 1.0


def test_mrr_rewards_earlier_rank():
    rankings = {"CMP1": ["wrong", "right", "also_wrong"]}
    true_endpoint = {"CMP1": "right"}
    # target at rank 2 -> reciprocal rank 0.5
    assert _mrr(rankings, true_endpoint) == 0.5


def test_mrr_zero_when_target_missing_from_ranking():
    rankings = {"CMP1": ["a", "b"]}
    true_endpoint = {"CMP1": "not_in_list"}
    assert _mrr(rankings, true_endpoint) == 0.0


# ---------------------------------------------------------------------
# Baselines
# ---------------------------------------------------------------------
def test_baseline_mule_risk_flags_new_accounts():
    assert baseline_mule_risk(account_age_days=3) is True
    assert baseline_mule_risk(account_age_days=90) is False


# ---------------------------------------------------------------------
# Tier-level evaluation + report shape
# ---------------------------------------------------------------------
def test_evaluate_tier1_exposes_uplift_properties():
    model_scores = {"h3_a": 0.9, "h3_b": 0.1}
    baseline_scores = {"h3_a": 0.5, "h3_b": 0.5}
    labels = {"h3_a": True, "h3_b": False}

    result = evaluate_tier1(model_scores, baseline_scores, labels)

    assert hasattr(result, "uplift_auc_pct")
    assert hasattr(result, "uplift_precision_at_10_pct")


def test_evaluate_tier2_mrr_uplift_direction():
    model_rankings = {"CMP1": ["right", "wrong"]}
    baseline_rankings = {"CMP1": ["wrong", "right"]}
    true_endpoint = {"CMP1": "right"}

    result = evaluate_tier2(model_rankings, baseline_rankings, true_endpoint)

    # model ranks the true endpoint first (MRR=1.0), baseline ranks it
    # second (MRR=0.5) -> uplift should be positive
    assert result.uplift_mrr_pct > 0


def test_evaluate_tier3_returns_f1_and_precision():
    model_flags = {"acc1": True, "acc2": False}
    baseline_flags = {"acc1": False, "acc2": False}
    labels = {"acc1": True, "acc2": False}

    result = evaluate_tier3(model_flags, baseline_flags, labels)

    assert result.model_f1 == 1.0
    assert result.baseline_f1 == 0.0


def test_report_never_surfaces_raw_accuracy_as_headline():
    """Guards the honesty commitment: report only exposes uplift-style
    fields as headline-shaped keys, plus the raw values for transparency
    — but the `note` field must always be present to make that explicit.
    """
    model_scores = {"h3_a": 0.9}
    baseline_scores = {"h3_a": 0.5}
    labels = {"h3_a": True}
    tier1 = evaluate_tier1(model_scores, baseline_scores, labels)

    model_rankings = {"CMP1": ["right"]}
    baseline_rankings = {"CMP1": ["right"]}
    true_endpoint = {"CMP1": "right"}
    tier2 = evaluate_tier2(model_rankings, baseline_rankings, true_endpoint)

    model_flags = {"acc1": True}
    baseline_flags = {"acc1": False}
    tier3_labels = {"acc1": True}
    tier3 = evaluate_tier3(model_flags, baseline_flags, tier3_labels)

    report = generate_report(tier1, tier2, tier3, simulation_seed=26184)

    assert "note" in report
    assert "uplift" in report["note"].lower()
    assert "git_sha" in report
    assert "simulation_seed" in report
    assert report["simulation_seed"] == 26184