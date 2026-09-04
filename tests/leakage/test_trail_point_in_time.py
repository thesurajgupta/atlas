"""Leakage gate 1, applied to graph traversal (master spec §19.1, §14).

The feature store's as-of joins are the headline of gate 1, but a traversal is
the easier place to leak, because a recursive walk has to re-apply the bound at
*every* level and nothing complains if a level forgets.

The realistic failure is not exotic. A bank replies to a CrPC §91 production request on day 10
about a transfer that happened on day 2. Bound the walk by ``occurred_at`` and
that hop is visible to a prediction made on day 5 — a prediction that, in the
real world, would have been made without it. Nothing errors. The recall number
just gets better, and stays wrong.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from atlas.core.enums import CashOutChannel, EdgeType
from atlas.graph.trail import TrailQuery, reconstruct_trail
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.leakage

DAY0 = datetime(2026, 5, 4, 8, 0, tzinfo=UTC)


async def _entity(session: AsyncSession) -> uuid.UUID:
    entity_id = uuid.uuid4()
    await session.execute(
        text(
            "INSERT INTO entity.canonical_entity "
            "(id, public_ref, kind, attributes, observed_at, source_system, classification) "
            "VALUES (:id, :ref, 'ACCOUNT', '{}'::jsonb, :obs, 'test', 'SENSITIVE')"
        ),
        {"id": entity_id, "ref": uuid.uuid4().hex[:16], "obs": DAY0},
    )
    return entity_id


async def _edge(
    session: AsyncSession,
    frm: uuid.UUID,
    to: uuid.UUID,
    *,
    occurred_at: datetime,
    observed_at: datetime,
    edge_type: EdgeType = EdgeType.TRANSFERRED_TO,
    channel: CashOutChannel | None = None,
) -> None:
    edge_id = uuid.uuid4()
    await session.execute(
        text(
            "INSERT INTO graph.transaction_edge "
            "(id, from_entity_id, to_entity_id, edge_type, amount, currency, occurred_at, "
            " channel, rail, observed_at, source_system, source_record_id, classification, "
            " is_synthetic) "
            "VALUES (:id, :frm, :to, CAST(:etype AS graph.edge_type), :amt, 'INR', :occ, "
            " CAST(:chan AS geo.cash_out_channel), 'IMPS', :obs, 'test', :srec, "
            " 'SENSITIVE', true)"
        ),
        {
            "id": edge_id,
            "frm": frm,
            "to": to,
            "etype": edge_type.value,
            "amt": Decimal("250000.00"),
            "occ": occurred_at,
            "chan": channel.value if channel else None,
            "obs": observed_at,
            "srec": edge_id.hex,
        },
    )


async def test_a_late_disclosure_is_invisible_to_an_earlier_as_of(
    session: AsyncSession,
) -> None:
    """The gate.

    Both hops *occurred* before the as-of. The second was only *disclosed*
    afterwards, and must not extend the trail.
    """
    victim, mule, agent = [await _entity(session) for _ in range(3)]
    await _edge(session, victim, mule, occurred_at=DAY0, observed_at=DAY0)
    await _edge(
        session,
        mule,
        agent,
        occurred_at=DAY0 + timedelta(hours=2),
        observed_at=DAY0 + timedelta(days=8),
        edge_type=EdgeType.WITHDREW_AT,
        channel=CashOutChannel.AEPS_BC,
    )

    as_of = DAY0 + timedelta(days=3)
    paths = await reconstruct_trail(
        session, TrailQuery(origin_entity_id=victim, as_of=as_of)
    )

    assert len(paths) == 1
    assert len(paths[0].hops) == 1, (
        "the walk reached a cash-out through a disclosure that had not arrived yet"
    )
    assert paths[0].terminal_entity_id == mule
    assert paths[0].reaches_cash_out is False


async def test_the_same_walk_run_later_does_see_it(session: AsyncSession) -> None:
    """The other half of the gate, and the reason the first half is not vacuous.

    A bound that hid the hop permanently would also pass the assertion above
    while being badly broken. Re-running with a later as-of proves the data is
    present and the bound is what withheld it.
    """
    victim, mule, agent = [await _entity(session) for _ in range(3)]
    await _edge(session, victim, mule, occurred_at=DAY0, observed_at=DAY0)
    await _edge(
        session,
        mule,
        agent,
        occurred_at=DAY0 + timedelta(hours=2),
        observed_at=DAY0 + timedelta(days=8),
        edge_type=EdgeType.WITHDREW_AT,
        channel=CashOutChannel.AEPS_BC,
    )

    paths = await reconstruct_trail(
        session,
        TrailQuery(origin_entity_id=victim, as_of=DAY0 + timedelta(days=30)),
    )

    assert len(paths[0].hops) == 2
    assert paths[0].reaches_cash_out is True


async def test_the_bound_applies_at_every_recursion_level(
    session: AsyncSession,
) -> None:
    """A bound applied only to the anchor is the shape this bug actually takes.

    The first hop is knowable, so an anchor-only filter lets the walk start —
    and then run to the end through hops nobody could have seen.
    """
    ids = [await _entity(session) for _ in range(5)]
    await _edge(session, ids[0], ids[1], occurred_at=DAY0, observed_at=DAY0)
    for i in range(1, 4):
        await _edge(
            session,
            ids[i],
            ids[i + 1],
            occurred_at=DAY0 + timedelta(hours=i),
            observed_at=DAY0 + timedelta(days=20),
        )

    paths = await reconstruct_trail(
        session,
        TrailQuery(origin_entity_id=ids[0], as_of=DAY0 + timedelta(days=1)),
    )

    assert len(paths[0].hops) == 1, (
        "the recursive step did not re-apply the as-of bound"
    )
