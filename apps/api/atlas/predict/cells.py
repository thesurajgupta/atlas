"""Cash-out events placed on the H3 lattice (ADR-011, master spec §15, §16).

The Tier 1 target is "which cell, and when" — so a withdrawal has to be turned
from *an edge terminating at an entity* into *an event in a cell*. Three modules
each hold one third of that and none may reach into another's schema (ADR-009):

    atlas.graph   WITHDREW_AT edge  ->  (entity_id, occurred_at)
    atlas.entity  entity_id         ->  public_ref
    atlas.geo     public_ref        ->  H3 cell at a resolution

``atlas.predict`` sits above all three, which makes this the only place the join
is allowed to happen. It is composition, not a query: every bound is applied by
the module that owns the data, and this module adds none of its own.

## The contract gap, recorded rather than assumed

**The entity-to-endpoint hop is by ``public_ref``, and nothing enforces it.**
``entity.canonical_entity`` and ``geo.cash_out_endpoint`` each hold a unique
``public_ref``, and ``entity.resolution.get_or_create_canonical`` keys on it, so
in practice an endpoint's canonical entity carries the endpoint's reference.
That is a convention held by the ingest path, not a foreign key, and no
migration states it.

The consequence is visible rather than hidden: an entity whose reference matches
no endpoint is **dropped**, and :attr:`CellEvents.unplaced` counts how many. A
join silently matching nothing would produce an empty lattice and a model that
trains on no events while reporting no error — which is exactly the shape of
failure this project keeps finding. A count that is suspiciously equal to the
event total says "the convention broke" in a way somebody will notice.

Closing it properly means either a typed link from an endpoint to its canonical
entity, or endpoints becoming canonical entities outright. Both are larger than
this module and neither is #67.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from atlas.entity.resolution import public_refs_for
from atlas.geo.cells import SUPPORTED_RESOLUTIONS, endpoint_cells
from atlas.graph.aggregates import cash_out_occurrences
from atlas.predict.hawkes import CashOutEvent


@dataclass(frozen=True)
class CellEvents:
    """Cash-out events on the lattice, with what could not be placed.

    ``unplaced`` is part of the result rather than a log line. The number of
    events that never reached a cell is the single most useful diagnostic for
    this composition — it is how a broken ``public_ref`` convention, an endpoint
    registered after ``as_of``, and a dataset of pure crypto off-ramps all
    announce themselves — and a caller that never sees it will read an empty
    lattice as "no cash-out happened".
    """

    events: tuple[CashOutEvent, ...]
    resolution: int
    as_of: datetime
    since: datetime
    #: Withdrawals that could not be placed in a cell at all.
    unplaced: int

    @property
    def total(self) -> int:
        return len(self.events) + self.unplaced

    @property
    def placement_rate(self) -> float:
        """Share of withdrawals that reached a cell. 0.0 when there were none.

        Not a quality score and not a metric: it is a plumbing check. A rate
        near zero on a dataset that plainly contains withdrawals means the join
        is broken, not that the model is bad.
        """
        return len(self.events) / self.total if self.total else 0.0

    @property
    def distinct_cells(self) -> int:
        return len({event.cell for event in self.events})


async def cash_out_cell_events(
    session: AsyncSession,
    *,
    as_of: datetime,
    since: datetime,
    resolution: int,
) -> CellEvents:
    """Withdrawals in ``(since, as_of]``, placed on the lattice at ``resolution``.

    Every temporal bound is applied by the module that owns the rows, so nothing
    here can loosen one. ``atlas.geo`` is asked for endpoints as they stood at
    the same ``as_of``: an endpoint registered after that instant must not place
    an event, because at ``as_of`` nobody knew where that reference was.

    Crypto off-ramps are counted in ``unplaced`` and that is correct, not a
    defect. A ``CRYPTO_P2P`` cash-out is real and has no location; the
    geospatial tiers structurally cannot rank it, and the evaluation excludes it
    rather than scoring it as a miss (§17). Assigning it a hexagon would put a
    withdrawal on a map where nothing physical happened.
    """
    # Validated here rather than left to `endpoint_cells`, which is only reached
    # when there is at least one withdrawal to place. Without this an unsupported
    # resolution returns a clean empty result on a quiet window and raises on a
    # busy one — the same call succeeding or failing depending on the data is
    # the worst kind of argument check.
    if resolution not in SUPPORTED_RESOLUTIONS:
        raise ValueError(
            f"resolution {resolution} is not supported; "
            f"ADR-011 sweeps {sorted(SUPPORTED_RESOLUTIONS)}"
        )

    occurrences = await cash_out_occurrences(session, as_of=as_of, since=since)
    if not occurrences:
        return CellEvents(events=(), resolution=resolution, as_of=as_of, since=since, unplaced=0)

    refs = await public_refs_for(
        session, entity_ids=[o.entity_id for o in occurrences], as_of=as_of
    )
    cells = await endpoint_cells(
        session,
        public_refs=sorted(set(refs.values())),
        as_of=as_of,
        resolution=resolution,
    )

    events: list[CashOutEvent] = []
    unplaced = 0
    for occurrence in occurrences:
        ref = refs.get(occurrence.entity_id)
        cell = cells.get(ref) if ref is not None else None
        if cell is None:
            unplaced += 1
            continue
        events.append(CashOutEvent(cell=cell, occurred_at=occurrence.occurred_at))

    # `cash_out_occurrences` already returns ascending order and the loop
    # preserves it, which the Hawkes history relies on. Restated as a fact the
    # type cannot carry rather than re-sorted: a sort here would hide a future
    # change that broke the guarantee upstream.
    return CellEvents(
        events=tuple(events),
        resolution=resolution,
        as_of=as_of,
        since=since,
        unplaced=unplaced,
    )
