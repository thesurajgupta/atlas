"""Time-respecting money-trail reconstruction (master spec §14, §14.2).

A money trail is not "the set of accounts reachable from the victim's account".
Reachability is a property of a graph; a trail is a claim about physics. Three
constraints separate the two, and dropping any of them produces output that
looks like an investigation and is not one:

**1. Hops must respect time.** If ₹2,00,000 left account B for account C on
Tuesday, and arrived at B from account A on Thursday, then A → B → C is not a
path the money took. A plain traversal returns it anyway, because A, B and C are
genuinely connected. This is the most common defect in graph-based financial
tooling and the easiest to miss, because the output is not obviously wrong — it
is a coherent, plausible, false trail. Enforced by ``occurred_at`` monotonicity
in the recursive step.

**2. Hops must respect what was knowable.** Bounding by ``observed_at`` is what
stops a reconstruction from walking through a bank disclosure that had not
arrived yet. Without it, any feature derived from trail shape leaks
(master spec §19, leakage gate 1).

**3. Only value-moving edges may be followed.** ``SHARES_DEVICE`` is strong
intelligence and a terrible hop: following it yields a "money trail" along which
no money travelled. ``EdgeType.moves_money`` is the filter.

What this module deliberately does **not** produce is a confidence score. See
:class:`TrailPath`.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import Row, bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from atlas.core.enums import CashOutChannel, EdgeType

# Layering depth is typology-dependent — investment scams layer deeper than UPI
# collect fraud — so this is a ceiling, not a model of criminal behaviour. Six
# covers the observed depth of every typology profile currently generated, with
# headroom. Raising it is cheap; the cost is fan-out, which the row cap bounds.
DEFAULT_MAX_DEPTH = 6

# Money that sits still for two weeks and then moves is usually not the same
# money — it is an account being reused. This is a *heuristic bound on search*,
# not a finding: widening it finds more, and finds more noise. Stated as a
# parameter so an investigator can widen it deliberately rather than discovering
# that the tool silently chose for them.
DEFAULT_MAX_HOP_GAP = timedelta(days=14)

# Fan-out, not depth, is what makes this query dangerous. One popular cash-out
# endpoint can carry tens of thousands of edges, and depth 6 over it is not a
# query anybody wants to run on a production replica. The cap is applied inside
# the CTE so the database stops early rather than materialising and discarding.
DEFAULT_MAX_ROWS = 20_000


@dataclass(frozen=True)
class TrailHop:
    """One edge on a reconstructed path."""

    edge_id: uuid.UUID
    from_entity_id: uuid.UUID
    to_entity_id: uuid.UUID
    edge_type: EdgeType
    amount: Decimal
    occurred_at: datetime
    channel: CashOutChannel | None
    rail: str | None
    depth: int


@dataclass(frozen=True)
class TrailPath:
    """A reconstructed path, presented as a hypothesis with its evidence.

    There is no ``confidence`` field, and its absence is deliberate. The spec
    asks every path to carry one (§14.2), and it will — once there is labelled
    ground truth to calibrate against. Until then any number here would be a
    weighted sum of hand-chosen constants, and rendering that as "confidence:
    0.82" in an investigator's UI would be a claim the system cannot support
    (CLAUDE.md rule 4). An uncalibrated number that looks calibrated is worse
    than no number, because it cannot be argued with.

    What is exposed instead are the facts a calibration would eventually be
    built from — depth, dwell time, retained amount — each of which an
    investigator can weigh directly.
    """

    hops: tuple[TrailHop, ...]
    truncated: bool

    @property
    def origin_entity_id(self) -> uuid.UUID:
        return self.hops[0].from_entity_id

    @property
    def terminal_entity_id(self) -> uuid.UUID:
        return self.hops[-1].to_entity_id

    @property
    def reaches_cash_out(self) -> bool:
        """Whether the path ends in value leaving the traceable system."""
        return self.hops[-1].edge_type is EdgeType.WITHDREW_AT

    @property
    def elapsed(self) -> timedelta:
        """Wall-clock time from the first hop to the last."""
        return self.hops[-1].occurred_at - self.hops[0].occurred_at

    @property
    def longest_dwell(self) -> timedelta:
        """The longest a sum sat still between hops.

        A long dwell is the signal that the path may have changed hands rather
        than continued — the single most useful fact for judging a trail by eye.
        """
        if len(self.hops) < 2:
            return timedelta(0)
        return max(
            later.occurred_at - earlier.occurred_at
            for earlier, later in zip(self.hops, self.hops[1:], strict=False)
        )

    @property
    def retained_fraction(self) -> Decimal:
        """Final hop amount as a fraction of the first.

        Layering splits sums, so this is normally well under 1. A value near or
        above 1 at depth means the sum travelled intact, which is characteristic
        of a mule chain moving a single victim's money to a single cash-out.
        """
        if self.hops[0].amount == 0:
            return Decimal(0)
        return self.hops[-1].amount / self.hops[0].amount


@dataclass(frozen=True)
class TrailQuery:
    """Parameters of a reconstruction.

    ``as_of`` has no default on purpose. Defaulting it to "now" is how a
    point-in-time bound turns into a formality that every caller satisfies
    without meaning to — and the one caller that needed a historical bound gets
    live data and a silently leaking feature.
    """

    origin_entity_id: uuid.UUID
    as_of: datetime
    not_before: datetime | None = None
    max_depth: int = DEFAULT_MAX_DEPTH
    max_hop_gap: timedelta | None = DEFAULT_MAX_HOP_GAP
    max_rows: int = DEFAULT_MAX_ROWS
    min_amount: Decimal | None = None


_MONEY_EDGE_TYPES = sorted(t.value for t in EdgeType if t.moves_money)


# Casts are written ``CAST(:p AS t)`` and never ``:p::t``. SQLAlchemy's text()
# bind-param scanner refuses to match a name followed by a colon, so ``:p::t``
# silently produces *no* bind parameter at all — no error at construction, just
# a confusing syntax error at execution time. Verified rather than assumed:
# ``text(':x::numeric')._bindparams`` is empty.
#
# ``visited`` carries the entities already on this path so a cycle cannot
# restart the walk. Mule networks routinely cycle money back through a
# controlled account, so this is a live case rather than a defensive nicety.
#
# It is ``max_depth`` that guarantees termination, not this guard — removing the
# guard and re-running the cycle test showed the walk still ends, but returns
# A → B → C → A. That is worse than slow: it reports to an investigator that the
# money came back to the victim's own account, which never happened. The guard
# exists to prevent a false finding, and the depth cap to bound the search.
#
# The row cap lives inside the CTE. Applying it to the outer SELECT would let
# the database explore the entire fan-out first and discard the excess after
# paying for it.
_TRAIL_SQL = text(
    """
