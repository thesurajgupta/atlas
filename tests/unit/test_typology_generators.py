"""Typology generator tests (spec §9, §23; issue #5).

No database needed — these exercise pure generator logic against stub population/endpoint
implementations, so they run in the fast pre-push loop rather than needing `make up` first.
"""

from __future__ import annotations

from datetime import UTC, datetime
from random import Random

import pytest
from atlas.core.enums import CashOutChannel, FraudTypology

from simulator.typologies import GENERATORS
from simulator.typologies.base import AccountRef, EndpointRef

FRAUD_INITIATED_AT = datetime(2026, 6, 1, 9, 0, tzinfo=UTC)


class StubAccountPool:
    """Deterministic account source. Real accounts come from issue #4's population generator —
    this stub exists only so typology logic can be developed and tested without it."""

    def sample_victim(self, rng: Random) -> AccountRef:
        return AccountRef(account_id=f"victim-{rng.randint(0, 1_000_000)}")

    def sample_mule(self, rng: Random, *, near: AccountRef | None = None) -> AccountRef:
        return AccountRef(account_id=f"mule-{rng.randint(0, 1_000_000)}")


class StubEndpointRegistry:
    """Deterministic endpoint source. Real endpoints come from issue #4 — see StubAccountPool."""

    def sample_endpoint(
        self, rng: Random, channel: CashOutChannel, *, near: AccountRef | None = None
    ) -> EndpointRef:
        return EndpointRef(
            endpoint_id=f"ep-{rng.randint(0, 1_000_000)}", channel=channel
        )


@pytest.mark.parametrize("typology", list(GENERATORS))
def test_scenario_typology_matches_generator(typology: FraudTypology) -> None:
    generator = GENERATORS[typology]()
    scenario = generator.generate(
        Random(0),
        StubAccountPool(),
        StubEndpointRegistry(),
        fraud_initiated_at=FRAUD_INITIATED_AT,
    )
    assert scenario.typology == typology


@pytest.mark.parametrize("typology", list(GENERATORS))
def test_generation_is_deterministic_for_a_fixed_seed(typology: FraudTypology) -> None:
    """ADR-005: fixed, committed seeds must reproduce scenarios bit-for-bit."""
    generator = GENERATORS[typology]()
    first = generator.generate(
        Random(42),
        StubAccountPool(),
        StubEndpointRegistry(),
        fraud_initiated_at=FRAUD_INITIATED_AT,
    )
    second = generator.generate(
        Random(42),
        StubAccountPool(),
        StubEndpointRegistry(),
        fraud_initiated_at=FRAUD_INITIATED_AT,
    )
    assert first.hops == second.hops
    assert first.cash_out.endpoint == second.cash_out.endpoint
    assert first.cash_out.amount == second.cash_out.amount
    assert first.cash_out.occurred_at == second.cash_out.occurred_at


@pytest.mark.parametrize("typology", list(GENERATORS))
def test_cash_out_channel_is_one_of_the_profiles_preferred_channels(
    typology: FraudTypology,
) -> None:
    generator = GENERATORS[typology]()
    scenario = generator.generate(
        Random(1),
        StubAccountPool(),
        StubEndpointRegistry(),
        fraud_initiated_at=FRAUD_INITIATED_AT,
    )
    allowed = {channel for channel, _weight in generator.profile.preferred_channels}
    assert scenario.cash_out.channel in allowed
    assert scenario.cash_out.endpoint.channel == scenario.cash_out.channel


@pytest.mark.parametrize("typology", list(GENERATORS))
def test_hop_and_cash_out_timestamps_never_precede_fraud_initiation(
    typology: FraudTypology,
) -> None:
    generator = GENERATORS[typology]()
    scenario = generator.generate(
        Random(7),
        StubAccountPool(),
        StubEndpointRegistry(),
        fraud_initiated_at=FRAUD_INITIATED_AT,
    )
    for hop in scenario.hops:
        assert hop.occurred_at >= FRAUD_INITIATED_AT
    assert scenario.cash_out.occurred_at >= FRAUD_INITIATED_AT
    if scenario.hops:
        assert scenario.cash_out.occurred_at >= scenario.hops[-1].occurred_at


def test_loan_app_extortion_uses_repeated_debits_to_a_single_collector() -> None:
    """The one typology whose topology isn't a linear chain (docs/ml/typology-assumptions.md)."""
    generator = GENERATORS[FraudTypology.LOAN_APP_EXTORTION]()
    scenario = generator.generate(
        Random(3),
        StubAccountPool(),
        StubEndpointRegistry(),
        fraud_initiated_at=FRAUD_INITIATED_AT,
    )
    assert len(scenario.hops) >= generator.profile.layering_depth[0]
    collectors = {hop.to_account for hop in scenario.hops}
    assert len(collectors) == 1, (
        "every debit should land in the same collection account"
    )
    victims = {hop.from_account for hop in scenario.hops}
    assert victims == {scenario.victim}, (
        "every debit should originate from the victim directly"
    )


def test_digital_arrest_layering_depth_is_short() -> None:
    """Spec §9: digital arrest is 'large single/few transfers' — never a long chain."""
    generator = GENERATORS[FraudTypology.DIGITAL_ARREST]()
    for seed in range(20):
        scenario = generator.generate(
            Random(seed),
            StubAccountPool(),
            StubEndpointRegistry(),
            fraud_initiated_at=FRAUD_INITIATED_AT,
        )
        assert 1 <= len(scenario.hops) <= 3


def test_other_typology_has_no_generator() -> None:
    """spec §9 defines seven categories; OTHER is deliberately not one of them."""
    assert FraudTypology.OTHER not in GENERATORS
