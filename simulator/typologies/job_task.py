"""Job / task fraud (spec §9): small onboarding payments, many victims → few accounts.

Strong fan-in, then structured withdrawal.

**Known limitation** (recorded rather than silently assumed away — see
``docs/ml/typology-assumptions.md``): this generator produces one scenario per victim with a
short chain into the mule pool. Cross-scenario mule-account reuse — the actual mechanism that
produces fan-in across many victims — and multi-endpoint structured withdrawal are batch/
population-level concerns that belong with the account-pool implementation (issue #4), not a
single scenario's topology. ``fan_in = True`` documents the intended behaviour for when that
batch driver lands.
"""

from __future__ import annotations

from atlas.core.enums import CashOutChannel, FraudTypology

from .base import AmountCurve, GeographicDispersion, TypologyGenerator, TypologyProfile

PROFILE = TypologyProfile(
    typology=FraudTypology.JOB_TASK_FRAUD,
    layering_depth=(2, 3),
    inter_hop_delay_minutes=(15.0, 180.0),
    hop_amount=AmountCurve(mean_log=8.0, sigma_log=0.6, floor=500.0, ceiling=100_000.0),
    preferred_channels=(
        (CashOutChannel.AEPS_BC, 0.4),
        (CashOutChannel.MERCHANT_QR, 0.35),
        (CashOutChannel.ATM, 0.25),
    ),
    dispersion=GeographicDispersion.REGIONAL,
    fan_in=True,
    victim_behaviour=(
        "Victim pays a small onboarding/registration fee for a fake task-based job; many "
        "victims' onboarding payments converge onto a small number of collection accounts "
        "before a structured withdrawal designed to stay under reporting thresholds."
    ),
)


class JobTaskFraudGenerator(TypologyGenerator):
    profile = PROFILE
