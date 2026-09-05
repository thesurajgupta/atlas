"""Money-trail reconstruction against a real database (master spec §14).

Traceability: ``INT-GRAPH-001`` — "analyse financial data / money trail".

These cannot be unit tests. The properties under test — time-respecting
recursion, cycle termination, the point-in-time bound — live in a recursive CTE,
so testing them anywhere but PostgreSQL would test a mock of the thing that
matters.
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

pytestmark = pytest.mark.asyncio

DAY0 = datetime(2026, 4, 6, 9, 0, tzinfo=UTC)
FAR_FUTURE = datetime(2026, 12, 31, tzinfo=UTC)


async def _entity(session: AsyncSession, kind: str = "ACCOUNT") -> uuid.UUID:
    entity_id = uuid.uuid4()
    await session.execute(
        text(
            "INSERT INTO entity.canonical_entity "
            "(id, public_ref, kind, attributes, observed_at, source_system, classification) "
            "VALUES (:id, :ref, :kind, '{}'::jsonb, :obs, 'test', 'SENSITIVE')"
        ),
        {"id": entity_id, "ref": uuid.uuid4().hex[:16], "kind": kind, "obs": DAY0},
    )
    return entity_id


async def _edge(
    session: AsyncSession,
    frm: uuid.UUID,
    to: uuid.UUID,
    *,
    occurred_at: datetime,
    observed_at: datetime | None = None,
    amount: str = "100000.00",
    edge_type: EdgeType = EdgeType.TRANSFERRED_TO,
    channel: CashOutChannel | None = None,
) -> uuid.UUID:
    edge_id = uuid.uuid4()
    await session.execute(
        text(
            "INSERT INTO graph.transaction_edge "
            "(id, from_entity_id, to_entity_id, edge_type, amount, currency, occurred_at, "
            " channel, rail, observed_at, source_system, source_record_id, classification, "
            " is_synthetic) "
            "VALUES (:id, :frm, :to, CAST(:etype AS graph.edge_type), :amt, 'INR', :occ, "
            " CAST(:chan AS geo.cash_out_channel), 'IMPS', :obs, 'test', :srec, 'SENSITIVE', true)"
        ),
        {
            "id": edge_id,
            "frm": frm,
            "to": to,
            "etype": edge_type.value,
            "amt": Decimal(amount),
            "occ": occurred_at,
            "chan": channel.value if channel else None,
            "obs": observed_at or occurred_at,
            "srec": edge_id.hex,
        },
    )
    return edge_id


async def test_a_four_hop_chain_to_an_aeps_cash_out_is_recovered(
    session: AsyncSession,
) -> None:
    """The shape this project exists to reconstruct."""
    victim, mule1, mule2, agent = [await _entity(session) for _ in range(4)]
    await _edge(session, victim, mule1, occurred_at=DAY0, amount="500000.00")
    await _edge(session, mule1, mule2, occurred_at=DAY0 + timedelta(minutes=40))
    await _edge(
        session,
        mule2,
        agent,
        occurred_at=DAY0 + timedelta(hours=3),
        amount="49500.00",
        edge_type=EdgeType.WITHDREW_AT,
        channel=CashOutChannel.AEPS_BC,
    )

    paths = await reconstruct_trail(
        session, TrailQuery(origin_entity_id=victim, as_of=FAR_FUTURE)
    )

    assert len(paths) == 1
    path = paths[0]
    assert len(path.hops) == 3
    assert path.reaches_cash_out
    assert path.terminal_entity_id == agent
    assert path.hops[-1].channel is CashOutChannel.AEPS_BC
    assert path.elapsed == timedelta(hours=3)
    assert path.truncated is False


async def test_a_hop_that_happened_earlier_is_not_a_continuation(
    session: AsyncSession,
) -> None:
    """The defect this whole module exists to prevent.

    B sent money to C on Monday. A sent money to B on Wednesday. A, B and C are
    genuinely connected, and a plain graph traversal returns A → B → C — a
    coherent, plausible trail along which the money could not possibly have
    travelled, because it left B two days before it arrived.
    """
    a, b, c = [await _entity(session) for _ in range(3)]
    await _edge(session, b, c, occurred_at=DAY0)
    await _edge(session, a, b, occurred_at=DAY0 + timedelta(days=2))

    paths = await reconstruct_trail(
        session, TrailQuery(origin_entity_id=a, as_of=FAR_FUTURE)
    )

    assert len(paths) == 1
    assert paths[0].terminal_entity_id == b, "the walk must stop at B"
    assert c not in {hop.to_entity_id for hop in paths[0].hops}


async def test_simultaneous_hops_are_allowed(session: AsyncSession) -> None:
    """Automated layering moves money through several accounts within a second.

    Requiring each hop to be strictly later would silently drop exactly the
    fastest, most professional chains — the ones that matter most.
    """
    a, b, c = [await _entity(session) for _ in range(3)]
    await _edge(session, a, b, occurred_at=DAY0)
    await _edge(session, b, c, occurred_at=DAY0)

    paths = await reconstruct_trail(
        session, TrailQuery(origin_entity_id=a, as_of=FAR_FUTURE)
    )

    assert len(paths[0].hops) == 2


async def test_a_cycle_terminates_and_does_not_revisit(session: AsyncSession) -> None:
    """Mule networks cycle money back through controlled accounts.

    The depth cap is what bounds the search. This guard is what stops the walk
    from re-entering an entity it already passed through — verified by removing
    it, which makes the traversal return A → B → C → A: a report that the money
    returned to the victim's own account, which it did not.
    """
    a, b, c = [await _entity(session) for _ in range(3)]
    await _edge(session, a, b, occurred_at=DAY0)
    await _edge(session, b, c, occurred_at=DAY0 + timedelta(hours=1))
    await _edge(session, c, a, occurred_at=DAY0 + timedelta(hours=2))

    paths = await reconstruct_trail(
        session, TrailQuery(origin_entity_id=a, as_of=FAR_FUTURE)
    )

    assert len(paths) == 1
    visited = [paths[0].hops[0].from_entity_id] + [
        h.to_entity_id for h in paths[0].hops
    ]
    assert len(visited) == len(set(visited)), (
        "an entity must not appear twice on one path"
    )


async def test_non_money_edges_are_never_followed(session: AsyncSession) -> None:
    """SHARES_DEVICE is strong intelligence and a terrible trail hop.

    Following it produces a money trail along which no money travelled.
    """
    a, b, c = [await _entity(session) for _ in range(3)]
    await _edge(session, a, b, occurred_at=DAY0)
    await _edge(
        session,
        b,
        c,
        occurred_at=DAY0 + timedelta(hours=1),
        edge_type=EdgeType.SHARES_DEVICE,
    )

    paths = await reconstruct_trail(
        session, TrailQuery(origin_entity_id=a, as_of=FAR_FUTURE)
    )

    assert len(paths[0].hops) == 1
    assert paths[0].terminal_entity_id == b


async def test_a_long_dwell_ends_the_walk(session: AsyncSession) -> None:
    """Money that sits for a month and moves again is usually not the same money."""
    a, b, c = [await _entity(session) for _ in range(3)]
    await _edge(session, a, b, occurred_at=DAY0)
    await _edge(session, b, c, occurred_at=DAY0 + timedelta(days=30))

    paths = await reconstruct_trail(
        session,
        TrailQuery(
            origin_entity_id=a, as_of=FAR_FUTURE, max_hop_gap=timedelta(days=14)
        ),
    )
    assert len(paths[0].hops) == 1

    # ...and widening the window deliberately finds it again. The bound is a
    # search parameter the investigator controls, not a hidden verdict.
    widened = await reconstruct_trail(
        session,
        TrailQuery(
            origin_entity_id=a, as_of=FAR_FUTURE, max_hop_gap=timedelta(days=60)
        ),
    )
    assert len(widened[0].hops) == 2


async def test_depth_cap_marks_the_path_truncated(session: AsyncSession) -> None:
    ids = [await _entity(session) for _ in range(5)]
    for i in range(4):
        await _edge(session, ids[i], ids[i + 1], occurred_at=DAY0 + timedelta(hours=i))

    paths = await reconstruct_trail(
        session, TrailQuery(origin_entity_id=ids[0], as_of=FAR_FUTURE, max_depth=2)
    )

    assert len(paths[0].hops) == 2
    assert paths[0].truncated is True


async def test_max_depth_below_one_is_rejected(session: AsyncSession) -> None:
    with pytest.raises(ValueError, match="max_depth"):
        await reconstruct_trail(
            session,
            TrailQuery(origin_entity_id=uuid.uuid4(), as_of=FAR_FUTURE, max_depth=0),
        )


async def test_the_feature_role_cannot_write_to_the_graph(
    session: AsyncSession,
) -> None:
    """Grants are inherited from ALTER DEFAULT PRIVILEGES, not restated per table.

    That inheritance only holds because migrations run as the role that issued
    the ALTER — a fact worth asserting rather than reasoning about, since the
    failure mode is a feature pipeline that can quietly rewrite its own inputs.
    """
    result = await session.execute(
        text(
            "SELECT has_table_privilege('atlas_features','graph.transaction_edge','SELECT') "
            "AS can_read, "
            "has_table_privilege('atlas_features','graph.transaction_edge','INSERT') AS can_write"
        )
    )
    row = result.one()
    assert row.can_read is True
    assert row.can_write is False
