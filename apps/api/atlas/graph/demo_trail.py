"""Materialise a transaction chain for one complaint (development only).

## Why this exists

A complaint arrives saying ₹7,00,000 was defrauded. ATLAS then reconstructs
where that money went — from transaction records a bank supplies. There is no
bank feed yet (#65), so before this the walkthrough attached an arbitrary
pre-ingested simulator scenario to whatever complaint had just been filed. The
amounts could not match, because nothing connected the two: a ₹7,00,000
complaint would show a chain carrying entirely different sums.

This builds the chain **from the complaint**, so the money in the trail is the
money the complaint reported.

## What conservation means here, precisely

The victim's outflows sum to exactly the reported amount. After that each mule
keeps a cut and forwards the rest, which is what layering actually looks like —
so every later layer carries less, and the amount reaching terminal accounts is
below what was defrauded.

The sum of *all* hops is therefore larger than the complaint amount, and that is
arithmetically correct rather than a bug: money that moves three times is
counted three times in that sum. It is why the UI reports "entered the chain"
and "reached terminals" separately and never labels a total of every hop as the
amount stolen.

## Not a substitute for ingestion

The real path is `atlas.ingest` behind the quality gates. This is a development
stand-in with the same *shape*, so the code downstream of it — trail
reconstruction, features, ranking — is exercised against the same contract it
will see in production.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from random import Random

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

#: Fixed namespace, so a complaint reference always maps to the same entities.
#: Re-running a demo for the same case then rebuilds the identical chain rather
#: than minting a second one beside it.
ENTITY_NAMESPACE = uuid.UUID("a71a5000-0000-4000-8000-000000000002")

#: Marks every row this module writes, so a rebuild can remove its own previous
#: attempt without touching ingested data.
DEMO_BATCH = uuid.UUID("a71a5000-0000-4000-8000-0000000000d1")

#: What a mule keeps before forwarding. A cut is why the amount reaching a
#: cash-out is smaller than the amount defrauded, and modelling it is the
#: difference between a plausible chain and one that conserves value like a
#: physics problem.
RETAINED_FRACTION = Decimal("0.12")

PAISA = Decimal("0.01")


def entity_id(case_ref: str, role: str) -> uuid.UUID:
    return uuid.uuid5(ENTITY_NAMESPACE, f"{case_ref}:{role}")


@dataclass(frozen=True)
class BuiltTrail:
    origin_entity_id: uuid.UUID
    hops: int
    accounts: int
    entered: Decimal
    reached_terminals: Decimal


def _q(value: Decimal) -> Decimal:
    return value.quantize(PAISA, rounding=ROUND_HALF_UP)


async def build_demo_trail(
    session: AsyncSession,
    *,
    case_ref: str,
    amount: Decimal,
    fraud_initiated_at: datetime,
    seed: int | None = None,
) -> BuiltTrail:
    """Create a layered chain carrying ``amount`` away from a fresh victim.

    Deterministic in ``case_ref`` unless ``seed`` is given, so the same case
    produces the same chain on a re-run — a judge asking to see it twice sees
    the same accounts and the same figures.
    """
    # `Random`, not `secrets`: this must be *reproducible*, which is the
    # opposite of what a cryptographic generator gives. Nothing here is a
    # secret — it is the split ratio of a synthetic chain.
    rng = Random(  # noqa: S311 — reproducibility is the requirement, not entropy
        seed if seed is not None else hash(case_ref) & 0xFFFFFFFF
    )

    victim = entity_id(case_ref, "victim")
    # Two first-hop mules, so the split is visible without the chain becoming a
    # wall of nodes. Their inflows sum to exactly the reported amount.
    layer1 = [entity_id(case_ref, "mule-a"), entity_id(case_ref, "mule-b")]
    layer2 = [entity_id(case_ref, "mule-c"), entity_id(case_ref, "mule-d")]
    terminals = [entity_id(case_ref, "terminal-a"), entity_id(case_ref, "terminal-b")]
    everyone = [victim, *layer1, *layer2, *terminals]

    # Remove this module's previous attempt for this case only.
    await session.execute(
        text(
            "DELETE FROM graph.transaction_edge "
            "WHERE ingestion_batch_id = :b AND source_record_id LIKE :p"
        ),
        {"b": DEMO_BATCH, "p": f"{case_ref}:%"},
    )

    for index, node in enumerate(everyone):
        await session.execute(
            text(
                "INSERT INTO entity.canonical_entity "
                "(id, public_ref, kind, attributes, observed_at, source_system, "
                " source_record_id, ingestion_batch_id, classification, is_synthetic) "
                "VALUES (:id, :ref, 'ACCOUNT', '{}'::jsonb, :obs, 'demo_trail', "
                " :ref, :batch, 'SENSITIVE', true) "
                "ON CONFLICT (id) DO NOTHING"
            ),
            {
                "id": node,
                "ref": f"{case_ref}:acct-{index}",
                "obs": fraud_initiated_at,
                "batch": DEMO_BATCH,
            },
        )

    clock = fraud_initiated_at
    hops = 0

    async def transfer(src: uuid.UUID, dst: uuid.UUID, value: Decimal, label: str) -> None:
        nonlocal clock, hops
        clock = clock + timedelta(minutes=rng.randint(3, 14))
        await session.execute(
            text(
                "INSERT INTO graph.transaction_edge "
                "(id, from_entity_id, to_entity_id, edge_type, amount, currency, "
                " occurred_at, observed_at, source_system, source_record_id, "
                " ingestion_batch_id, classification, is_synthetic) "
                "VALUES (:id, :src, :dst, CAST('TRANSFERRED_TO' AS graph.edge_type), "
                " :amt, 'INR', :occ, :occ, 'demo_trail', :rec, :batch, "
                " 'SENSITIVE', true)"
            ),
            {
                "id": uuid.uuid4(),
                "src": src,
                "dst": dst,
                "amt": value,
                "occ": clock,
                "rec": f"{case_ref}:{label}",
                "batch": DEMO_BATCH,
            },
        )
        hops += 1

    # Layer 1 — the split. These two sum to the reported amount exactly: the
    # second is the remainder, not an independent draw, so rounding cannot make
    # the chain carry more than was defrauded.
    first_share = _q(amount * Decimal(rng.uniform(0.52, 0.68)))
    shares = [first_share, _q(amount - first_share)]
    for i, (mule, share) in enumerate(zip(layer1, shares, strict=True)):
        await transfer(victim, mule, share, f"h1-{i}")

    # Layer 2 — each mule keeps a cut and forwards the rest.
    forwarded: list[Decimal] = []
    for i, (mule, received) in enumerate(zip(layer1, shares, strict=True)):
        onward = _q(received * (Decimal(1) - RETAINED_FRACTION))
        await transfer(mule, layer2[i], onward, f"h2-{i}")
        forwarded.append(onward)

    # Layer 3 — the terminal accounts a cash-out would be drawn from.
    reached = Decimal("0.00")
    for i, (mule, received) in enumerate(zip(layer2, forwarded, strict=True)):
        onward = _q(received * (Decimal(1) - RETAINED_FRACTION))
        await transfer(mule, terminals[i], onward, f"h3-{i}")
        reached += onward

    await session.flush()
    return BuiltTrail(
        origin_entity_id=victim,
        hops=hops,
        accounts=len(everyone),
        entered=_q(amount),
        reached_terminals=_q(reached),
    )
