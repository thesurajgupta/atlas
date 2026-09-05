"""Realism validation tests (spec §23.3, issue #6)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from random import Random

import pytest

from simulator.generators import EndpointCatalog, Population
from simulator.typologies import GENERATORS
from simulator.validation import (
    check_amount_sanity,
    check_benford_conformance,
    check_heavy_tailed_degree,
    check_separability,
    check_timing_sanity,
    generate_scenario_batch,
    gini_coefficient,
    leading_digit,
    run_realism_checks,
    top_decile_share,
)

FRAUD_INITIATED_AT = datetime(2026, 6, 1, 9, 0, tzinfo=UTC)


# ---- benford.py ----


def test_leading_digit_examples() -> None:
    assert leading_digit(Decimal("275202.95")) == 2
    assert leading_digit(Decimal("0.53")) == 5
    assert leading_digit(Decimal("999.99")) == 9


def test_benford_requires_a_minimum_sample() -> None:
    with pytest.raises(ValueError, match="at least 100"):
        check_benford_conformance([Decimal("100.00")] * 10)


def test_real_typology_amounts_are_evaluated_for_benford_conformance() -> None:
    """Not asserting pass/fail here — the point is the check runs and returns a real statistic
    against actual generator output, not synthetic test fixtures standing in for it."""
    rng = Random(0)
    population = Population()
    endpoints = EndpointCatalog()
    scenarios = generate_scenario_batch(
        rng, population, endpoints, count_per_typology=50
    )
    amounts = [hop.amount for s in scenarios for hop in s.hops] + [
        s.cash_out.amount for s in scenarios
    ]
    result = check_benford_conformance(amounts)
    assert result.sample_size == len(amounts)
    assert result.statistic >= 0
    assert set(result.observed_frequency) == set(range(1, 10))


# ---- degree_distribution.py ----


def test_gini_of_uniform_degrees_is_near_zero() -> None:
    assert gini_coefficient([10] * 100) == pytest.approx(0.0, abs=1e-9)


def test_gini_of_concentrated_degrees_is_high() -> None:
    degrees = [1000] + [1] * 99
    assert gini_coefficient(degrees) > 0.8


def test_top_decile_share_of_uniform_is_about_ten_percent() -> None:
    assert top_decile_share([10] * 100) == pytest.approx(0.10, abs=0.02)


def test_heavy_tailed_check_fails_on_uniform_degrees() -> None:
    result = check_heavy_tailed_degree([10] * 200)
    assert not result.passes


def test_heavy_tailed_check_passes_on_concentrated_degrees() -> None:
    degrees = [500] * 5 + [1] * 95
    result = check_heavy_tailed_degree(degrees)
    assert result.passes


def test_population_mule_reuse_produces_a_heavy_tail() -> None:
    """Issue #4's actual Population, not a synthetic fixture, produces a passing distribution."""
    population = Population(new_mule_probability=0.2)
    rng = Random(1)
    victim = population.sample_victim(rng)
    current = victim
    mules = []
    for _ in range(500):
        mule = population.sample_mule(rng, near=current)
        mules.append(mule)
        current = mule
    degrees = [population.degree(m) for m in set(mules)]
    assert check_heavy_tailed_degree(degrees).passes


# ---- amounts.py ----


def test_amount_sanity_flags_out_of_bounds() -> None:
    generator = GENERATORS[next(iter(GENERATORS))]()
    profile = generator.profile
    too_high = Decimal(str(profile.hop_amount.ceiling)) * 2
    result = check_amount_sanity([too_high], profile)
    assert not result.passes
    assert result.out_of_bounds == 1


def test_amount_sanity_flags_unquantized() -> None:
    generator = GENERATORS[next(iter(GENERATORS))]()
    profile = generator.profile
    mid = (
        Decimal(str(profile.hop_amount.floor))
        + Decimal(str(profile.hop_amount.ceiling))
    ) / 2
    bad = mid.quantize(Decimal("0.0001"))
    result = check_amount_sanity([bad], profile)
    assert not result.passes
    assert result.not_quantized == 1


@pytest.mark.parametrize("typology", list(GENERATORS))
def test_real_generator_amounts_pass_their_own_bounds(typology) -> None:  # type: ignore[no-untyped-def]
    generator = GENERATORS[typology]()
    population = Population()
    endpoints = EndpointCatalog()
    amounts = []
    rng = Random(2)
    for _ in range(50):
        scenario = generator.generate(
            rng, population, endpoints, fraud_initiated_at=FRAUD_INITIATED_AT
        )
        amounts.extend(hop.amount for hop in scenario.hops)
        amounts.append(scenario.cash_out.amount)
    result = check_amount_sanity(amounts, generator.profile)
    assert result.passes


# ---- timing.py ----


def test_timing_sanity_flags_non_monotonic() -> None:
    generator = GENERATORS[next(iter(GENERATORS))]()
    profile = generator.profile
    timestamps = [
        FRAUD_INITIATED_AT,
        FRAUD_INITIATED_AT + timedelta(minutes=10),
        FRAUD_INITIATED_AT + timedelta(minutes=5),  # goes backwards
    ]
    result = check_timing_sanity(timestamps, profile)
    assert not result.passes
    assert result.non_monotonic == 1


@pytest.mark.parametrize("typology", list(GENERATORS))
def test_real_generator_timing_passes_sanity(typology) -> None:  # type: ignore[no-untyped-def]
    generator = GENERATORS[typology]()
    population = Population()
    endpoints = EndpointCatalog()
    rng = Random(3)
    for _ in range(20):
        scenario = generator.generate(
            rng, population, endpoints, fraud_initiated_at=FRAUD_INITIATED_AT
        )
        timestamps = [
            scenario.fraud_initiated_at,
            *[h.occurred_at for h in scenario.hops],
            scenario.cash_out.occurred_at,
        ]
        result = check_timing_sanity(timestamps, generator.profile)
        assert result.passes


# ---- separability.py ----


def test_separability_passes_on_identical_distributions() -> None:
    rng = Random(4)
    values = [rng.uniform(0, 100) for _ in range(200)]
    result = check_separability({"amount": values}, {"amount": list(values)})
    assert result.passes
    assert result.max_auc == pytest.approx(0.5, abs=0.05)


def test_separability_fails_on_a_leaking_feature() -> None:
    fraud = {"amount": [1000.0] * 100}
    normal = {"amount": [1.0] * 100}
    result = check_separability(fraud, normal)
    assert not result.passes
    assert result.max_auc > 0.9


def test_separability_requires_matching_feature_names() -> None:
    with pytest.raises(ValueError, match="same feature names"):
        check_separability({"a": [1.0]}, {"b": [1.0]})


# ---- report.py ----


def test_full_report_runs_and_flags_separability_as_not_run() -> None:
    rng = Random(5)
    population = Population()
    endpoints = EndpointCatalog()
    scenarios = generate_scenario_batch(
        rng, population, endpoints, count_per_typology=30
    )
    report = run_realism_checks(scenarios, population)

    assert report.scenario_count == len(scenarios)
    assert "NOT_RUN" in report.separability_status
    assert len(report.amounts_by_typology) == len(GENERATORS)
