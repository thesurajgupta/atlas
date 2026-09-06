"""Tier 1 zone forecast — LightGBM over the feature store (spec §15, §20).

Ranks H3 cells by how likely value is to be withdrawn in each over a forecast
horizon. The output is an **ordering**, and that is the whole contract: a
ranking is what tasking needs, and it is what PAI scores.

## What the model is allowed to see

Only the point-in-time feature store, read at the prediction instant, plus the
self-exciting intensity from :mod:`atlas.predict.hawkes` as one input among
many. Every value therefore carries an ``observed_at <= as_of`` guarantee
applied by the store itself — this module cannot loosen it because it never
queries a table.

The baseline's intensity is offered *as a feature* rather than the model being
run separately and blended. Blending would make the comparison meaningless: a
model whose output is partly the baseline cannot be said to have beaten it.
Given it as a column, LightGBM is free to ignore it, and the uplift measured
against the standalone baseline stays an honest question.

## Why the answer is a rank and not a probability

LightGBM will happily emit a number in [0, 1] and it will be miscalibrated —
cells are enormously imbalanced, almost none of them see a cash-out in any given
window, and the raw score reflects that prior far more than any specific cell.
Rendering it as "68% likely" would be a claim the system cannot support
(CLAUDE.md rule 4). Calibration is a separate exercise with its own metric
(ECE), against labels that do not yet exist honestly (#50), so this module
exposes ``rank_cells`` and no ``predict_proba``.

## LightGBM is imported lazily, and deliberately

It lives in the optional ``ml`` extra. Importing it at module scope would make
``atlas.predict`` — a serving-path package — unimportable for anyone who
installed only the base dependencies, which includes every backend developer who
never touches a model. The import sits inside :func:`train` instead, so the
module loads, the types resolve and the tests run without it.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from atlas.predict.hawkes import HawkesBaseline

#: Features the model reads, in a fixed order.
#:
#: Order is part of the contract: LightGBM consumes positional arrays, so a set
#: that iterated differently between training and scoring would silently feed
#: fan-in where velocity was expected. Every model artefact records this list,
#: and scoring refuses a vector that does not match it.
DEFAULT_FEATURE_NAMES: tuple[str, ...] = (
    "txn_out_count_7d",
    "txn_in_count_7d",
    "txn_out_amount_7d",
    "distinct_out_counterparties_7d",
    "distinct_in_counterparties_7d",
    "endpoint_cash_out_count_7d",
    "txn_out_count_30d",
    "endpoint_cash_out_count_30d",
    "entity_risk_decayed",
)

#: The baseline's intensity, offered as an input column. Named here so it cannot
#: collide with a store feature and so its presence is visible in the artefact.
BASELINE_FEATURE = "hawkes_intensity"


@dataclass(frozen=True)
class CellObservation:
    """One row of training or scoring data: a cell at an instant.

    ``label`` is the count of cash-outs in the horizon following ``occurred_at``,
    and is ``None`` when scoring. It is a count rather than a boolean because
    "three withdrawals here" and "one" are different amounts of evidence, and
    collapsing them throws away the difference before the model sees it.

    ``occurred_at`` names the *prediction instant*, which is what makes this
    usable with :mod:`atlas.predict.splits` — the splitter is structural and
    needs only that attribute.
    """

    cell: str
    occurred_at: datetime
    features: Mapping[str, float]
    label: int | None = None


@dataclass(frozen=True)
class Tier1Model:
    """A trained ranker and everything needed to reproduce its inputs.

    The feature order, the horizon and the resolution travel with the booster
    because a score is meaningless without them: the same cell scored at a
    different resolution is a different question, and PAI computed across
    resolutions is not comparable (ADR-011).
    """

    booster: Any
    feature_names: tuple[str, ...]
    horizon: timedelta
    resolution: int
    trained_from: datetime
    trained_to: datetime

    def score(self, observations: Sequence[CellObservation]) -> list[float]:
        """Raw model output per observation. An ordering, not a probability.

        Refuses an observation missing any expected feature rather than
        substituting a default. LightGBM treats a missing value as informative
        and will happily learn from the pattern of absence, so a silent zero
        would be a feature nobody declared — and one that differs between
        training and serving in a way no test would catch.
        """
        if not observations:
            return []
        scores: list[float] = [
            float(v) for v in self.booster.predict(_matrix(observations, self.feature_names))
        ]
        return scores

    def rank_cells(self, observations: Sequence[CellObservation]) -> list[str]:
        """Cells ordered best-first, ties broken on the cell id.

        Deterministic ordering matters as much here as in the baseline: two runs
        disagreeing because of dictionary iteration would make the metric
        irreproducible, which CLAUDE.md rule 2 treats as worse than no metric.
        """
        scored = zip(observations, self.score(observations), strict=True)
        return [o.cell for o, _ in sorted(scored, key=lambda p: (-p[1], p[0].cell))]


def _matrix(observations: Sequence[CellObservation], feature_names: Sequence[str]) -> Any:
    """Observations as a dense float array, in the declared feature order.

    LightGBM rejects a list of lists, and numpy — like LightGBM itself — lives in
    the optional `ml` extra, so it is imported here rather than at module scope.
    Anything reaching this function already needs both.
    """
    import numpy as np

    return np.asarray([_row(o, feature_names) for o in observations], dtype=np.float64)


def _row(observation: CellObservation, feature_names: Sequence[str]) -> list[float]:
    missing = [name for name in feature_names if name not in observation.features]
    if missing:
        raise ValueError(
            f"observation for cell {observation.cell} is missing features {missing}; "
            f"a substituted default would be an undeclared feature"
        )
    return [float(observation.features[name]) for name in feature_names]


def with_baseline_feature(
    observations: Sequence[CellObservation], baseline: HawkesBaseline
) -> list[CellObservation]:
    """Add the baseline's intensity to each observation as an input column.

    Offered to the model rather than blended with its output. A blend would make
    "did the model beat the baseline" unanswerable, because part of the model's
    score would *be* the baseline.
    """
    return [
        CellObservation(
            cell=o.cell,
            occurred_at=o.occurred_at,
            features={
                **o.features,
                BASELINE_FEATURE: baseline.intensity(o.cell, o.occurred_at),
            },
            label=o.label,
        )
        for o in observations
    ]


def train(
    observations: Sequence[CellObservation],
    *,
    feature_names: Sequence[str],
    horizon: timedelta,
    resolution: int,
    trained_from: datetime,
    trained_to: datetime,
    num_boost_round: int = 200,
    params: Mapping[str, Any] | None = None,
) -> Tier1Model:
    """Fit a ranker on labelled cell observations.

    Every observation must carry a label; an unlabelled row in a training set is
    a bug rather than a row to skip, and skipping it would change the
    denominator of everything computed downstream without saying so.

    The caller supplies the training window rather than it being inferred, for
    the same reason the Hawkes fit does: inferred from the data, the window
    becomes a property of when events happened rather than of the period the
    model claims to describe.

    Determinism is forced — fixed seed, single thread, no bagging randomness.
    A model that scores differently on two runs of the same data cannot support
    a reproducible metric, and this project's rule is that an irreproducible
    number is worse than none.
    """
    if not observations:
        raise ValueError("cannot train on an empty observation set")
    unlabelled = sum(1 for o in observations if o.label is None)
    if unlabelled:
        raise ValueError(f"{unlabelled} observations have no label; training needs all of them")
    if trained_to <= trained_from:
        raise ValueError("training window must be positive")

    # Deferred: LightGBM is in the optional `ml` extra, and `atlas.predict` must
    # stay importable without it. See the module docstring.
    import lightgbm as lgb

    names = tuple(feature_names)
    matrix = _matrix(observations, names)
    labels = [o.label for o in observations]

    settings: dict[str, Any] = {
        "objective": "poisson",  # counts, not a yes/no — see CellObservation.label
        "verbosity": -1,
        "seed": 0,
        "deterministic": True,
        "num_threads": 1,
        "bagging_freq": 0,
        "feature_fraction": 1.0,
    }
    settings.update(params or {})

    dataset = lgb.Dataset(matrix, label=labels, feature_name=list(names))
    booster = lgb.train(settings, dataset, num_boost_round=num_boost_round)

    return Tier1Model(
        booster=booster,
        feature_names=names,
        horizon=horizon,
        resolution=resolution,
        trained_from=trained_from,
        trained_to=trained_to,
    )
