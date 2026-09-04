"""Loan-app extortion (spec §9): small repeated debits.

Wallet/merchant heavy, dispersed. The one typology whose topology a linear layering chain can't
express: instead of a chain of distinct mule hops, the victim is repeatedly debited into a
single collection account. ``layering_depth`` is repurposed here to mean debit *count*, not hop
count — see ``docs/ml/typology-assumptions.md``.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from random import Random

from atlas.core.enums import CashOutChannel, FraudTypology

from .base import (
    AccountPool,
    AccountRef,
    AmountCurve,
    GeographicDispersion,
    LayeringHop,
    TypologyGenerator,
    TypologyProfile,
)

PROFILE = TypologyProfile(
    typology=FraudTypology.LOAN_APP_EXTORTION,
    layering_depth=(4, 10),  # repurposed: number of repeated debits, not chain length
    inter_hop_delay_minutes=(30.0, 240.0),
    hop_amount=AmountCurve(mean_log=7.5, sigma_log=0.5, floor=200.0, ceiling=15_000.0),
    preferred_channels=(
        (CashOutChannel.PREPAID_GIFT, 0.4),
        (CashOutChannel.MERCHANT_QR, 0.35),
        (CashOutChannel.POS_CASHBACK, 0.25),
    ),
    dispersion=GeographicDispersion.DISPERSED,
    fan_in=False,
    victim_behaviour=(
        "Victim is coerced by threats (often over unrelated contact-list data harvested by the "
        "loan app) into repeated small debits to a single collection account, rather than one "
        "large transfer."
    ),
)


class LoanAppExtortionGenerator(TypologyGenerator):
    profile = PROFILE

    def _build_hops(
        self,
        rng: Random,
        accounts: AccountPool,
        victim: AccountRef,
        fraud_initiated_at: datetime,
    ) -> tuple[list[LayeringHop], AccountRef, datetime]:
        collector = accounts.sample_mule(rng, near=victim)
        debit_count = rng.randint(*self.profile.layering_depth)
        hops: list[LayeringHop] = []
        clock = fraud_initiated_at
        for _ in range(debit_count):
            clock = clock + timedelta(
                minutes=rng.uniform(*self.profile.inter_hop_delay_minutes)
            )
            hops.append(
                LayeringHop(
                    from_account=victim,
                    to_account=collector,
                    amount=self.profile.hop_amount.sample(rng),
                    occurred_at=clock,
                )
            )
        return hops, collector, clock
