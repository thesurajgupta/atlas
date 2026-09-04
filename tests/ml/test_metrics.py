"""Unit tests for ml.evaluation.metrics — Issue #18.

Every metric test includes the hand-worked arithmetic in a comment,
per the issue's own bar: "a metric implementation nobody has verified
by hand is not trustworthy."
"""

import json
import math
from datetime import datetime, timezone

import pytest

from ml.evaluation.metrics import (
    LeadTimeReport,
    compare_pai,
    compute_lead_time,
    expected_calibration_error,
    generate_report,
    hit_within_radius,
    prediction_accuracy_index,
    predictive_efficiency_index,
    recall_at_k,
    write_report,
)


# =======================================================================
# PAI - Prediction Accuracy Index
# =======================================================================
def test_pai_matches_reviewers_hand_worked_example():
    # 100 cash-outs, 5% of area flagged, 40 caught -> PAI = 8.0
    result = prediction_accuracy_index(
        hits=40,
        total_hits=100,
        flagged_area=5.0,
        total_area=100.0,
        h3_resolution=8,
    )
    assert math.isclose(result.value, 8.0)


def test_pai_of_random_flagging_is_one():
    # flag 50% of area, catch 50% of hits -> exactly as good as random -> PAI = 1.0
    result = prediction_accuracy_index(
        hits=50,
        total_hits=100,
        flagged_area=50.0,
        total_area=100.0,
        h3_resolution=8,
    )
    assert math.isclose(result.value, 1.0)


def test_pai_rejects_zero_total_hits():
    with pytest.raises(ValueError):
        prediction_accuracy_index(
            hits=0,
            total_hits=0,
            flagged_area=5.0,
            total_area=100.0,
            h3_resolution=8,
        )


def test_pai_rejects_zero_flagged_area():
    with pytest.raises(ValueError):
        prediction_accuracy_index(
            hits=10,
            total_hits=100,
            flagged_area=0.0,
            total_area=100.0,
            h3_resolution=8,
        )


def test_pai_refuses_to_compare_across_resolutions():
    a = prediction_accuracy_index(
        hits=40,
        total_hits=100,
        flagged_area=5.0,
        total_area=100.0,
        h3_resolution=8,
    )
    b = prediction_accuracy_index(
        hits=40,
        total_hits=100,
        flagged_area=5.0,
        total_area=100.0,
        h3_resolution=9,
    )
    with pytest.raises(ValueError, match="resolution"):
        compare_pai(a, b)


def test_pai_comparison_works_at_same_resolution():
    a = prediction_accuracy_index(
        hits=40,
        total_hits=100,
        flagged_area=5.0,
        total_area=100.0,
        h3_resolution=8,
    )
    b = prediction_accuracy_index(
        hits=20,
        total_hits=100,
        flagged_area=5.0,
        total_area=100.0,
        h3_resolution=8,
    )
    assert math.isclose(compare_pai(a, b), 4.0)  # 8.0 - 4.0


# =======================================================================
# Recall@K
# =======================================================================
def test_recall_at_k_hand_worked_example():
    # CMP1 target "B" in top 2 of ["A","B","C"] -> hit
    # CMP2 target "D" not in ["A","B","C"] -> miss
    # recall@2 = 1/2 = 0.5
    rankings = {"CMP1": ["A", "B", "C"], "CMP2": ["A", "B", "C"]}
    true_endpoint = {"CMP1": "B", "CMP2": "D"}
    assert recall_at_k(rankings, true_endpoint, k=2) == 0.5


def test_recall_at_k_perfect_score():
    rankings = {"CMP1": ["X"], "CMP2": ["Y"]}
    true_endpoint = {"CMP1": "X", "CMP2": "Y"}
    assert recall_at_k(rankings, true_endpoint, k=1) == 1.0


def test_recall_at_k_rejects_k_below_one():
    with pytest.raises(ValueError):
        recall_at_k({}, {}, k=0)


def test_recall_at_k_does_not_cap_below_full_score_with_few_candidates():
    # Guards the precision_at_k bug the review found (dividing by k
    # instead of available candidates) - recall_at_k is a hit-rate over
    # cases, not over candidates, so it never had that bug, but a
    # perfect model must still score 1.0 regardless of k.
    rankings = {"CMP1": ["only_candidate"]}
    true_endpoint = {"CMP1": "only_candidate"}
    assert recall_at_k(rankings, true_endpoint, k=10) == 1.0


# =======================================================================
# ECE - Expected Calibration Error
# =======================================================================
def test_ece_hand_worked_example():
    # Bin [0.0,0.5): preds [0.2,0.3] labels [F,F] -> avg=0.25, rate=0.0, diff=0.25
    # Bin [0.5,1.0]: preds [0.8,0.9] labels [T,T] -> avg=0.85, rate=1.0, diff=0.15
    # ECE = (2/4)*0.25 + (2/4)*0.15 = 0.125 + 0.075 = 0.20
    ece = expected_calibration_error(
        predicted_probs=[0.2, 0.3, 0.8, 0.9],
        true_labels=[False, False, True, True],
        n_bins=2,
    )
    assert math.isclose(ece, 0.20, abs_tol=1e-9)


def test_ece_is_zero_for_perfectly_calibrated_extreme_predictions():
    ece = expected_calibration_error(
        predicted_probs=[0.0, 0.0, 1.0, 1.0],
        true_labels=[False, False, True, True],
        n_bins=2,
    )
    assert math.isclose(ece, 0.0, abs_tol=1e-9)


