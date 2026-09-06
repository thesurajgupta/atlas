"""End-to-end Tier 1 evaluation: split, fit, score, compare (spec §15, §20).

This is the assembly the other modules exist for. It takes labelled cell
observations, splits them in time with an embargo, fits the self-exciting
baseline on the training half, trains LightGBM on the same half with the
baseline's intensity as one input, ranks the test cells with both, and compares
them on PAI.

## It cannot publish a number, and that is the point

The comparison runs. The uplift is computed. And every figure is wrapped in a
:class:`~ml.evaluation.quotable.Quotability` verdict that is currently negative,
because cash-out location is independent of everything a complaint knows (#50)
and the dataset fails the realism checks (#45). Under those conditions PAI
returns 1.0 for any ranker — not as an error, as arithmetic — so a number
emitted here would measure the generator and nothing else.

:attr:`Tier1Comparison.uplift` therefore returns ``None`` unless the dataset is
quotable. The underlying figures stay on the object for debugging, named so that
nobody mistakes them for results: ``_unquotable_model_pai``. A caller who wants
them has to type something that says what they are.

## What is deliberately not here

No calibration, no probability, no lead time. Each needs either labels that
relate to features or more than one distinct event timestamp, and the dataset
has neither. Reporting them as "not computed" with the reason is what the
existing harness already does, and duplicating that here would give two places
to keep honest.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from atlas.predict.hawkes import CashOutEvent, HawkesBaseline
from atlas.predict.hawkes import fit as fit_baseline
from atlas.predict.splits import TemporalSplit, split_at_fraction
from atlas.predict.tier1 import (
    CellObservation,
    Tier1Model,
    train,
    with_baseline_feature,
)

from ml.evaluation.metrics import prediction_accuracy_index
from ml.evaluation.quotable import Quotability

#: Share of the flagged lattice used when scoring PAI. Five per cent of the map
#: is roughly what a force can actually cover, which is the only reason to
#: prefer one operating point over another when reporting a single figure.
DEFAULT_FLAG_FRACTION = 0.05


@dataclass(frozen=True)
class Tier1Comparison:
    """Model against baseline, with the verdict that decides what may be said.

    The PAI figures are prefixed ``_unquotable_`` rather than hidden. Hiding them
    would make debugging impossible; naming them plainly would let one be copied
    into a slide. The prefix is the compromise, and it survives copy-paste.
    """

    quotability: Quotability
    resolution: int
    train_size: int
    test_size: int
    embargoed_size: int
    _unquotable_model_pai: float
    _unquotable_baseline_pai: float

    @property
    def uplift(self) -> float | None:
        """Model PAI minus baseline PAI — or ``None`` when nothing may be said.

        The headline for §20 is uplift, never raw accuracy: on an imbalanced
        problem a raw figure can look impressive while being worse than flagging
        at random, and only the baseline says which. That holds *when there is a
        number at all*, which today there is not.
        """
        if not self.quotability.quotable:
            return None
        return self._unquotable_model_pai - self._unquotable_baseline_pai

    def summary(self) -> str:
        if not self.quotability.quotable:
            return (
                f"r{self.resolution} · {self.train_size}/{self.test_size} train/test · "
                f"NOT QUOTABLE — {self.quotability.summary}"
            )
        return (
            f"r{self.resolution} · {self.train_size}/{self.test_size} train/test · "
            f"uplift {self.uplift:+.2f} PAI"
        )


def _rank_pai(
    ranked_cells: list[str],
    test: tuple[CellObservation, ...],
    resolution: int,
    flag_fraction: float,
) -> float:
    """PAI for one ranking over the test observations.

    Hits are counted in *events*, not cells: a cell with three cash-outs is three
    hits. Counting cells instead would treat catching a busy cell and a quiet one
    as equal successes, which is not what an operational reader means by a hit.
    """
    total_hits = sum(o.label or 0 for o in test)
    if total_hits <= 0:
        # PAI is undefined with no ground-truth events, and the metric raises
        # rather than returning a number. Reported as 0.0 with the caller's gate
        # already negative — a dataset with no positives is exactly the situation
        # `quotable` exists to refuse.
        return 0.0

    flagged_count = max(1, int(len(ranked_cells) * flag_fraction))
    flagged = set(ranked_cells[:flagged_count])
    hits = sum(o.label or 0 for o in test if o.cell in flagged)

    return prediction_accuracy_index(
        hits=hits,
        total_hits=total_hits,
        flagged_area=float(flagged_count),
        total_area=float(len(ranked_cells)),
        h3_resolution=resolution,
    ).value


def run(
    observations: list[CellObservation],
    *,
    events: list[CashOutEvent],
    resolution: int,
    horizon: timedelta,
    feature_names: list[str],
    quotability: Quotability,
    gap: timedelta,
    train_fraction: float = 0.7,
    longest_feature_window: timedelta | None = None,
    flag_fraction: float = DEFAULT_FLAG_FRACTION,
) -> Tier1Comparison:
    """Split, fit both rankers on the training half, and compare on the test half.

    ``gap`` and ``longest_feature_window`` are passed straight to the splitter,
    which refuses an embargo shorter than the window. That refusal is the whole
    reason the parameter is threaded through here rather than defaulted: a caller
    assembling a run should have to state the window their features use.

    The baseline is fitted on the training period only, and the model receives
    its intensity as an input column. Both therefore see the same history, and
    the comparison is between what each does with it.
    """
    split: TemporalSplit[CellObservation] = split_at_fraction(
        observations,
        train_fraction=train_fraction,
        gap=gap,
        longest_feature_window=longest_feature_window,
    )
    if not split.is_usable:
        return Tier1Comparison(
            quotability=quotability,
            resolution=resolution,
            train_size=len(split.train),
            test_size=len(split.test),
            embargoed_size=len(split.embargoed),
            _unquotable_model_pai=0.0,
            _unquotable_baseline_pai=0.0,
        )

    baseline = _fit_on_training(events, split)

    enriched_train = with_baseline_feature(split.train, baseline)
    enriched_test = with_baseline_feature(split.test, baseline)

    model: Tier1Model = train(
        enriched_train,
        feature_names=feature_names,
        horizon=horizon,
        resolution=resolution,
        trained_from=min(o.occurred_at for o in split.train),
        trained_to=split.train_end,
    )

    model_ranking = model.rank_cells(enriched_test)
    baseline_ranking = baseline.rank_cells(
        [o.cell for o in split.test], split.test_start
    )

    return Tier1Comparison(
        quotability=quotability,
        resolution=resolution,
        train_size=len(split.train),
        test_size=len(split.test),
        embargoed_size=len(split.embargoed),
        _unquotable_model_pai=_rank_pai(
            model_ranking, split.test, resolution, flag_fraction
        ),
        _unquotable_baseline_pai=_rank_pai(
            baseline_ranking, split.test, resolution, flag_fraction
        ),
    )


def _fit_on_training(
    events: list[CashOutEvent], split: TemporalSplit[CellObservation]
) -> HawkesBaseline:
    """Fit the baseline over the training period and nothing else.

    The window is the split's own, not the events' span. Fitted over everything
    the baseline would carry excitement from test-period events into the scores
    it assigns to those same events — the leak the embargo exists to prevent,
    reintroduced one layer down.
    """
    return fit_baseline(
        events,
        fitted_from=min(o.occurred_at for o in split.train),
        fitted_to=split.train_end,
    )