WITH RECURSIVE trail AS (
    SELECT
        e.id            AS edge_id,
        e.from_entity_id,
        e.to_entity_id,
        e.edge_type::text AS edge_type,
        e.amount,
        e.occurred_at,
        e.channel::text AS channel,
        e.rail,
        1               AS depth,
        ARRAY[e.from_entity_id, e.to_entity_id] AS visited,
        ARRAY[e.id]     AS edge_path
    FROM graph.transaction_edge e
    WHERE e.from_entity_id = :origin
      AND e.observed_at <= :as_of
      AND e.occurred_at <= :as_of
      AND (
            CAST(:not_before AS timestamptz) IS NULL
            OR e.occurred_at >= CAST(:not_before AS timestamptz)
          )
      AND (
            CAST(:min_amount AS numeric) IS NULL
            OR e.amount >= CAST(:min_amount AS numeric)
          )
      AND e.edge_type::text IN :money_edges

    UNION ALL

    SELECT
        n.id,
        n.from_entity_id,
        n.to_entity_id,
        n.edge_type::text,
        n.amount,
        n.occurred_at,
        n.channel::text,
        n.rail,
        t.depth + 1,
        t.visited || n.to_entity_id,
        t.edge_path || n.id
    FROM graph.transaction_edge n
    JOIN trail t ON n.from_entity_id = t.to_entity_id
    WHERE t.depth < :max_depth
      AND n.observed_at <= :as_of
      AND n.occurred_at <= :as_of
      -- The constraint that makes this a trail and not a reachability set.
      AND n.occurred_at >= t.occurred_at
      AND (
            CAST(:max_hop_gap AS interval) IS NULL
            OR n.occurred_at - t.occurred_at <= CAST(:max_hop_gap AS interval)
          )
      AND (
            CAST(:min_amount AS numeric) IS NULL
            OR n.amount >= CAST(:min_amount AS numeric)
          )
      AND NOT (n.to_entity_id = ANY(t.visited))
      AND n.edge_type::text IN :money_edges
)
SELECT edge_id, from_entity_id, to_entity_id, edge_type, amount,
       occurred_at, channel, rail, depth, edge_path