def test_ece_rejects_mismatched_lengths():
    with pytest.raises(ValueError):
        expected_calibration_error(predicted_probs=[0.5], true_labels=[], n_bins=2)


def test_ece_rejects_empty_input():
    with pytest.raises(ValueError):
        expected_calibration_error(predicted_probs=[], true_labels=[], n_bins=2)


# =======================================================================
# Lead time
# =======================================================================
def test_lead_time_hand_worked_example():
    # CMP1: predicted 10:00, cashed out 10:30 -> +30 min, on-time
    # CMP2: predicted 10:00, cashed out 09:45 -> -15 min -> LATE
    # CMP3: predicted 10:00, cashed out 10:00 ->   0 min -> LATE (boundary)
    predicted_at = {
        "CMP1": datetime(2026, 1, 1, 10, 0, tzinfo=timezone.utc),
        "CMP2": datetime(2026, 1, 1, 10, 0, tzinfo=timezone.utc),
        "CMP3": datetime(2026, 1, 1, 10, 0, tzinfo=timezone.utc),
    }
    actual_cashout_at = {
        "CMP1": datetime(2026, 1, 1, 10, 30, tzinfo=timezone.utc),
        "CMP2": datetime(2026, 1, 1, 9, 45, tzinfo=timezone.utc),
        "CMP3": datetime(2026, 1, 1, 10, 0, tzinfo=timezone.utc),
    }
    report = compute_lead_time(predicted_at, actual_cashout_at)

    assert report.on_time_minutes == [30.0]
    assert report.late_count == 2
    assert report.total_count == 3
    assert math.isclose(report.late_fraction, 2 / 3)


def test_lead_time_late_predictions_never_enter_the_timing_distribution():
    """This is the exact failure mode the review flagged: a late-but-
    correct prediction must not be averaged in as if it were a success.
    """
    predicted_at = {"CMP1": datetime(2026, 1, 1, 10, 0, tzinfo=timezone.utc)}
    actual_cashout_at = {
        "CMP1": datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)
    }  # already happened
    report = compute_lead_time(predicted_at, actual_cashout_at)

    assert report.on_time_minutes == []
    assert report.late_count == 1
    assert report.late_fraction == 1.0


def test_lead_time_percentile_on_empty_on_time_list_is_explicit_zero():
    report = LeadTimeReport(on_time_minutes=[], late_count=5, total_count=5)
    assert report.percentile(50) == 0.0
    assert (
        report.late_fraction == 1.0
    )  # caller must check this, not trust percentile alone


# =======================================================================
# Deliberately-not-implemented metrics fail loudly, not silently
# =======================================================================
def test_pei_raises_not_implemented():
    with pytest.raises(NotImplementedError):
        predictive_efficiency_index()


def test_hit_within_radius_raises_not_implemented():
    with pytest.raises(NotImplementedError):
        hit_within_radius()


# =======================================================================
# Report generation - JSON validity and honesty guarantees
# =======================================================================
def test_report_is_valid_json_including_edge_cases():
    pai = prediction_accuracy_index(
        hits=40,
        total_hits=100,
        flagged_area=5.0,
        total_area=100.0,
        h3_resolution=8,
    )
    recall_results = {1: 0.0, 3: 0.5, 5: 0.5, 10: 0.5}
    ece = 0.2
    lead_time = compute_lead_time(
        predicted_at={"CMP1": datetime(2026, 1, 1, 10, 0, tzinfo=timezone.utc)},
        actual_cashout_at={"CMP1": datetime(2026, 1, 1, 10, 30, tzinfo=timezone.utc)},
    )

    report = generate_report(pai, recall_results, ece, lead_time)

    # This is the exact bug the review caught: json.dumps must not be
    # allowed to silently write a NaN. If nothing in the report can
    # produce a NaN, this call succeeds; if something did, it fails
    # loudly here instead of shipping broken JSON.
    serialised = json.dumps(report, allow_nan=False)
    parsed = json.loads(serialised)
    assert parsed["pai"]["value"] == 8.0


def test_report_never_contains_pei_or_hit_within_radius_placeholders():
    """Guards against silently reintroducing a stub value for a metric
    that has not actually been implemented.
    """
    pai = prediction_accuracy_index(
        hits=40,
        total_hits=100,
        flagged_area=5.0,
        total_area=100.0,
        h3_resolution=8,
    )
    recall_results = {1: 1.0}
    ece = 0.0
    lead_time = compute_lead_time(predicted_at={}, actual_cashout_at={})

    report = generate_report(pai, recall_results, ece, lead_time)

    assert "pei" not in report
    assert "hit_within_radius" not in report
    assert "not yet implemented" in report["note"].lower()


def test_write_report_produces_a_file_parseable_by_a_strict_json_reader():
    pai = prediction_accuracy_index(
        hits=40,
        total_hits=100,
        flagged_area=5.0,
        total_area=100.0,
        h3_resolution=8,
    )
    recall_results = {1: 1.0}
    ece = 0.0
    lead_time = compute_lead_time(predicted_at={}, actual_cashout_at={})
    report = generate_report(pai, recall_results, ece, lead_time)

    path = write_report(report)
    try:
        with open(path) as f:
            # json.load with default settings rejects NaN/Infinity by
            # ourselves having written with allow_nan=False; a strict
            # reader (jq, JSON.parse) would reject a NaN token outright.
            reloaded = json.load(f)
        assert reloaded["pai"]["value"] == 8.0
    finally:
        path.unlink(missing_ok=True)
