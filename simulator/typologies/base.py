"""Fraud typology generators — the shared engine (master spec §9, §23; ADR-005).

One generator per NCRP-recognisable fraud category. Each encodes assumptions about victim
behaviour, layering depth, amount distribution, inter-hop delay, preferred channels and
geographic dispersion — documented in ``docs/ml/typology-assumptions.md``, never invented and
presented as fact (spec §9).

This module holds everything the seven concrete generators share, so each one stays a short,
readable profile plus (where needed) a topology override — not a copy-pasted state machine.

**Isolation.** This whole ``simulator`` package is unimportable from ``atlas.*`` — see
``simulator/__init__.py``. ``FraudScenario`` carries the hidden ground truth (§23.2): the actual
fraud path and the actual cash-out endpoint and timestamp. Nothing under ``atlas.features`` or
``atlas.predict`` may ever see it directly; the feature pipeline reads only what the ingestion
connectors would plausibly observe.

**Decoupling from population data (issue #4).** A typology generator needs accounts and
endpoints, but issue #5 has no dependency on issue #4 landing first (per the team-roles
kickoff: "It has no dependency on anyone else's work"). ``AccountPool`` and ``EndpointRegistry``
below are narrow protocols, not concrete imports — the population/geography generator will
provide the real implementation; tests here use a minimal stub. This is a deliberate ADR-005-style
decision, recorded here rather than silently assumed: the seam is the protocol, not a shared class
hierarchy.
"""

from __future__ import annotations

import uuid
from abc import ABC
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum
from random import Random
from typing import Protocol

from atlas.core.enums import CashOutChannel, FraudTypology

_PAISA = Decimal("0.01")


class GeographicDispersion(StrEnum):
    """How far cash-out lands from the mule network's home base (spec §9 cash-out column)."""

    LOCAL = "LOCAL"
    REGIONAL = "REGIONAL"
    MULTI_CITY = "MULTI_CITY"
    DISPERSED = "DISPERSED"


