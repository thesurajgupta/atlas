"""Sextortion (spec §9): small, urgent, single.

Wallet/UPI, fast. Single hop, fastest inter-hop delay of any typology, smallest amount range —
models one panicked payment made under acute urgency, with no layering. See
``docs/ml/typology-assumptions.md`` for rationale.
"""

from __future__ import annotations

from atlas.core.enums import CashOutChannel, FraudTypology

from .base import AmountCurve, GeographicDispersion, TypologyGenerator, TypologyProfile

PROFILE = TypologyProfile(
    typology=FraudTypology.SEXTORTION,
    layering_depth=(1, 1),
    inter_hop_delay_minutes=(5.0, 45.0),
    hop_amount=AmountCurve(
        mean_log=8.0, sigma_log=0.5, floor=1_000.0, ceiling=100_000.0
    ),
    preferred_channels=(
        (CashOutChannel.AEPS_BC, 0.5),
        (CashOutChannel.MERCHANT_QR, 0.5),
    ),
    dispersion=GeographicDispersion.LOCAL,
    fan_in=False,
    victim_behaviour=(
        "A single urgent payment made under acute time pressure (threat of imminent image/video "
        "release), with no layering delay between the transfer and cash-out."
    ),
)


class SextortionGenerator(TypologyGenerator):
    profile = PROFILE
