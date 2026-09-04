"""Data-quality gates (master spec §10.2)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from atlas.ingest.quality import (
    QualityReport,
    check_amount,
    check_required,
    check_timestamps,
    combine,
)

NOW = datetime(2026, 9, 4, 12, 0, tzinfo=UTC)


# --- amounts --------------------------------------------------------------


def test_float_amounts_are_refused() -> None:
    """The last point where binary rounding can still be kept out of money."""
    issue = check_amount(1240000.5)
    assert issue is not None and "float" in issue.problem


def test_decimal_strings_are_accepted() -> None:
    assert check_amount("1240000.00") is None
    assert check_amount("5000") is None


def test_zero_and_negative_amounts_are_refused() -> None:
    for bad in ("0", "0.00", "-1"):
        assert check_amount(bad) is not None


def test_sub_paisa_precision_is_refused() -> None:
    """Three decimal places means the source is not sending rupees."""
    assert check_amount("100.123") is not None


def test_unparseable_amount_is_refused() -> None:
    assert check_amount("about five lakh") is not None


# --- timestamps -----------------------------------------------------------


def test_fraud_cannot_begin_after_it_was_reported() -> None:
    """The rule that protects lead time.

    Accepting this would produce a negative golden-hour position and make the
    system's warning look better than it was.
    """
    issues = check_timestamps(
        reported_at=NOW - timedelta(hours=1),
        fraud_initiated_at=NOW,
        now=NOW,
    )
    assert any("lead time" in i.problem for i in issues)


def test_future_report_is_refused() -> None:
    issues = check_timestamps(
        reported_at=NOW + timedelta(hours=2), fraud_initiated_at=None, now=NOW
    )
    assert any("future" in i.problem for i in issues)


def test_small_clock_skew_is_tolerated() -> None:
    """Source systems drift by seconds. Rejecting that would be noise."""
    issues = check_timestamps(
        reported_at=NOW + timedelta(minutes=2), fraud_initiated_at=None, now=NOW
    )
    assert issues == []


def test_very_old_report_is_refused() -> None:
    """A backfill must not enter the live pipeline and distort recency features."""
    issues = check_timestamps(
        reported_at=NOW - timedelta(days=1000), fraud_initiated_at=None, now=NOW
    )
    assert any("backlog" in i.problem for i in issues)


def test_normal_case_passes() -> None:
    assert (
        check_timestamps(
            reported_at=NOW - timedelta(minutes=10),
            fraud_initiated_at=NOW - timedelta(minutes=45),
            now=NOW,
        )
        == []
    )


# --- required fields ------------------------------------------------------


def test_missing_and_empty_are_both_caught() -> None:
    issues = check_required({"a": "x", "b": "", "c": None}, ("a", "b", "c", "d"))
    assert {i.field for i in issues} == {"b", "c", "d"}


def test_combine_reports_every_issue_not_just_the_first() -> None:
    """An operator fixing one field at a time is a slow feedback loop."""
    result = combine(check_required({}, ("a", "b")), check_amount("-1"))
    assert result.ok is False
    assert len(result.issues) == 3


# --- reporting ------------------------------------------------------------


def test_report_counts_and_rates() -> None:
    report = QualityReport()
    report.accepted = 8
    report.record_rejection("reported_amount: must be greater than zero")
    report.duplicates = 1
    assert report.total == 10
    assert report.acceptance_rate == 0.8
    assert report.reasons.most_common(1)[0][1] == 1


def test_empty_batch_is_not_a_failure() -> None:
    """Nothing to ingest is a normal quiet period, not a 0% acceptance rate."""
    assert QualityReport().acceptance_rate == 1.0