FROM trail
ORDER BY depth, occurred_at
LIMIT :max_rows
"""
).bindparams(bindparam("money_edges", expanding=True))


def _hop_from_row(row: Row[Any]) -> TrailHop:
    m = row._mapping
    channel = m["channel"]
    return TrailHop(
        edge_id=m["edge_id"],
        from_entity_id=m["from_entity_id"],
        to_entity_id=m["to_entity_id"],
        edge_type=EdgeType(m["edge_type"]),
        amount=m["amount"],
        occurred_at=m["occurred_at"],
        channel=CashOutChannel(channel) if channel else None,
        rail=m["rail"],
        depth=m["depth"],
    )


def assemble_paths(
    rows: Sequence[tuple[list[uuid.UUID], TrailHop]],
    *,
    max_depth: int,
) -> list[TrailPath]:
    """Collapse CTE rows into maximal paths.

    A recursive CTE emits every *prefix* of every path, because each recursion
    level is a result row. Returning those directly would show an investigator
    the same trail five times at five different lengths.

    A path is kept when no other returned path extends it. Extraction is a pure
    function over ``edge_path`` arrays so it can be tested without a database —
    this is where a silent truncation bug would live, and a truncated money
    trail is a wrong answer that looks like a complete one.

    Paths cut off by ``max_depth`` are marked ``truncated``. That flag has to
    reach the UI: a trail that stops at an account because the search stopped
    there looks exactly like a trail where the money stopped there, and those
    two facts warrant opposite investigative responses.
    """
    by_key: dict[tuple[uuid.UUID, ...], TrailHop] = {}
    for edge_path, hop in rows:
        by_key[tuple(edge_path)] = hop

    # A prefix set is cheaper than pairwise comparison and exact: path P is
    # non-maximal exactly when some returned path has P as a strict prefix.
    extended: set[tuple[uuid.UUID, ...]] = set()
    for key in by_key:
        if len(key) > 1:
            extended.add(key[:-1])

    paths: list[TrailPath] = []
    for key, terminal_hop in by_key.items():
        if key in extended:
            continue
        hops = tuple(by_key[key[: i + 1]] for i in range(len(key)))
        paths.append(
            TrailPath(
                hops=hops,
                truncated=terminal_hop.depth >= max_depth
                and terminal_hop.edge_type is not EdgeType.WITHDREW_AT,
            )
        )

    # Cash-out paths first: they are the answer to the question being asked.
    # Then shallower and shorter-dwell paths, which are the ones an investigator
    # can act on soonest.
    paths.sort(key=lambda p: (not p.reaches_cash_out, len(p.hops), p.longest_dwell))
    return paths


async def reconstruct_trail(session: AsyncSession, query: TrailQuery) -> list[TrailPath]:
    """Walk forward from an origin entity, returning maximal money paths.

    Every returned path satisfies: hops are non-decreasing in ``occurred_at``,
    no hop was observed after ``as_of``, and no entity repeats.
    """
    if query.max_depth < 1:
        raise ValueError("max_depth must be at least 1")

    result = await session.execute(
        _TRAIL_SQL,
        {
            "origin": query.origin_entity_id,
            "as_of": query.as_of,
            "not_before": query.not_before,
            "max_depth": query.max_depth,
            "max_hop_gap": query.max_hop_gap,
            "min_amount": query.min_amount,
            "max_rows": query.max_rows,
            "money_edges": _MONEY_EDGE_TYPES,
        },
    )
    rows = [(list(row._mapping["edge_path"]), _hop_from_row(row)) for row in result]
    return assemble_paths(rows, max_depth=query.max_depth)
