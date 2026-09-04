"""Customer-care impersonation (spec §9): one-to-few, remote-access assisted.

Fast, ATM/AePS, near the mule's home district. ``LOCAL`` dispersion is the distinguishing
assumption versus digital arrest — modelled as operating close to the mule network's home base
rather than spreading cash-out across states. See ``docs/ml/typology-assumptions.md`` for
rationale.
"""

from __future__ import annotations

from atlas.core.enums import CashOutChannel, FraudTypology

from .base import AmountCurve, GeographicDispersion, TypologyGenerator, TypologyProfile

PROFILE = TypologyProfile(
    typology=FraudTypology.CUSTOMER_CARE_IMPERSONATION,
    layering_depth=(1, 2),
    inter_hop_delay_minutes=(5.0, 60.0),
    hop_amount=AmountCurve(
        mean_log=10.5, sigma_log=0.6, floor=5_000.0, ceiling=500_000.0
    ),
    preferred_channels=(
        (CashOutChannel.ATM, 0.55),
        (CashOutChannel.AEPS_BC, 0.45),
    ),
    dispersion=GeographicDispersion.LOCAL,
    fan_in=False,
    victim_behaviour=(
        "Victim is guided, via remote-access software or a fake support call, into one or two "
        "transfers to a mule account cashed out close to that mule's home district."
    ),
)


class CustomerCareImpersonationGenerator(TypologyGenerator):
    profile = PROFILE
