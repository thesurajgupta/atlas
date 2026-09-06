"""Temporal train/test splits with an embargo gap (master spec §19, §20).

A random split is the single most effective way to produce a model that looks
excellent and is worthless, and it does not announce itself: the metric simply
comes out high. Cash-out events are autocorrelated in time and space — the same
endpoint fires repeatedly over hours — so a randomly held-out event usually sits
between two training events at the same place. The model interpolates, and
interpolation is not forecasting. In production every event to be predicted is
in the future of every event trained on, and nothing about a random split
resembles that.

So: split by time, never by row.

## Why there is a gap, and why it is not optional

Splitting at a single instant is still not enough. Two mechanisms leak across an
adjacent boundary:

* **Feature windows straddle it.** A 30-day velocity computed for a test event
  on Monday is built from transactions that mostly happened during training.
  The test point is not independent of the training set; it is partly made of
  it.
* **Labels arrive late.** A cash-out at 23:50 on the last training day may only
  become knowable days later. Included in training it is a fact from the test
  period wearing a training timestamp.

The gap — an embargo between the end of training and the start of test — is what
buys independence. It must be at least as long as the longest feature window in
use, or the first mechanism is still live. :func:`temporal_split` refuses to
build a split that does not satisfy that, rather than warning: a warning is read
once and a leaked metric is quoted forever.

The cost is real and is the point. Embargoing thirty days of a ninety-day
dataset throws away a third of it, and a model that needs that third to look
good has not earned the claim.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Generic, Protocol, TypeVar


class HasTimestamp(Protocol):
    """Anything with the instant it happened.

    Structural rather than a base class, so the splitter works on cell-time
    aggregates, raw events and feature rows without any of them importing this
    module or inheriting from it.
    """

    @property
    def occurred_at(self) -> datetime: ...


#: PEP 695 syntax (`class C[T]`) would read better and needs Python 3.12;
#: this project targets 3.11, so the older spelling is the only one available.
ItemT = TypeVar("ItemT", bound=HasTimestamp)


@dataclass(frozen=True)
class TemporalSplit(Generic[ItemT]):
    """A train/test division and the boundaries that produced it.

    The boundaries travel with the data rather than being remembered by the
    caller. A split separated from its cut points cannot be checked, and an
    unchecked split is exactly the thing this module exists to prevent.

    ``embargoed`` is kept rather than discarded so the cost is visible. A split
    that silently dropped a third of the dataset would be indistinguishable from
    one that had less data to begin with, and the difference matters when
    reading a metric computed on what is left.
    """

    train: tuple[ItemT, ...]
    test: tuple[ItemT, ...]
    embargoed: tuple[ItemT, ...]

    train_end: datetime
    test_start: datetime
    gap: timedelta

    @property
    def is_usable(self) -> bool:
        """Whether both sides have anything in them.

        An empty side is not an error here — it is a fact about the dataset and
        the cut, and the caller decides what to do about it. What must not
        happen is scoring an empty test set and reporting the result.
        """
        return len(self.train) > 0 and len(self.test) > 0


def temporal_split(
    items: Sequence[ItemT],
    *,
    train_end: datetime,
    gap: timedelta,
    longest_feature_window: timedelta | None = None,
) -> TemporalSplit[ItemT]:
    """Split by time at ``train_end``, embargoing ``gap`` after it.

    Training is everything at or before ``train_end``. Test is everything at or
    after ``train_end + gap``. What falls between is embargoed and used by
    neither.

    ``longest_feature_window`` is checked, not trusted: passing it makes this
    refuse a gap shorter than the window, because a shorter gap leaves test
    features built from training data. Omitting it skips the check, which is
    correct only when the model uses no windowed features at all — and a caller
    that omits it because it is inconvenient has disabled the guard, which is
    why the parameter is named for the fact rather than for the check.
    """
    if gap < timedelta(0):
        raise ValueError("gap must not be negative; a negative embargo overlaps the two sets")
    if train_end.tzinfo is None:
        raise ValueError("train_end must be timezone-aware; naive datetimes are ambiguous")
    if longest_feature_window is not None and gap < longest_feature_window:
        raise ValueError(
            f"gap {gap} is shorter than the longest feature window "
            f"{longest_feature_window}: test features would be computed from "
            f"training-period data, which is leakage (spec §19)"
        )

    test_start = train_end + gap

    train: list[ItemT] = []
    embargoed: list[ItemT] = []
    test: list[ItemT] = []
    for item in items:
        when = item.occurred_at
        if when.tzinfo is None:
            raise ValueError("every item must carry a timezone-aware occurred_at")
        if when <= train_end:
            train.append(item)
        elif when < test_start:
            embargoed.append(item)
        else:
            test.append(item)

    return TemporalSplit(
        train=tuple(train),
        test=tuple(test),
        embargoed=tuple(embargoed),
        train_end=train_end,
        test_start=test_start,
        gap=gap,
    )


def split_at_fraction(
    items: Sequence[ItemT],
    *,
    train_fraction: float,
    gap: timedelta,
    longest_feature_window: timedelta | None = None,
) -> TemporalSplit[ItemT]:
    """Split so that ``train_fraction`` of the *time span* is training.

    By span, not by row count. Splitting on the row count puts the boundary at
    whatever instant the median event happened, which moves with the volume of
    activity rather than with the calendar — two datasets covering the same
    period would be cut at different times, and their metrics would not be
    comparable.

    Raises on an empty input rather than returning an empty split: there is no
    boundary to compute, and a split with both sides empty would sail through
    every check downstream while measuring nothing.
    """
    if not items:
        raise ValueError("cannot split an empty dataset")
    if not 0.0 < train_fraction < 1.0:
        raise ValueError("train_fraction must lie strictly between 0 and 1")

    stamps = [item.occurred_at for item in items]
    earliest, latest = min(stamps), max(stamps)
    span = latest - earliest
    return temporal_split(
        items,
        train_end=earliest + span * train_fraction,
        gap=gap,
        longest_feature_window=longest_feature_window,
    )
