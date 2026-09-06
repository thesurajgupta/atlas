"""End-to-end Tier 1 comparison (master spec §15, §20).

Traceability: ``ML-T1-UPLIFT-001`` — model against baseline, gated.

The comparison runs today and cannot publish a number, which is exactly what
these tests pin. `uplift` returns `None` while the dataset is unquotable, and it
returns a figure the moment the verdict says it may — so the gate is doing the
refusing, not an absence of code.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from atlas.predict.hawkes import CashOutEvent
from atlas.predict.tier1 import CellObservation

from ml.evaluation.quotable import Quotability, assess
from ml.evaluation.tier1_run import run

pytest.importorskip("lightgbm", reason="lightgbm is in the optional `ml` extra")

DAY0 = datetime(2026, 10, 1, tzinfo=UTC)
HORIZON = timedelta(hours=24)
FEATURES = ["cell_sum_endpoint_cash_out_count_7d", "cell_endpoint_count"]

USABLE = Quotability(quotable=True)
BLOCKED = assess(
    has_data=True, realism_passed=False, has_signal=False, distinct_event_times=1
)


def _observations() -> list[CellObservation]:
    """Thirty days of two cells, one busy and one not."""
    rows: list[CellObservation] = []
    for day in range(30):
        when = DAY0 + timedelta(days=day)
        rows.append(
            CellObservation(
                cell="hot",
                occurred_at=when,
                features={
                    "cell_sum_endpoint_cash_out_count_7d": 8.0,
                    "cell_endpoint_count": 2.0,
                },
                label=3,
            )
        )
        rows.append(
            CellObservation(
                cell="cold",
                occurred_at=when,
                features={
                    "cell_sum_endpoint_cash_out_count_7d": 0.0,
                    "cell_endpoint_count": 2.0,
                },
                label=0,
            )
        )
    return rows


def _events() -> list[CashOutEvent]:
    return [CashOutEvent("hot", DAY0 + timedelta(days=d, hours=2)) for d in range(30)]


def _run(quotability: Quotability):  # type: ignore[no-untyped-def]
    return run(
        _observations(),
        events=_events(),
        resolution=7,
        horizon=HORIZON,
        feature_names=FEATURES,
        quotability=quotability,
        gap=timedelta(days=2),
        flag_fraction=0.5,
    )


def test_uplift_is_withheld_while_the_dataset_is_unquotable() -> None:
    """The whole point. The comparison ran; the number is not available."""
    result = _run(BLOCKED)

    assert result.uplift is None
    assert "NOT QUOTABLE" in result.summary()
    assert result.train_size > 0 and result.test_size > 0


def test_uplift_is_available_once_the_verdict_allows_it() -> None:
    """Without this the previous test passes for code that never computes one.

    A gate that refuses because nothing was calculated is not a gate.
    """
    result = _run(USABLE)

    assert result.uplift is not None
    assert "NOT QUOTABLE" not in result.summary()


def test_the_underlying_figures_are_named_so_they_cannot_be_mistaken() -> None:
    """Hiding them would make debugging impossible; naming them plainly would
    let one be copied into a slide. The prefix survives copy-paste."""
    result = _run(BLOCKED)

    assert hasattr(result, "_unquotable_model_pai")
    assert not hasattr(result, "pai")
    assert not hasattr(result, "accuracy")


def test_the_embargo_is_applied_and_reported() -> None:
    """Rows between train and test belong to neither, and the cost is visible."""
    result = _run(BLOCKED)

    assert result.embargoed_size > 0
    assert result.train_size + result.embargoed_size + result.test_size == 60


def test_a_gap_shorter_than_the_feature_window_is_refused() -> None:
    """The splitter's refusal reaches all the way up to the run.

    Threaded through rather than defaulted, so a caller assembling a run has to
    state the window their features actually use.
    """
    with pytest.raises(ValueError, match="shorter than the longest feature window"):
        run(
            _observations(),
            events=_events(),
            resolution=7,
            horizon=HORIZON,
            feature_names=FEATURES,
            quotability=BLOCKED,
            gap=timedelta(days=2),
            longest_feature_window=timedelta(days=30),
        )


def test_an_unusable_split_returns_a_result_rather_than_scoring_nothing() -> None:
    """An empty test side must not be scored and reported.

    It comes back with zero sizes and no uplift, which a caller can see, instead
    of a PAI computed over nothing.
    """
    result = run(
        _observations(),
        events=_events(),
        resolution=7,
        horizon=HORIZON,
        feature_names=FEATURES,
        quotability=USABLE,
        gap=timedelta(days=400),
    )
    assert result.test_size == 0
    assert result.uplift == 0.0
