"""The Tier 1 ranker (master spec §15, §20).

Traceability: ``ML-T1-RANK-001`` — the model ranks cells, refuses malformed
input, and is reproducible.

What is *not* tested here is whether the model is any good. That is a question
about a dataset, and the current one cannot answer it: cash-out location is
independent of everything a complaint knows (#50), so any accuracy figure would
be measuring the generator. These tests pin the contract instead — the shape of
the output, the refusals, and determinism — all of which must hold before an
accuracy number would mean anything anyway.

`lightgbm` lives in the optional `ml` extra, so the training tests skip cleanly
without it rather than failing. The contract tests that need no training do not
skip.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from atlas.predict.dataset import (
    ENDPOINT_COUNT_FEATURE,
    MAX_PREFIX,
    SUM_PREFIX,
    cell_feature_names,
)
from atlas.predict.hawkes import CashOutEvent, fit
from atlas.predict.tier1 import (
    BASELINE_FEATURE,
    CellObservation,
    train,
    with_baseline_feature,
)

lgb = pytest.importorskip("lightgbm", reason="lightgbm is in the optional `ml` extra")

DAY0 = datetime(2026, 9, 1, tzinfo=UTC)
WINDOW_END = DAY0 + timedelta(days=14)
HORIZON = timedelta(hours=24)
FEATURES = ("txn_out_count_7d", "endpoint_cash_out_count_7d")


def _observation(
    cell: str, day: int, *, busy: float, label: int | None
) -> CellObservation:
    return CellObservation(
        cell=cell,
        occurred_at=DAY0 + timedelta(days=day),
        features={"txn_out_count_7d": busy, "endpoint_cash_out_count_7d": busy},
        label=label,
    )


def _training_set() -> list[CellObservation]:
    """A learnable relationship: busier cells see more cash-out.

    Deliberately trivial. The point is to prove the plumbing carries a signal
    when one exists, not to claim the model finds real ones.
    """
    rows: list[CellObservation] = []
    for day in range(12):
        rows.append(_observation("hot", day, busy=10.0, label=5))
        rows.append(_observation("cold", day, busy=0.0, label=0))
    return rows


def _model():  # type: ignore[no-untyped-def]
    """Trained with relaxed leaf minimums, because the fixture is tiny.

    LightGBM's default `min_data_in_leaf` is 20, so on 24 rows it cannot split at
    all: every prediction comes back as the global mean and the ranking collapses
    to the tie-break. Relaxed here rather than in `train`, because a production
    default of one row per leaf is an invitation to overfit — the fixture is the
    unusual thing, not the model.
    """
    return train(
        _training_set(),
        feature_names=FEATURES,
        horizon=HORIZON,
        resolution=7,
        trained_from=DAY0,
        trained_to=WINDOW_END,
        num_boost_round=20,
        params={"min_data_in_leaf": 1, "min_data_in_bin": 1},
    )


def test_the_model_ranks_cells_and_returns_an_ordering() -> None:
    model = _model()
    scoring = [
        _observation("cold", 13, busy=0.0, label=None),
        _observation("hot", 13, busy=10.0, label=None),
    ]

    ranked = model.rank_cells(scoring)

    assert ranked == ["hot", "cold"]
    assert len(model.score(scoring)) == 2


def test_the_model_exposes_no_probability() -> None:
    """A raw score on a hugely imbalanced target is not a likelihood.

    Rendering it as "68% likely" would be a claim the system cannot support
    (CLAUDE.md rule 4), so the surface offers ranking and nothing that reads as
    calibrated.
    """
    model = _model()
    assert not hasattr(model, "predict_proba")
    assert not hasattr(model, "probability")


def test_the_artefact_carries_the_context_its_scores_depend_on() -> None:
    """A score is meaningless without them.

    The same cell at another resolution is a different question, and PAI is not
    comparable across resolutions (ADR-011).
    """
    model = _model()
    assert model.resolution == 7
    assert model.horizon == HORIZON
    assert model.feature_names == FEATURES
    assert model.trained_from == DAY0


def test_two_runs_on_the_same_data_score_identically() -> None:
    """An irreproducible number is worse than no number (CLAUDE.md rule 2)."""
    scoring = [_observation("hot", 13, busy=10.0, label=None)]
    assert _model().score(scoring) == _model().score(scoring)


def test_a_missing_feature_is_refused_not_defaulted() -> None:
    """LightGBM treats absence as informative and will learn from it.

    A substituted zero would be a feature nobody declared, differing between
    training and serving in a way no test would catch.
    """
    model = _model()
    incomplete = CellObservation(
        cell="hot",
        occurred_at=DAY0 + timedelta(days=13),
        features={"txn_out_count_7d": 1.0},  # endpoint_cash_out_count_7d absent
        label=None,
    )
    with pytest.raises(ValueError, match="missing features"):
        model.score([incomplete])


def test_training_on_unlabelled_rows_is_refused() -> None:
    """Skipping them would change the denominator of everything downstream."""
    rows = [*_training_set(), _observation("hot", 12, busy=10.0, label=None)]
    with pytest.raises(ValueError, match="no label"):
        train(
            rows,
            feature_names=FEATURES,
            horizon=HORIZON,
            resolution=7,
            trained_from=DAY0,
            trained_to=WINDOW_END,
        )


def test_training_on_nothing_is_refused() -> None:
    with pytest.raises(ValueError, match="empty"):
        train(
            [],
            feature_names=FEATURES,
            horizon=HORIZON,
            resolution=7,
            trained_from=DAY0,
            trained_to=WINDOW_END,
        )


def test_the_baseline_is_offered_as_a_feature_not_blended_into_the_output() -> None:
    """Blending would make "did the model beat the baseline" unanswerable.

    Part of the model's score would *be* the baseline, so any uplift measured
    against it would be partly a comparison with itself.
    """
    baseline = fit(
        [CashOutEvent("hot", DAY0 + timedelta(days=1))],
        fitted_from=DAY0,
        fitted_to=WINDOW_END,
    )
    enriched = with_baseline_feature(
        [_observation("hot", 2, busy=1.0, label=1)], baseline
    )

    assert BASELINE_FEATURE in enriched[0].features
    assert enriched[0].features[BASELINE_FEATURE] > 0.0
    # The original columns survive untouched — the baseline is an addition.
    assert enriched[0].features["txn_out_count_7d"] == 1.0
    assert enriched[0].label == 1


def test_the_cell_feature_names_are_derived_and_ordered() -> None:
    """The order is part of the contract, not a detail.

    LightGBM consumes positional arrays, so a name list that came back in a
    different order between training and scoring would feed one feature where
    another was expected — silently, and with a plausible result.
    """
    names = cell_feature_names(["a", "b"])
    assert names == (
        f"{SUM_PREFIX}a",
        f"{MAX_PREFIX}a",
        f"{SUM_PREFIX}b",
        f"{MAX_PREFIX}b",
        ENDPOINT_COUNT_FEATURE,
    )
