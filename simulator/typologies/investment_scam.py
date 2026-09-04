"""Investment / trading scam (spec §9): repeated victim-initiated transfers over days–weeks.

Slower, aggregation-first, higher-value endpoints. Long inter-hop delay models a victim
drip-fed fabricated returns and self-initiating further transfers over an extended period;
``fan_in`` models several transfers converging into fewer aggregation accounts before cash-out.
See ``docs/ml/typology-assumptions.md`` for rationale.
"""

from __future__ import annotations

from atlas.core.enums import CashOutChannel, FraudTypology

from .base import AmountCurve, GeographicDispersion, TypologyGenerator, TypologyProfile

PROFILE = TypologyProfile(
    typology=FraudTypology.INVESTMENT_SCAM,
    layering_depth=(3, 6),
    inter_hop_delay_minutes=(720.0, 5760.0),  # 12 hours – 4 days
    hop_amount=AmountCurve(
        mean_log=11.0, sigma_log=0.9, floor=20_000.0, ceiling=3_000_000.0
    ),
    preferred_channels=(
        (CashOutChannel.BANK_BRANCH, 0.45),
        (CashOutChannel.CRYPTO_P2P, 0.35),
        (CashOutChannel.ATM, 0.20),
    ),
    dispersion=GeographicDispersion.REGIONAL,
    fan_in=True,
    victim_behaviour=(
        "Repeated, victim-initiated transfers spread over days to weeks, paced by fabricated "
        "returns shown on a fake trading platform; amounts aggregate toward fewer, larger "
        "endpoint accounts rather than a single large transfer."
    ),
)


class InvestmentScamGenerator(TypologyGenerator):
    profile = PROFILE
