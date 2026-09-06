"""Windowed transaction aggregates (master spec §14, §19.1).

Traceability: ``INT-GRAPH-003`` — activity aggregates feeding the feature
pipeline.

These test the two bounds that `edge_activity` applies, because each one fails
silently and in a different direction. Drop the ``observed_at`` bound and a
feature is computed from a disclosure that had not arrived — a leak. Drop the
window and a velocity becomes a lifetime total wearing the name of a velocity —
not a leak, just a different number that nothing flags.

All rows are created here and synthetic
(``PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md``).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from atlas.core.enums import CashOutChannel, EdgeType
from atlas.graph.aggregates import edge_activity
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio

DAY0 = datetime(2026, 5, 4, 9, 0, tzinfo=UTC)
WEEK = timedelta(days=7)


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
    amount: str = "1000.00",
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
            "amt": Decimal(amount),
            "occ": occurred_at,
            "chan": channel.value if channel else None,
            "obs": observed_at or occurred_at,
            "srec": edge_id.hex,
        },
    )


async def test_counts_both_directions_and_sums_only_outbound(
    session: AsyncSession,
) -> None:
    """Fan-in and fan-out are different questions and must not be conflated.

    An account collecting from many victims and one splitting to many onward
    accounts are opposite shapes; a single degree count cannot tell them apart.
    """
    subject, sender, receiver = [await _entity(session) for _ in range(3)]
    await _edge(session, sender, subject, occurred_at=DAY0, amount="5000.00")
    await _edge(session, subject, receiver, occurred_at=DAY0, amount="1200.00")
    await _edge(session, subject, receiver, occurred_at=DAY0, amount="800.00")

    activity = await edge_activity(
        session, entity_ids=[subject], as_of=DAY0 + timedelta(hours=1), window=WEEK
    )
    a = activity[subject]

    assert a.in_count == 1
    assert a.out_count == 2
    # Only what the subject *sent*. Summing both directions would report a
    # throughput of 7000 for an account that moved 2000 onward.
    assert a.out_amount == Decimal("2000.00")
    assert a.distinct_in_counterparties == 1
    # Two transfers to the same account is one counterparty — that is the whole
    # point of the distinct count.
    assert a.distinct_out_counterparties == 1


async def test_an_edge_observed_after_as_of_is_not_counted(
    session: AsyncSession,
) -> None:
    """Leakage gate 1, at the aggregate (master spec §19.1).

    A bank replies on day 10 about a transfer that happened on day 2. An
    aggregate computed on day 5 must not contain it, because the answer given on
    day 5 could not have contained it. Nothing errors when this is wrong; the
    count is just larger, and stays wrong.
    """
    subject, other = await _entity(session), await _entity(session)
    await _edge(session, subject, other, occurred_at=DAY0, observed_at=DAY0)
    await _edge(
        session,
        subject,
        other,
        occurred_at=DAY0 + timedelta(days=2),
        observed_at=DAY0 + timedelta(days=10),
    )

    as_of_day5 = DAY0 + timedelta(days=5)
    early = await edge_activity(
        session, entity_ids=[subject], as_of=as_of_day5, window=timedelta(days=30)
    )
    assert early[subject].out_count == 1, "a late disclosure was counted"

    # ...and once it has arrived, the same question counts it.
    later = await edge_activity(
        session,
        entity_ids=[subject],
        as_of=DAY0 + timedelta(days=11),
        window=timedelta(days=30),
    )
    assert later[subject].out_count == 2


async def test_activity_outside_the_window_is_excluded(session: AsyncSession) -> None:
    """Otherwise a velocity is a lifetime total under a misleading name."""
    subject, other = await _entity(session), await _entity(session)
    await _edge(session, subject, other, occurred_at=DAY0 - timedelta(days=20))
    await _edge(session, subject, other, occurred_at=DAY0 - timedelta(days=1))

    week = await edge_activity(session, entity_ids=[subject], as_of=DAY0, window=WEEK)
    assert week[subject].out_count == 1

    month = await edge_activity(
        session, entity_ids=[subject], as_of=DAY0, window=timedelta(days=30)
    )
    assert month[subject].out_count == 2


async def test_the_window_lower_bound_is_exclusive(session: AsyncSession) -> None:
    """A closed lower bound puts a boundary edge in two adjacent windows.

    Velocities computed over a sliding grid would then double-count at every
    step — a bias that grows with the number of windows and looks like activity.
    """
    subject, other = await _entity(session), await _entity(session)
    await _edge(session, subject, other, occurred_at=DAY0 - WEEK)

    activity = await edge_activity(
        session, entity_ids=[subject], as_of=DAY0, window=WEEK
    )
    assert activity[subject].out_count == 0


async def test_cash_out_counts_withdrawals_terminating_at_the_entity(
    session: AsyncSession,
) -> None:
    """The endpoint's own frequency, not the account's.

    A ``WITHDREW_AT`` edge runs account → endpoint, so the endpoint is the
    entity it says something about.
    """
    mule, agent = await _entity(session), await _entity(session, "BC_AGENT")
    await _edge(
        session,
        mule,
        agent,
        occurred_at=DAY0,
        edge_type=EdgeType.WITHDREW_AT,
        channel=CashOutChannel.AEPS_BC,
    )

    activity = await edge_activity(
        session, entity_ids=[mule, agent], as_of=DAY0 + timedelta(hours=1), window=WEEK
    )
    assert activity[agent].cash_out_count == 1
    assert activity[mule].cash_out_count == 0, "the sending account is not an endpoint"


async def test_a_quiet_entity_returns_zeroes_rather_than_being_absent(
    session: AsyncSession,
) -> None:
    """ "No transactions this week" and "never heard of it" are different facts.

    Absence would let a caller collapse them, and a feature of 0.0 derived from
    the second is a value nobody ever observed.
    """
    quiet = await _entity(session)

    activity = await edge_activity(session, entity_ids=[quiet], as_of=DAY0, window=WEEK)

    assert quiet in activity
    assert activity[quiet].out_count == 0
    assert activity[quiet].out_amount == Decimal(0)


async def test_a_naive_as_of_is_rejected(session: AsyncSession) -> None:
    with pytest.raises(ValueError, match="timezone-aware"):
        await edge_activity(
            session,
            entity_ids=[uuid.uuid4()],
            as_of=datetime(2026, 5, 4, 9, 0),  # noqa: DTZ001 - naive on purpose
            window=WEEK,
        )


async def test_a_non_positive_window_is_rejected(session: AsyncSession) -> None:
    """A zero window silently returns zeroes for everything."""
    with pytest.raises(ValueError, match="window"):
        await edge_activity(
            session, entity_ids=[uuid.uuid4()], as_of=DAY0, window=timedelta(0)
        )
