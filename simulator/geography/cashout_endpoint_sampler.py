"""
Cash-out endpoint sampler.

Fixes: "cash-out location random hai" (§8.1, §16.3, §23.1, ADR-005, ADR-012).

Root cause of the old bug: locations were almost certainly drawn from a flat
uniform distribution over lat/lon (or an ad-hoc hotspot list). That fails two
spec requirements simultaneously:

  1. §23.3 realism validation — "geographic distribution consistent with
     population and endpoint density" — uniform random over a bounding box is
     not consistent with anything real.
  2. §16.3 negative sampling (ADR-012) — "a test asserts the true endpoint is
     not preferentially placed in the candidate set" — if the true endpoint is
     always the single geographically 'special' point, the model can learn to
     find it via simulator artefacts instead of real signal, which invalidates
     every downstream metric.

This module samples from a registered `CashOutEndpoint` population (§8.1),
weighted by endpoint density per H3 cell and by the typology's channel
preference (§9), not by picking a coordinate directly.

IMPORTANT: This module lives under `simulator/`, which is NOT importable by
the serving path (§19, enforced by import-linter, see line 790 of the spec).
The *chosen* endpoint for a scenario is truth; truth must be written only to
`simulator.truth` and never to the canonical complaint/transaction records
that ingestion will later read (§23.2). Do not import this into
`atlas.features` or `atlas.predict`.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from enum import Enum
from typing import Sequence

import h3  # h3-py


class Channel(str, Enum):
    ATM = "ATM"
    AEPS_BC = "AEPS_BC"
    BANK_BRANCH = "BANK_BRANCH"
    POS_CASHBACK = "POS_CASHBACK"
    MERCHANT_QR = "MERCHANT_QR"
    PREPAID_GIFT = "PREPAID_GIFT"
    CRYPTO_P2P = "CRYPTO_P2P"  # logical endpoint — no geometry, handled separately


@dataclass(frozen=True)
class CashOutEndpoint:
    endpoint_id: str
    channel: Channel
    lat: float | None
    lon: float | None
    h3_cell: str | None
    fraud_linked_utilisation: float  # historical prior, 0..1 — NOT the same as "risk to a place" (§2)


# Per-typology channel preference (§9 table). Weights are documented
# assumptions (docs/ml/typology-assumptions.md), not measured facts.
TYPOLOGY_CHANNEL_WEIGHTS: dict[str, dict[Channel, float]] = {
    "digital_arrest": {Channel.ATM: 0.35, Channel.AEPS_BC: 0.25, Channel.BANK_BRANCH: 0.25, Channel.CRYPTO_P2P: 0.15},
    "investment_scam": {Channel.BANK_BRANCH: 0.4, Channel.CRYPTO_P2P: 0.35, Channel.ATM: 0.25},
    "upi_collect_qr": {Channel.MERCHANT_QR: 0.5, Channel.AEPS_BC: 0.35, Channel.POS_CASHBACK: 0.15},
    "customer_care_impersonation": {Channel.ATM: 0.5, Channel.AEPS_BC: 0.5},
    "loan_app_extortion": {Channel.MERCHANT_QR: 0.5, Channel.AEPS_BC: 0.3, Channel.POS_CASHBACK: 0.2},
    "job_task_fraud": {Channel.AEPS_BC: 0.6, Channel.BANK_BRANCH: 0.4},
    "sextortion": {Channel.MERCHANT_QR: 0.6, Channel.AEPS_BC: 0.4},
}


def sample_cashout_endpoint(
    typology: str,
    candidate_endpoints: Sequence[CashOutEndpoint],
    mule_home_h3_cell: str,
    rng: random.Random,
    max_ring: int = 6,
) -> CashOutEndpoint:
    """
    Pick a plausible true cash-out endpoint for one seeded fraud scenario.

    Weighting = (typology channel preference) x (endpoint density near the
    mule's KYC district, decaying with H3 ring distance) x (a *bounded*
    random jitter so the true endpoint is not always the single densest cell
    — that would recreate the separability failure §23.3 warns about).
    """
    channel_weights = TYPOLOGY_CHANNEL_WEIGHTS[typology]

    def ring_distance(ep: CashOutEndpoint) -> int:
        if ep.h3_cell is None:  # CRYPTO_P2P — logical, treat as ring 0
            return 0
        try:
            return h3.grid_distance(mule_home_h3_cell, ep.h3_cell)
        except Exception:
            return max_ring + 1  # unreachable / different resolution -> heavily penalised

    scored = []
    for ep in candidate_endpoints:
        chan_w = channel_weights.get(ep.channel, 0.0)
        if chan_w == 0.0:
            continue
        dist = ring_distance(ep)
        if dist > max_ring:
            continue
        distance_decay = 1.0 / (1 + dist)  # not a hard cutoff — long cash-outs do happen
        # small additive noise (not multiplicative) so density doesn't fully
        # determine the outcome — keeps the true endpoint inside the
        # candidate set without making it trivially identifiable
        noise = rng.uniform(0.85, 1.15)
        weight = chan_w * distance_decay * (0.3 + 0.7 * ep.fraud_linked_utilisation) * noise
        scored.append((ep, weight))

    if not scored:
        raise ValueError(
            f"No viable cash-out endpoint for typology={typology!r} within {max_ring} rings "
            f"of {mule_home_h3_cell!r} — widen max_ring or check endpoint registry seeding."
        )

    endpoints, weights = zip(*scored)
    return rng.choices(endpoints, weights=weights, k=1)[0]
