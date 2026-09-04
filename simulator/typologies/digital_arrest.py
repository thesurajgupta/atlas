"""Digital arrest (spec §9): large single/few transfers under sustained coercion.

Fast, high-value, often multi-city; RTGS/NEFT then rapid layering. Short chain and fast
inter-hop delay model a victim acting under continuous psychological pressure with no time to
reconsider between transfers. See ``docs/ml/typology-assumptions.md`` for rationale.
"""

from __future__ import annotations

from atlas.core.enums import CashOutChannel, FraudTypology

from .base import AmountCurve, GeographicDispersion, TypologyGenerator, TypologyProfile

PROFILE = TypologyProfile(
    typology=FraudTypology.DIGITAL_ARREST,
    layering_depth=(1, 3),
    inter_hop_delay_minutes=(5.0, 90.0),
    hop_amount=AmountCurve(
        mean_log=12.5, sigma_log=0.6, floor=100_000.0, ceiling=5_000_000.0
    ),
    preferred_channels=(
        (CashOutChannel.BANK_BRANCH, 0.6),
        (CashOutChannel.ATM, 0.4),
    ),
    dispersion=GeographicDispersion.MULTI_CITY,
    fan_in=False,
    victim_behaviour=(
        "One or few large transfers moved in immediate succession under sustained impersonation "
        "of a law-enforcement or regulatory authority; no self-initiated delay between hops."
    ),
)


class DigitalArrestGenerator(TypologyGenerator):
    profile = PROFILE
