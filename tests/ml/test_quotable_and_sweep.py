"""The gate that stops an unquotable number being published (CLAUDE.md rule 2).

Traceability: ``ML-QUOTE-001`` — metrics are refused, not caveated, when the
dataset cannot support them.

Every metric here is arithmetic and will return a float for any input at all.
PAI on labels independent of the features comes out at 1.0 — not as an error.
These tests pin the behaviour that keeps such a number out of a report: the
sweep produces its curve, and declines to choose.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from ml.evaluation.quotable import UNKNOWN, Quotability, assess
from ml.evaluation.resolution_sweep import sweep

DAY0 = datetime(2026, 4, 1, tzinfo=UTC)

USABLE = Quotability(quotable=True)


def _events(cells: list[str]) -> list[tuple[str, datetime]]:
    return [(cell, DAY0 + timedelta(hours=i)) for i, cell in enumerate(cells)]


# --------------------------------------------------------------------------
# The gate
# --------------------------------------------------------------------------


def test_a_clean_dataset_is_quotable() -> None:
    verdict = assess(
        has_data=True, realism_passed=True, has_signal=True, distinct_event_times=280
    )
    assert verdict.quotable
    assert bool(verdict) is True
    assert not verdict.blockers


def test_a_dataset_with_no_signal_is_refused_and_says_why() -> None:
    """The #50 condition. Both rankers already score PAI 1.0 against it."""
    verdict = assess(
        has_data=True, realism_passed=True, has_signal=False, distinct_event_times=280
    )
    assert not verdict
    assert any("independent" in b for b in verdict.blockers)
    assert any("#50" in b for b in verdict.blockers)


def test_a_dataset_failing_realism_is_refused() -> None:
    """The #45 condition."""
    verdict = assess(
        has_data=True, realism_passed=False, has_signal=True, distinct_event_times=280
    )
    assert not verdict
    assert any("#45" in b for b in verdict.blockers)


def test_one_timestamp_blocks_every_temporal_claim() -> None:
    """Reported separately from signal because it fails differently.

    PAI is spatial and survives a single timestamp; lead time, forecast horizon
    and a self-exciting baseline do not.
    """
    verdict = assess(
        has_data=True, realism_passed=True, has_signal=True, distinct_event_times=1
    )
    assert not verdict
    assert any("temporal" in b for b in verdict.blockers)


def test_every_reason_is_reported_not_just_the_first() -> None:
    """A reader who fixes one blocker must not discover the next one at leisure."""
    verdict = assess(
        has_data=False, realism_passed=False, has_signal=False, distinct_event_times=1
    )
    assert len(verdict.blockers) == 4


def test_the_default_verdict_is_refusal() -> None:
    """A gate that defaults open is a gate that is open.

    The failure mode — a published number nobody assessed — is exactly what this
    exists to prevent, so "never checked" must not read as "fine".
    """
    assert not UNKNOWN
    assert UNKNOWN.blockers


# --------------------------------------------------------------------------
# The sweep
# --------------------------------------------------------------------------


def test_the_sweep_refuses_to_choose_on_an_unquotable_dataset() -> None:
    """The whole reason for running it now.

    The curve is produced and exercised; no resolution is selected. A chosen
    resolution carrying a warning would be worse than none — the caveat and the
    number get separated the first time either is copied.
    """
    blocked = assess(
        has_data=True, realism_passed=True, has_signal=False, distinct_event_times=280
    )
    result = sweep(
        events_by_resolution={7: _events(["a", "a", "b"])},
        ranked_cells_by_resolution={7: ["a", "b", "c", "d"]},
        flag_fraction=0.25,
        quotability=blocked,
    )

    assert result.points, "the curve should still be computed"
    assert result.chosen is None
    assert not result.is_conclusive
    assert "#50" in result.summary()


def test_the_sweep_chooses_when_the_dataset_supports_it() -> None:
    result = sweep(
        events_by_resolution={7: _events(["a", "a", "b"])},
        ranked_cells_by_resolution={7: ["a", "b", "c", "d"]},
        flag_fraction=0.25,
        quotability=USABLE,
    )
    assert result.chosen == 7
    assert result.is_conclusive


def test_pai_is_computed_per_resolution() -> None:
    """Hand-checkable: 2 of 3 events inside 1 of 4 cells.

    hit rate 2/3, area fraction 1/4, PAI = (2/3) / (1/4) = 2.667.
    """
    result = sweep(
        events_by_resolution={7: _events(["a", "a", "b"])},
        ranked_cells_by_resolution={7: ["a", "b", "c", "d"]},
        flag_fraction=0.25,
        quotability=USABLE,
    )
    assert result.points[0].pai == pytest.approx(8 / 3)
    assert result.points[0].hits == 2
    assert result.points[0].cells_flagged == 1


def test_a_resolution_with_no_events_is_skipped_not_scored_zero() -> None:
    """Never tested and performed badly are different facts.

    A zero would read as the second when the truth is the first, and the reader
    would rule out a resolution that was never on trial.
    """
    result = sweep(
        events_by_resolution={7: _events(["a"]), 8: []},
        ranked_cells_by_resolution={7: ["a", "b"], 8: ["x", "y"]},
        flag_fraction=0.5,
        quotability=USABLE,
    )
    assert [p.resolution for p in result.points] == [7]


def test_a_tie_breaks_towards_the_coarser_cell() -> None:
    """At equal PAI the larger area is the one a team can be deployed to.

    ADR-011: predicting at a granularity finer than the operational decision is
    precision theatre.
    """
    result = sweep(
        events_by_resolution={7: _events(["a"]), 8: _events(["x"])},
        ranked_cells_by_resolution={7: ["a", "b"], 8: ["x", "y"]},
        flag_fraction=0.5,
        quotability=USABLE,
    )
    assert result.points[0].pai == result.points[1].pai
    assert result.chosen == 7


def test_a_degenerate_flag_fraction_is_refused() -> None:
    with pytest.raises(ValueError, match="strictly between"):
        sweep(
            events_by_resolution={7: _events(["a"])},
            ranked_cells_by_resolution={7: ["a"]},
            flag_fraction=0.0,
            quotability=USABLE,
        )
