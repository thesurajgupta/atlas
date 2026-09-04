"""Account pool (spec §23.1, §23.3, issue #4).

Implements the ``AccountPool`` protocol from ``simulator.typologies.base`` — the seam issue #5
was built against. See ``docs/ml/population-assumptions.md`` for why accounts are zone-anchored
and why mules are reused via preferential attachment rather than minted fresh per scenario.
"""

from __future__ import annotations

from random import Random

from simulator.typologies.base import AccountRef

from .geography import Zone, sample_zone


class Population:
    """Concrete ``AccountPool``.

    Every account is anchored to a home ``Zone`` at creation, tracked internally so
    ``sample_mule(rng, near=...)`` can bias toward the *account's* zone rather than needing the
    caller to pass geography explicitly — ``AccountRef`` itself stays a plain opaque reference,
    per the protocol in ``simulator.typologies.base``.

    Mules are reused via preferential attachment: each existing mule's chance of being reused
    again grows with how many times it already has been. This produces a heavy-tailed account
    degree distribution — a small number of mules accumulate a disproportionate share of hops —
    which spec §23.3's realism gate requires ("account degree distribution is heavy-tailed, not
    uniform"), without needing a full graph model yet.
    """

    def __init__(self, *, new_mule_probability: float = 0.35) -> None:
        """``new_mule_probability`` is the chance of minting a fresh mule instead of reusing an
        existing one, each time a zone's pool is non-empty. Lower means heavier reuse and a
        heavier tail — an assumption, not a fitted parameter; see
        docs/ml/population-assumptions.md."""
        self._new_mule_probability = new_mule_probability
        self._account_zone: dict[str, Zone] = {}
        self._mules_by_zone: dict[str, list[AccountRef]] = {}
        self._mule_weight: dict[str, int] = {}
        self._counter = 0

    def _new_id(self, prefix: str) -> str:
        self._counter += 1
        return f"{prefix}-{self._counter:06d}"

    def zone_of(self, account: AccountRef) -> Zone | None:
        """The home zone an account was assigned at creation, if this pool created it."""
        return self._account_zone.get(account.account_id)

    def sample_victim(self, rng: Random) -> AccountRef:
        zone = sample_zone(rng)
        account = AccountRef(
            account_id=self._new_id("victim"), jurisdiction_id=zone.code
        )
        self._account_zone[account.account_id] = zone
        return account

    def sample_mule(self, rng: Random, *, near: AccountRef | None = None) -> AccountRef:
        near_zone = (
            self._account_zone.get(near.account_id) if near is not None else None
        )
        zone = sample_zone(rng, near=near_zone)
        pool = self._mules_by_zone.setdefault(zone.code, [])

        if not pool or rng.random() < self._new_mule_probability:
            account = AccountRef(
                account_id=self._new_id("mule"), jurisdiction_id=zone.code
            )
            pool.append(account)
            self._mule_weight[account.account_id] = 1
            self._account_zone[account.account_id] = zone
            return account

        weights = [self._mule_weight[a.account_id] for a in pool]
        chosen: AccountRef = rng.choices(pool, weights=weights, k=1)[0]
        self._mule_weight[chosen.account_id] += 1
        return chosen

    def degree(self, account: AccountRef) -> int:
        """How many times this mule has been sampled so far. Victims are always degree 1 (each
        victim is sampled once); only mules accumulate degree. Used by realism validation
        (issue #6) to check the heavy-tail property this class is designed to produce."""
        return self._mule_weight.get(
            account.account_id, 1 if account.account_id in self._account_zone else 0
        )
