"""Cash-out endpoint density and channel mix (spec §8.1, §23.1, issue #4).

Implements the ``EndpointRegistry`` protocol from ``simulator.typologies.base`` — the seam
issue #5 was built against, so this plugs in directly. See
``docs/ml/population-assumptions.md`` for the density-by-channel rationale.
"""

from __future__ import annotations

from random import Random

from atlas.core.enums import CashOutChannel

from simulator.typologies.base import AccountRef, EndpointRef

from .geography import ZONE_BY_CODE, ZONES, Zone, ZoneDensity, sample_cash_out_zone

# Channel weight per density tier (spec §8.1: AePS/BC is "now a dominant vector" outside urban
# cores — modelled here as the majority channel in semi-urban/rural zones, not a minor ATM
# variant). Weights need not sum to 1; sample_endpoint normalises.
_CHANNEL_WEIGHTS: dict[ZoneDensity, tuple[tuple[CashOutChannel, float], ...]] = {
    ZoneDensity.URBAN: (
        (CashOutChannel.ATM, 0.30),
        (CashOutChannel.AEPS_BC, 0.15),
        (CashOutChannel.BANK_BRANCH, 0.10),
        (CashOutChannel.MERCHANT_QR, 0.30),
        (CashOutChannel.POS_CASHBACK, 0.10),
        (CashOutChannel.PREPAID_GIFT, 0.05),
    ),
    ZoneDensity.SEMI_URBAN: (
        (CashOutChannel.ATM, 0.25),
        (CashOutChannel.AEPS_BC, 0.35),
        (CashOutChannel.BANK_BRANCH, 0.10),
        (CashOutChannel.MERCHANT_QR, 0.20),
        (CashOutChannel.POS_CASHBACK, 0.06),
        (CashOutChannel.PREPAID_GIFT, 0.04),
    ),
    ZoneDensity.RURAL: (
        (CashOutChannel.ATM, 0.15),
        (CashOutChannel.AEPS_BC, 0.55),
        (CashOutChannel.BANK_BRANCH, 0.12),
        (CashOutChannel.MERCHANT_QR, 0.10),
        (CashOutChannel.POS_CASHBACK, 0.04),
        (CashOutChannel.PREPAID_GIFT, 0.04),
    ),
}

# Endpoints per zone per channel, before weighting by density tier — a small illustrative count,
# not a calibrated outlet census (see docs/ml/population-assumptions.md).
_ENDPOINTS_PER_ZONE = 8

# CRYPTO_P2P is explicitly not geographic (spec §8.1) — one small pool-wide set of logical
# endpoints, independent of any zone.
_CRYPTO_POOL_SIZE = 12


class EndpointCatalog:
    """Concrete ``EndpointRegistry``: samples a cash-out endpoint for a channel, biased toward
    ``near``'s zone when the channel is geographic.

    Endpoints are generated lazily and cached per (zone, channel) so repeated sampling reuses the
    same small pool rather than minting an unbounded number of one-off endpoints — cash-out
    infrastructure is finite and reused across cases in reality, and downstream endpoint-risk
    scoring (spec §35) needs endpoints to recur to have anything to learn from.
    """

    def __init__(self) -> None:
        self._pools: dict[tuple[str, CashOutChannel], list[EndpointRef]] = {}
        self._crypto_pool: list[EndpointRef] = []

    def _endpoints_for(
        self, rng: Random, zone: Zone, channel: CashOutChannel
    ) -> list[EndpointRef]:
        key = (zone.code, channel)
        if key not in self._pools:
            self._pools[key] = [
                EndpointRef(
                    endpoint_id=f"{zone.code}-{channel.value}-{i:03d}",
                    channel=channel,
                    jurisdiction_id=zone.code,
                )
                for i in range(_ENDPOINTS_PER_ZONE)
            ]
        return self._pools[key]

    def _crypto_endpoints(self) -> list[EndpointRef]:
        if not self._crypto_pool:
            self._crypto_pool = [
                EndpointRef(
                    endpoint_id=f"CRYPTO-{i:03d}",
                    channel=CashOutChannel.CRYPTO_P2P,
                    jurisdiction_id=None,
                )
                for i in range(_CRYPTO_POOL_SIZE)
            ]
        return self._crypto_pool

    def sample_endpoint(
        self, rng: Random, channel: CashOutChannel, *, near: AccountRef | None = None
    ) -> EndpointRef:
        if channel is CashOutChannel.CRYPTO_P2P:
            return rng.choice(self._crypto_endpoints())

        zone = self._zone_for_account(rng, near)
        return rng.choice(self._endpoints_for(rng, zone, channel))

    def _zone_for_account(self, rng: Random, account: AccountRef | None) -> Zone:
        """Where this account's money is withdrawn.

        **Issue #50 lived here.** This method took ``account`` and returned
        ``rng.choice(ZONES)`` — the cash-out zone was statistically independent of
        where the money had gone, so no feature derived from the trail carried any
        information about the answer. Both rankers scored PAI ≈ 1.0, which is not a
        finding about the approach; it is the arithmetic of random labels, and every
        metric the project reported was measuring the generator.

        ``AccountRef.jurisdiction_id`` is the zone code the population assigned, so the
        home zone is resolvable here without a reference to ``Population`` — the
        information was already in the argument that was being ignored.

        The fall-back to a uniform draw is kept for the standalone case (a test that
        does not wire up a ``Population``, an account with no zone), and it is
        deliberately *not* a raise: this class is usable on its own, and that was the
        original justification for the bug. The difference is that it is now the
        exception rather than the whole behaviour.
        """
        home = (
            ZONE_BY_CODE.get(account.jurisdiction_id)
            if account is not None and account.jurisdiction_id is not None
            else None
        )
        if home is None:
            return rng.choice(ZONES)
        return sample_cash_out_zone(rng, home=home)


def channel_weights_for(
    density: ZoneDensity,
) -> tuple[tuple[CashOutChannel, float], ...]:
    return _CHANNEL_WEIGHTS[density]


def sample_channel_for_zone(rng: Random, zone: Zone) -> CashOutChannel:
    """Pick a channel plausible for this zone's density tier — used by ``Population`` when it
    needs a channel-consistent endpoint for a specific zone, which ``EndpointCatalog`` alone
    (channel already chosen by the typology profile) does not need."""
    weights = _CHANNEL_WEIGHTS[zone.density]
    channels = [c for c, _w in weights]
    probs = [w for _c, w in weights]
    chosen: CashOutChannel = rng.choices(channels, weights=probs, k=1)[0]
    return chosen