@dataclass(frozen=True)
class AmountCurve:
    """Amount distribution for one hop or debit.

    A bounded lognormal in INR. ``mean_log``/``sigma_log`` parameterise the lognormal;
    ``floor``/``ceiling`` clip it so a rare tail draw can't produce an absurd amount. These are
    assumptions (``docs/ml/typology-assumptions.md``), not fitted parameters, until calibrated
    against published aggregates.

    ``sample`` emits a :class:`~decimal.Decimal` quantised to paise, not a ``float`` — the
    ingestion quality gate (#23) rejects both raw floats and anything with more than two decimal
    places, and a binary float cannot represent an exact rupee amount to begin with. Sampling in
    float internally is fine; what's *emitted* must be exact.
    """

    mean_log: float
    sigma_log: float
    floor: float
    ceiling: float

    def sample(self, rng: Random) -> Decimal:
        value = rng.lognormvariate(self.mean_log, self.sigma_log)
        bounded = min(max(value, self.floor), self.ceiling)
        return Decimal(str(bounded)).quantize(_PAISA, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class TypologyProfile:
    """The assumption set that makes one typology behave differently from another (spec §9).

    ``docs/ml/typology-assumptions.md`` explains the rationale for each field; this dataclass is
    the source of truth for the numbers. Change one, update the doc in the same commit.
    """

    typology: FraudTypology
    layering_depth: tuple[int, int]
    inter_hop_delay_minutes: tuple[float, float]
    hop_amount: AmountCurve
    preferred_channels: tuple[tuple[CashOutChannel, float], ...]
    dispersion: GeographicDispersion
    fan_in: bool
    victim_behaviour: str

    def sample_channel(self, rng: Random) -> CashOutChannel:
        channels: list[CashOutChannel] = [
            channel for channel, _weight in self.preferred_channels
        ]
        weights: list[float] = [weight for _channel, weight in self.preferred_channels]
        chosen: CashOutChannel = rng.choices(channels, weights=weights, k=1)[0]
        return chosen


@dataclass(frozen=True)
class AccountRef:
    """A reference to an account. Opaque outside the population layer that created it."""

    account_id: str
    jurisdiction_id: str | None = None


@dataclass(frozen=True)
class EndpointRef:
    """A reference to a cash-out endpoint. Opaque outside the geography layer that created it."""

    endpoint_id: str
    channel: CashOutChannel
    jurisdiction_id: str | None = None


class AccountPool(Protocol):
    """What a typology generator needs from population data (spec §23.1, issue #4).

    A protocol rather than a concrete dependency — see the module docstring on decoupling.
    """

    def sample_victim(self, rng: Random) -> AccountRef: ...

    def sample_mule(
        self, rng: Random, *, near: AccountRef | None = None
    ) -> AccountRef: ...


class EndpointRegistry(Protocol):
    """What a typology generator needs from geography/endpoint data (spec §23.1, issue #4)."""

    def sample_endpoint(
        self, rng: Random, channel: CashOutChannel, *, near: AccountRef | None = None
    ) -> EndpointRef: ...


@dataclass(frozen=True)
class LayeringHop:
    """One transfer in the money trail. Ordinary domain data — not hidden ground truth."""

    from_account: AccountRef
    to_account: AccountRef
    amount: Decimal
    occurred_at: datetime


@dataclass(frozen=True)
class CashOutEvent:
    """Hidden ground truth: what actually happened at the end of the chain (spec §23.2).

    Lives only in ``simulator.truth`` once persisted. Nothing under ``atlas.*`` may read this —
    the prediction system's job is to guess it, not to see it.
    """

    account: AccountRef
    endpoint: EndpointRef
    channel: CashOutChannel
    amount: Decimal
    occurred_at: datetime


@dataclass(frozen=True)
class FraudScenario:
    """One simulated fraud case: the full hidden trail plus its typology label (spec §23.1–23.2).

    ``scenario_id`` is the join key to the (separately generated) complaint and to
    ``simulator.truth``. ``hops`` and ``cash_out`` are ground truth — never readable from
    ``atlas.features``/``atlas.predict`` (leakage gate 1, ``simulator/__init__.py``).
    """

    scenario_id: uuid.UUID
    typology: FraudTypology
    victim: AccountRef
    fraud_initiated_at: datetime
    hops: tuple[LayeringHop, ...]
    cash_out: CashOutEvent


class TypologyGenerator(ABC):
    """One generator per NCRP fraud category (spec §9, §23.1).

    ``generate`` is templated here so the seven typologies stay comparable: sample a victim,
    build the layering hops via :meth:`_build_hops` (overridable), then sample a cash-out
    channel and endpoint from the profile. Subclasses normally only need to set ``profile``;
    override ``_build_hops`` only when a linear chain can't express the typology's topology
    (see ``LoanAppExtortionGenerator``).
    """

    profile: TypologyProfile

    @property
    def typology(self) -> FraudTypology:
        return self.profile.typology

    def generate(
        self,
        rng: Random,
        accounts: AccountPool,
        endpoints: EndpointRegistry,
        *,
        fraud_initiated_at: datetime,
    ) -> FraudScenario:
        """Produce one fraud scenario, deterministic for a given ``rng`` state (ADR-005: fixed,
        committed seeds make scenarios reproducible bit-for-bit)."""
        victim = accounts.sample_victim(rng)
        hops, cash_out_source, clock = self._build_hops(
            rng, accounts, victim, fraud_initiated_at
        )

        channel = self.profile.sample_channel(rng)
        endpoint = endpoints.sample_endpoint(rng, channel, near=cash_out_source)
        clock = clock + timedelta(
            minutes=rng.uniform(*self.profile.inter_hop_delay_minutes)
        )
        cash_out_amount = (
            hops[-1].amount if hops else self.profile.hop_amount.sample(rng)
        )

        return FraudScenario(
            scenario_id=uuid.uuid4(),
            typology=self.typology,
            victim=victim,
            fraud_initiated_at=fraud_initiated_at,
            hops=tuple(hops),
            cash_out=CashOutEvent(
                account=cash_out_source,
                endpoint=endpoint,
                channel=channel,
                amount=cash_out_amount,
                occurred_at=clock,
            ),
        )

    def _build_hops(
        self,
        rng: Random,
        accounts: AccountPool,
        victim: AccountRef,
        fraud_initiated_at: datetime,
    ) -> tuple[list[LayeringHop], AccountRef, datetime]:
        """Default topology: a linear chain of ``layering_depth`` mule hops.

        Returns the hop list, the account cash-out is drawn from, and the clock after the last
        hop. Override when the profile's ``layering_depth`` doesn't mean "chain length" — see
        ``LoanAppExtortionGenerator``, where it means repeated-debit count instead.
        """
        depth = rng.randint(*self.profile.layering_depth)
        hops: list[LayeringHop] = []
        clock = fraud_initiated_at
        current = victim
        for _ in range(depth):
            mule = accounts.sample_mule(rng, near=current)
            clock = clock + timedelta(
                minutes=rng.uniform(*self.profile.inter_hop_delay_minutes)
            )
            hops.append(
                LayeringHop(
                    from_account=current,
                    to_account=mule,
                    amount=self.profile.hop_amount.sample(rng),
                    occurred_at=clock,
                )
            )
            current = mule
        return hops, current, clock
