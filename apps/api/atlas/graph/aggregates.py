"""Point-in-time activity aggregates over the transaction graph (spec §14, §19.1).

The feature pipeline needs counts, sums and degree ratios per entity. It may not
compute them itself: ``graph.transaction_edge`` belongs to this module, and
cross-module access goes through the owning module's service interface rather
than by reading its schema (ADR-009, CLAUDE.md). So the SQL lives here, next to
the table it reads and the indexes that serve it, and ``atlas.features`` calls a
function instead of writing a join.

Every read is bounded twice, and the two bounds do different jobs:

* ``observed_at <= as_of`` — what was *knowable*. This is the leakage bound
  (§19.1). Without it a feature computed for last Tuesday can be built from a
  bank disclosure that arrived on Friday, and every metric downstream quietly
  becomes a measurement of the future.
* ``occurred_at`` inside the window — what actually *happened*, and when. This
  is what makes a velocity a velocity rather than a lifetime total.

Dropping the first is a leak. Dropping the second is a different feature wearing
the same name. Both are silent.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from atlas.core.enums import EdgeType


@dataclass(frozen=True)
class EdgeActivity:
    """What one entity did, and had done to it, inside a window.

    Both directions are carried because they answer different questions. A mule
    account collecting from many victims has high fan-in; one splitting to many
    onward accounts has high fan-out; a layering hop has both and is the shape
    worth finding. Storing only the outbound half would make the second
    indistinguishable from the third.

    Counts are plain integers and the amount is a ``Decimal``. The amount is not
    a float here for the same reason it is not one on the wire — the column is
    ``NUMERIC(14, 2)``, and a sum that has been through binary floating point is
    no longer the sum of the rows. It becomes a float only at the point it is
    written as a feature value, which is a float column by design.
    """

    entity_id: uuid.UUID
    out_count: int
    in_count: int
    out_amount: Decimal
    distinct_out_counterparties: int
    distinct_in_counterparties: int
    #: ``WITHDREW_AT`` edges terminating at this entity — how often value left
    #: the traceable system *here*. Non-zero only for entities acting as a
    #: cash-out endpoint.
    cash_out_count: int


# `unnest` rather than `= ANY`, because the subject list is the left side of the
# join: an entity with no activity in the window must come back with zeroes
# rather than be missing. "No transactions in the last seven days" is a fact
# about an account; absence would let the caller confuse it with "we have never
# heard of this account", and those warrant different features — one is a zero,
# the other is no value at all.
#
# The window is half-open, (window_start, as_of]. A closed lower bound would put
# an edge that occurred exactly at the boundary into two adjacent windows, and a
# velocity computed over overlapping windows double-counts at every step.
_ACTIVITY_SQL = text(
    """
WITH subject AS (
    SELECT unnest(CAST(:entity_ids AS uuid[])) AS entity_id
),
windowed AS (
    SELECT from_entity_id, to_entity_id, amount, edge_type
    FROM graph.transaction_edge
    WHERE observed_at <= :as_of
      AND occurred_at <= :as_of
      AND occurred_at > :window_start
)
SELECT
    s.entity_id,
    COUNT(e.*) FILTER (WHERE e.from_entity_id = s.entity_id) AS out_count,
    COUNT(e.*) FILTER (WHERE e.to_entity_id = s.entity_id) AS in_count,
    COALESCE(
        SUM(e.amount) FILTER (WHERE e.from_entity_id = s.entity_id), 0
    ) AS out_amount,
    COUNT(DISTINCT e.to_entity_id)
        FILTER (WHERE e.from_entity_id = s.entity_id) AS distinct_out,
    COUNT(DISTINCT e.from_entity_id)
        FILTER (WHERE e.to_entity_id = s.entity_id) AS distinct_in,
    COUNT(e.*) FILTER (
        WHERE e.to_entity_id = s.entity_id
          AND e.edge_type::text = :withdrew_at
    ) AS cash_out_count
