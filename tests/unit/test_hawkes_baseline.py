"""The self-exciting cash-out baseline (master spec §15, §20).

Traceability: ``ML-T1-BASE-001`` — the bar a Tier 1 model must clear.

What is tested here is the *shape* of the baseline, not its accuracy. Accuracy
is a question about a dataset, and the current one cannot answer it (#50). These
tests pin the behaviour that makes it a usable bar at all: recency beats volume,
excitement decays, and an event never excites its own prediction.

That last one is the important one. It is the simplest possible leak, it would
produce a spectacular score, and nothing else in the pipeline would catch it.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from atlas.predict.hawkes import CashOutEvent, fit

DAY0 = datetime(2026, 3, 1, tzinfo=UTC)
WEEK_END = DAY0 + timedelta(days=7)


def _fit(events: list[CashOutEvent], **kwargs: object):  # type: ignore[no-untyped-def]
    return fit(events, fitted_from=DAY0, fitted_to=WEEK_END, **kwargs)  # type: ignore[arg-type]


def test_a_recent_burst_outranks_an_older_one() -> None:
    """The reason this is not a frequency table.

    Two cells with identical event counts, one busy this morning and one busy
    six days ago. A frequency table calls them equal. Operationally they are
    not: the network that used the first is probably still using it.
    """
    events = [
        CashOutEvent("recent", WEEK_END - timedelta(hours=1)),
        CashOutEvent("recent", WEEK_END - timedelta(hours=2)),
        CashOutEvent("stale", DAY0 + timedelta(hours=1)),
        CashOutEvent("stale", DAY0 + timedelta(hours=2)),
    ]
    baseline = _fit(events)

    at = WEEK_END + timedelta(minutes=30)
    assert baseline.intensity("recent", at) > baseline.intensity("stale", at)
    assert baseline.rank_cells(["stale", "recent"], at)[0] == "recent"


def test_excitement_decays_towards_the_background_rate() -> None:
    """Otherwise one event marks a cell hot forever."""
    baseline = _fit([CashOutEvent("c", DAY0 + timedelta(hours=1))])

    soon = baseline.intensity("c", DAY0 + timedelta(hours=2))
    later = baseline.intensity("c", DAY0 + timedelta(days=3))

    assert soon > later
    assert later == pytest.approx(baseline.background["c"], abs=1e-3)


def test_one_half_life_halves_the_excitement() -> None:
    """The parameter means what it says, which is worth pinning.

    An `alpha * exp(-dt/tau)` term with `tau` derived from the wrong log base
    still decays, still looks plausible, and silently uses a different tempo
    than the one configured.
    """
    half_life = timedelta(hours=6)
    baseline = _fit([CashOutEvent("c", DAY0)], half_life=half_life)
    background = baseline.background["c"]

    at_once = baseline.intensity("c", DAY0 + timedelta(seconds=1)) - background
    at_half_life = baseline.intensity("c", DAY0 + half_life) - background

    assert at_half_life == pytest.approx(at_once / 2, rel=1e-3)


def test_an_event_does_not_excite_its_own_prediction() -> None:
    """The simplest possible leak, and it would score spectacularly.

    Scoring a cell at the instant of one of its events must not count that
    event: at prediction time it has not happened yet. Including it means the
    model is reading the answer.
    """
    when = DAY0 + timedelta(days=1)
    baseline = _fit([CashOutEvent("c", when)])

    assert baseline.intensity("c", when) == pytest.approx(baseline.background["c"])
    assert (
        baseline.intensity("c", when + timedelta(seconds=1)) > baseline.background["c"]
    )


def test_a_cell_never_seen_scores_zero_and_ranks_last() -> None:
    """Zero means "no evidence here", not "safe here".

    The distinction cannot be encoded in a rank, which is one reason this
    produces an ordering rather than a probability.
    """
    baseline = _fit([CashOutEvent("known", DAY0 + timedelta(hours=1))])
    at = DAY0 + timedelta(days=2)

    assert baseline.intensity("unseen", at) == 0.0
    assert baseline.rank_cells(["unseen", "known"], at) == ["known", "unseen"]


def test_ranking_is_deterministic_when_intensities_tie() -> None:
    """Two runs that disagree because a dict iterated differently would make the
    metric irreproducible, which is worse than having no metric."""
    baseline = _fit([CashOutEvent("b", DAY0), CashOutEvent("a", DAY0)])
    at = DAY0 + timedelta(days=1)

    assert baseline.rank_cells(["b", "a"], at) == baseline.rank_cells(["a", "b"], at)


def test_the_background_rate_uses_the_stated_window_not_the_event_span() -> None:
    """Otherwise a cell with one event has the same rate as one with seven.

    Inferring the window from the data makes the denominator the gap between
    first and last event, which for a single event is zero — and for two events
    an hour apart implies a furious rate that the week does not support.
    """
    busy = _fit([CashOutEvent("c", DAY0 + timedelta(days=i)) for i in range(7)])
    quiet = _fit([CashOutEvent("c", DAY0 + timedelta(days=3))])

    assert busy.background["c"] > quiet.background["c"]
    assert quiet.background["c"] == pytest.approx(1 / (WEEK_END - DAY0).total_seconds())


def test_events_outside_the_fitting_window_are_ignored() -> None:
    """Callers pass a training split; an event outside it is the embargo working."""
    baseline = _fit(
        [
            CashOutEvent("c", DAY0 + timedelta(days=1)),
            CashOutEvent("c", WEEK_END + timedelta(days=5)),
        ]
    )
    assert len(baseline.history["c"]) == 1


def test_a_degenerate_fitting_window_is_refused() -> None:
    with pytest.raises(ValueError, match="window must be positive"):
        fit([], fitted_from=WEEK_END, fitted_to=DAY0)


def test_a_non_exciting_process_is_refused() -> None:
    """At zero excitation this is a frequency table wearing a Hawkes name."""
    with pytest.raises(ValueError, match="excitation"):
        _fit([], excitation=0.0)


def test_a_naive_scoring_instant_is_refused() -> None:
    baseline = _fit([CashOutEvent("c", DAY0)])
    with pytest.raises(ValueError, match="timezone-aware"):
        baseline.intensity("c", datetime(2026, 3, 2))  # noqa: DTZ001 - naive on purpose
