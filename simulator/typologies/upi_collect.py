"""UPI collect-request / QR fraud (spec §9): many small transfers, high frequency.

Fast, small, dispersed; merchant QR and AePS heavy. Short chain, fast delay, small amounts, and
dispersed geography model a high-volume, low-value-per-victim operation. See
``docs/ml/typology-assumptions.md`` for rationale.
"""

from __future__ import annotations

from atlas.core.enums import CashOutChannel, FraudTypology

from .base import AmountCurve, GeographicDispersion, TypologyGenerator, TypologyProfile

PROFILE = TypologyProfile(
    typology=FraudTypology.UPI_COLLECT_FRAUD,
    layering_depth=(1, 2),
    inter_hop_delay_minutes=(1.0, 30.0),
    hop_amount=AmountCurve(mean_log=8.5, sigma_log=0.7, floor=500.0, ceiling=50_000.0),
    preferred_channels=(
        (CashOutChannel.MERCHANT_QR, 0.55),
        (CashOutChannel.AEPS_BC, 0.45),
    ),
    dispersion=GeographicDispersion.DISPERSED,
    fan_in=True,
    victim_behaviour=(
        "Victim approves a fraudulent UPI collect request or scans a manipulated QR code; "
        "individual amounts are small but the operation runs at high frequency across many "
        "victims and dispersed mule accounts."
    ),
)


class UpiCollectFraudGenerator(TypologyGenerator):
    profile = PROFILE