FROM subject s
LEFT JOIN windowed e
       ON e.from_entity_id = s.entity_id
       OR e.to_entity_id = s.entity_id
GROUP BY s.entity_id
"""
)


async def edge_activity(
    session: AsyncSession,
    *,
    entity_ids: Sequence[uuid.UUID],
    as_of: datetime,
    window: timedelta,
) -> dict[uuid.UUID, EdgeActivity]:
    """Windowed transaction activity for each entity, as knowable at ``as_of``.

    ``as_of`` is required and must be timezone-aware, matching every other
    point-in-time read in the system. A default would make the bound a formality
    every caller satisfies without meaning to; a naive value denotes different
    instants in different places, and guessing produces a window wrong by hours.

    Every requested entity appears in the result, with zeroes when it did
    nothing. See the SQL comment for why absence would be the wrong answer.
    """
    if as_of.tzinfo is None:
        raise ValueError("as_of must be timezone-aware; naive datetimes are ambiguous")
    if window <= timedelta(0):
        raise ValueError("window must be positive")
    if not entity_ids:
        return {}

    result = await session.execute(
        _ACTIVITY_SQL,
        {
            "entity_ids": [str(entity_id) for entity_id in entity_ids],
            "as_of": as_of,
            "window_start": as_of - window,
            "withdrew_at": EdgeType.WITHDREW_AT.value,
        },
    )

    activity: dict[uuid.UUID, EdgeActivity] = {}
    for row in result:
        m = row._mapping
        activity[m["entity_id"]] = EdgeActivity(
            entity_id=m["entity_id"],
            out_count=int(m["out_count"]),
            in_count=int(m["in_count"]),
            out_amount=Decimal(m["out_amount"]),
            distinct_out_counterparties=int(m["distinct_out"]),
            distinct_in_counterparties=int(m["distinct_in"]),
            cash_out_count=int(m["cash_out_count"]),
        )
    return activity


@dataclass(frozen=True)
class CashOutOccurrence:
    """One withdrawal, reduced to where it landed and when.

    The *entity* rather than the endpoint: this module knows canonical entity
    ids and nothing about geography. Turning one into a cell needs
    ``atlas.entity`` and ``atlas.geo``, and composing the three is
    ``atlas.predict``'s job — it sits above all of them, which is the only place
    the join is allowed to happen (ADR-009).
    """

    entity_id: uuid.UUID
    occurred_at: datetime


_CASH_OUT_SQL = text(
    """
SELECT to_entity_id, occurred_at
FROM graph.transaction_edge
WHERE edge_type::text = :withdrew_at
  AND observed_at <= :as_of
  AND occurred_at <= :as_of
  AND occurred_at > :since
ORDER BY occurred_at
"""
)


async def cash_out_occurrences(
    session: AsyncSession,
    *,
    as_of: datetime,
    since: datetime,
) -> list[CashOutOccurrence]:
    """Every withdrawal in ``(since, as_of]`` that was knowable at ``as_of``.

    Ordered by ``occurred_at`` ascending, which the self-exciting baseline
    relies on: it walks a cell's history and stops at the first event later than
    the instant being scored. Sorting downstream would work and would put the
    guarantee somewhere nobody looking at the query can see it.

    Both bounds are required and neither has a default. ``since`` in particular:
    an unbounded lower edge silently turns a training window into the entire
    history of the system, which changes every rate the baseline estimates while
    raising nothing.
    """
    if as_of.tzinfo is None or since.tzinfo is None:
        raise ValueError("as_of and since must be timezone-aware")
    if since >= as_of:
        raise ValueError("since must be earlier than as_of")

    result = await session.execute(
        _CASH_OUT_SQL,
        {"as_of": as_of, "since": since, "withdrew_at": EdgeType.WITHDREW_AT.value},
    )
    return [
        CashOutOccurrence(
            entity_id=row._mapping["to_entity_id"],
            occurred_at=row._mapping["occurred_at"],
        )
        for row in result
    ]
