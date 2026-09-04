"""Geography, endpoint and population generator tests (spec §8.1, §23.1, §23.3; issue #4)."""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
from random import Random

import pytest
from atlas.core.enums import CashOutChannel, FraudTypology

from simulator.generators.endpoints import EndpointCatalog, sample_channel_for_zone
from simulator.generators.geography import ZONES, ZoneDensity, sample_zone
from simulator.generators.population import Population
from simulator.typologies import GENERATORS

FRAUD_INITIATED_AT = datetime(2026, 6, 1, 9, 0, tzinfo=UTC)


def test_all_zones_have_unique_codes() -> None:
    codes = [z.code for z in ZONES]
    assert len(codes) == len(set(codes))


def test_sample_zone_near_favours_same_state() -> None:
    mumbai = next(z for z in ZONES if z.code == "MH-MUM")
    rng = Random(0)
    picks = [sample_zone(rng, near=mumbai).state for _ in range(200)]
    same_state_fraction = picks.count("Maharashtra") / len(picks)
    assert same_state_fraction > 0.5, "near= should bias toward the same state"


def test_channel_mix_is_aeps_heavy_outside_urban_zones() -> None:
    """Spec §8.1: AePS/BC is 'now a dominant vector' outside dense urban cores."""
    rural = next(z for z in ZONES if z.density is ZoneDensity.RURAL)
    rng = Random(1)
    counts = Counter(sample_channel_for_zone(rng, rural) for _ in range(500))
    assert counts[CashOutChannel.AEPS_BC] == max(counts.values())


def test_crypto_endpoints_are_not_zone_anchored() -> None:
    catalog = EndpointCatalog()
    rng = Random(2)
    endpoint = catalog.sample_endpoint(rng, CashOutChannel.CRYPTO_P2P)
    assert endpoint.jurisdiction_id is None


def test_endpoint_pool_is_reused_not_regenerated() -> None:
    catalog = EndpointCatalog()
    rng = Random(3)
    seen = {
        catalog.sample_endpoint(rng, CashOutChannel.ATM).endpoint_id for _ in range(100)
    }
    # A small illustrative pool per zone*channel — repeated sampling must land on a bounded set,
    # not mint a new endpoint every call.
    assert len(seen) < 100


def test_population_anchors_accounts_to_a_home_zone() -> None:
    population = Population()
    rng = Random(4)
    victim = population.sample_victim(rng)
    assert population.zone_of(victim) is not None


def test_mule_degree_distribution_is_heavy_tailed() -> None:
    """Spec §23.3: account degree distribution must be heavy-tailed, not uniform."""
    population = Population(new_mule_probability=0.2)
    rng = Random(5)
    victim = population.sample_victim(rng)
    current = victim
    mules = []
    for _ in range(500):
        mule = population.sample_mule(rng, near=current)
        mules.append(mule)
        current = mule

    degrees = sorted((population.degree(m) for m in set(mules)), reverse=True)
    total_hops = sum(degrees)
    top_10_pct_count = max(1, len(degrees) // 10)
    top_10_pct_share = sum(degrees[:top_10_pct_count]) / total_hops
    # Heavy-tailed: the busiest ~10% of mules should carry a disproportionate share of hops.
    # A uniform distribution would give top_10_pct_share ≈ 0.10.
    assert top_10_pct_share > 0.25


def test_mule_sampling_biases_toward_victim_zone() -> None:
    population = Population(
        new_mule_probability=0.9
    )  # mostly fresh mules, isolates zone bias
    rng = Random(6)
    victim = population.sample_victim(rng)
    victim_state = population.zone_of(victim).state  # type: ignore[union-attr]
    mules = [population.sample_mule(rng, near=victim) for _ in range(200)]
    same_state = sum(
        1
        for m in mules
        if population.zone_of(m) is not None
        and population.zone_of(m).state == victim_state  # type: ignore[union-attr]
    )
    assert same_state / len(mules) > 0.5


@pytest.mark.parametrize("typology", list(GENERATORS))
def test_typology_generators_run_end_to_end_against_real_population(
    typology: FraudTypology,
) -> None:
    """Issue #4's generators satisfy the protocols issue #5 was built against — no stubs."""
    generator = GENERATORS[typology]()
    population = Population()
    endpoints = EndpointCatalog()
    scenario = generator.generate(
        Random(7), population, endpoints, fraud_initiated_at=FRAUD_INITIATED_AT
    )
    assert scenario.typology == typology
    assert scenario.cash_out.endpoint.channel == scenario.cash_out.channel
