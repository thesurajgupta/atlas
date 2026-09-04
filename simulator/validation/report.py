"""Realism validation report (spec §23.3, issue #6): runs every check this package has against
a batch of generated scenarios, and says plainly which ones it could not run.

This is a report generator, not a CI gate by itself — ``make eval``-style tooling that wires this
into CI is future work (spec §47's phase plan), not part of this issue.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from random import Random

from atlas.core.enums import FraudTypology

from simulator.generators import EndpointCatalog, Population
from simulator.typologies import GENERATORS
from simulator.typologies.base import FraudScenario

from .amounts import AmountSanityResult, check_amount_sanity
from .benford import BenfordResult, check_benford_conformance
from .degree_distribution import DegreeDistributionResult, check_heavy_tailed_degree
from .timing import TimingSanityResult, check_timing_sanity


@dataclass(frozen=True)
class RealismReport:
    scenario_count: int
    benford: BenfordResult
    degree_distribution: DegreeDistributionResult
    amounts_by_typology: dict[FraudTypology, AmountSanityResult]
    timing_by_typology: dict[FraudTypology, list[TimingSanityResult]]
    separability_status: str
    passes: bool


def generate_scenario_batch(
    rng: Random,
    population: Population,
    endpoints: EndpointCatalog,
    count_per_typology: int,
) -> list[FraudScenario]:
    """Generate ``count_per_typology`` scenarios for every typology, all against the same
    ``population``/``endpoints`` instance so mule reuse (and therefore the degree distribution
    this report checks) behaves as it would in a real batch run."""
    scenarios: list[FraudScenario] = []
    fraud_initiated_at = datetime(2026, 1, 1, tzinfo=UTC)
    for generator_cls in GENERATORS.values():
        generator = generator_cls()
        for _ in range(count_per_typology):
            scenarios.append(
                generator.generate(
                    rng, population, endpoints, fraud_initiated_at=fraud_initiated_at
                )
            )
    return scenarios


def run_realism_checks(
    scenarios: list[FraudScenario], population: Population
) -> RealismReport:
    """Run every check that can run against fraud-scenario data alone. The separability gate
    needs synthetic-normal data too (see separability.py) and is reported as not-run, not
    silently skipped."""
    all_amounts = [hop.amount for s in scenarios for hop in s.hops] + [
        s.cash_out.amount for s in scenarios
    ]
    benford = check_benford_conformance(all_amounts)

    # population.degree() returns each mule's running total, so counting once per account (not
    # once per hop it appears in) gives its final degree.
    final_degree_by_mule: dict[str, int] = {}
    for s in scenarios:
        for hop in s.hops:
            final_degree_by_mule[hop.to_account.account_id] = population.degree(
                hop.to_account
            )
    degree_result = check_heavy_tailed_degree(list(final_degree_by_mule.values()))

    amounts_by_typology: dict[FraudTypology, AmountSanityResult] = {}
    timing_by_typology: dict[FraudTypology, list[TimingSanityResult]] = {}
    for typology, generator_cls in GENERATORS.items():
        profile = generator_cls().profile
        typed_scenarios = [s for s in scenarios if s.typology is typology]
        typed_amounts = [hop.amount for s in typed_scenarios for hop in s.hops] + [
            s.cash_out.amount for s in typed_scenarios
        ]
        if typed_amounts:
            amounts_by_typology[typology] = check_amount_sanity(typed_amounts, profile)

        timing_results = []
        for s in typed_scenarios:
            timestamps = [
                s.fraud_initiated_at,
                *[h.occurred_at for h in s.hops],
                s.cash_out.occurred_at,
            ]
            timing_results.append(check_timing_sanity(timestamps, profile))
        timing_by_typology[typology] = timing_results

    checks_that_ran_pass = (
        benford.passes
        and degree_result.passes
        and all(r.passes for r in amounts_by_typology.values())
        and all(t.passes for results in timing_by_typology.values() for t in results)
    )

    return RealismReport(
        scenario_count=len(scenarios),
        benford=benford,
        degree_distribution=degree_result,
        amounts_by_typology=amounts_by_typology,
        timing_by_typology=timing_by_typology,
        separability_status=(
            "NOT_RUN: requires the synthetic-normal-population generator (spec §23.1), which "
            "does not exist yet — see docs/ml/simulator-limitations.md. This dataset is not "
            "validated until that gate runs and passes."
        ),
        passes=checks_that_ran_pass,
    )
