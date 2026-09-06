"""Temporal splitting and the embargo gap (master spec §19, §20).

Traceability: ``LEAK-007`` — no random split, and no gap shorter than the
feature window.

A random split does not announce itself; the metric simply comes out high. These
tests exist so the thing that prevents it cannot be quietly removed — and so the
gap check, which is the part a hurried caller would most like to switch off,
fails loudly rather than warning.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import pytest
from atlas.predict.splits import split_at_fraction, temporal_split

DAY0 = datetime(2026, 3, 1, tzinfo=UTC)


@dataclass(frozen=True)
class Event:
    """Minimal `HasTimestamp`. The splitter is structural, so this suffices."""

    occurred_at: datetime
    label: str = ""


def _daily(count: int, start: datetime = DAY0) -> list[Event]:
    return [Event(start + timedelta(days=i), f"d{i}") for i in range(count)]


def test_training_is_the_past_and_test_is_the_future() -> None:
    """The property that makes the metric mean anything.

    Every test event must be later than every training event. If one is not, the
    model interpolated rather than forecast, and the score describes a task
    nobody will ever ask it to do.
    """
    split = temporal_split(
        _daily(20), train_end=DAY0 + timedelta(days=9), gap=timedelta(days=2)
    )

    assert split.train and split.test
    assert max(e.occurred_at for e in split.train) < min(
        e.occurred_at for e in split.test
    )


def test_the_gap_is_embargoed_and_used_by_neither_side() -> None:
    """The embargo is where the leak would be, so it must be empty of both."""
    split = temporal_split(
        _daily(20), train_end=DAY0 + timedelta(days=9), gap=timedelta(days=3)
    )

    # Two, not three, and the arithmetic is worth stating. Training claims the
    # event exactly at `train_end` (day 9) and test claims the one exactly at
    # `test_start` (day 12), so a three-day gap over daily events embargoes the
    # two strictly inside it. Both boundaries belonging to a side is what keeps
    # every event in exactly one place.
    assert len(split.embargoed) == 2
    assert {e.label for e in split.embargoed} == {"d10", "d11"}
    embargoed = {e.label for e in split.embargoed}
    assert embargoed.isdisjoint({e.label for e in split.train})
    assert embargoed.isdisjoint({e.label for e in split.test})
    # Nothing is lost, only set aside — a split that dropped rows silently would
    # change the denominator of every metric computed on it.
    assert len(split.train) + len(split.embargoed) + len(split.test) == 20


def test_a_gap_shorter_than_the_feature_window_is_refused() -> None:
    """The whole reason the gap exists.

    A 30-day velocity computed for a test event two days after training ends is
    built almost entirely from training-period transactions. The test point is
    not independent; it is partly made of the training set. Nothing errors when
    this happens, so it is refused here instead.
    """
    with pytest.raises(ValueError, match="shorter than the longest feature window"):
        temporal_split(
            _daily(60),
            train_end=DAY0 + timedelta(days=30),
            gap=timedelta(days=2),
            longest_feature_window=timedelta(days=30),
        )


def test_a_gap_at_least_the_feature_window_is_accepted() -> None:
    split = temporal_split(
        _daily(90),
        train_end=DAY0 + timedelta(days=30),
        gap=timedelta(days=30),
        longest_feature_window=timedelta(days=30),
    )
    assert split.is_usable


def test_the_boundary_instant_belongs_to_training() -> None:
    """An event exactly at `train_end` is in the past, not the gap.

    Stated as a test because a half-open boundary chosen the other way would
    move one event per split — invisible in aggregate, and enough to make two
    implementations disagree about the same dataset.
    """
    split = temporal_split([Event(DAY0)], train_end=DAY0, gap=timedelta(days=1))
    assert len(split.train) == 1
    assert not split.test


def test_a_negative_gap_is_refused() -> None:
    """A negative embargo overlaps the two sets, which is the opposite of a split."""
    with pytest.raises(ValueError, match="negative"):
        temporal_split(_daily(5), train_end=DAY0, gap=timedelta(days=-1))


def test_a_naive_boundary_is_refused() -> None:
    with pytest.raises(ValueError, match="timezone-aware"):
        temporal_split(
            _daily(5),
            train_end=datetime(2026, 3, 5),  # noqa: DTZ001 - naive on purpose
            gap=timedelta(days=1),
        )


def test_a_naive_event_is_refused() -> None:
    """Otherwise the comparison against the boundary is meaningless."""
    naive = [Event(datetime(2026, 3, 2))]  # noqa: DTZ001 - naive on purpose
    with pytest.raises(ValueError, match="timezone-aware"):
        temporal_split(naive, train_end=DAY0, gap=timedelta(days=1))


def test_an_empty_side_is_reported_rather_than_hidden() -> None:
    """Scoring an empty test set and reporting the result is the failure here.

    `is_usable` exists so the caller has to look, instead of receiving an
    apparently fine split that measures nothing.
    """
    split = temporal_split(
        _daily(5), train_end=DAY0 + timedelta(days=99), gap=timedelta(days=1)
    )
    assert split.train and not split.test
    assert not split.is_usable


def test_fraction_splits_on_the_time_span_not_the_row_count() -> None:
    """Two datasets covering the same period must cut at the same instant.

    Splitting on row count puts the boundary wherever the median event happened,
    which moves with activity volume rather than the calendar — and the two
    resulting metrics would not be comparable, while looking as if they were.
    """
    # Ten days, but the events are heavily bunched into the first three.
    bunched = [Event(DAY0 + timedelta(hours=i)) for i in range(60)]
    bunched.append(Event(DAY0 + timedelta(days=10)))

    split = split_at_fraction(bunched, train_fraction=0.5, gap=timedelta(days=1))

    assert split.train_end == DAY0 + timedelta(days=5)
    # A row-count split would have cut around hour 30 (day 1.25) instead.
    assert split.train_end > DAY0 + timedelta(days=3)


def test_splitting_an_empty_dataset_is_refused() -> None:
    """There is no boundary to compute, and an all-empty split passes every
    downstream check while measuring nothing."""
    with pytest.raises(ValueError, match="empty"):
        split_at_fraction([], train_fraction=0.5, gap=timedelta(days=1))


@pytest.mark.parametrize("fraction", [0.0, 1.0, -0.1, 1.5])
def test_a_degenerate_fraction_is_refused(fraction: float) -> None:
    with pytest.raises(ValueError, match="strictly between"):
        split_at_fraction(_daily(10), train_fraction=fraction, gap=timedelta(days=1))
