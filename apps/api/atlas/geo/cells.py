"""H3 cell lookup for cash-out endpoints (ADR-011, master spec §16).

``atlas.predict`` needs to know which cell an endpoint sits in, at a chosen
resolution. It may not read ``geo.cash_out_endpoint`` to find out — that table
belongs to this module, and cross-module access goes through the owning
module's service interface (ADR-009). So the query lives here.

## Two sources for a cell, and why both exist

``r6``, ``r7`` and ``r8`` are stored columns, indexed, and assigned when the
endpoint is ingested. ``r9`` is not stored, so it is computed from ``geom`` on
demand. That asymmetry is not tidy, and the alternative was worse: adding a
column for a resolution the sweep may never choose bakes a guess into the schema
that ADR-011 exists to avoid making.

The computed path is exact rather than approximate — H3 indexing is a pure
function of a coordinate — so the two sources agree by construction. What
differs is cost, and only at r9.

## Endpoints with no coordinates

A ``CRYPTO_P2P`` endpoint is logical, not geographic. Its ``geom`` is null, and
that null is a modelled fact rather than missing data (see ``CashOutEndpoint``).
Such an endpoint has **no cell**, and is absent from the result rather than
present with a placeholder. A crypto off-ramp assigned to a hexagon would put a
cash-out on a map at a place where nothing physical happened, and every
downstream count over that cell would be wrong by exactly one real event that
belongs nowhere.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

#: Resolutions with a stored, indexed column. Anything else is computed.
STORED_RESOLUTIONS: frozenset[int] = frozenset({6, 7, 8})

#: Every resolution this module can answer for. Matches ADR-011's sweep
#: candidates; r9 is served from ``geom``.
SUPPORTED_RESOLUTIONS: frozenset[int] = STORED_RESOLUTIONS | {9}


async def endpoint_cells(
    session: AsyncSession,
    *,
    public_refs: Sequence[str],
    as_of: datetime,
    resolution: int,
) -> dict[str, str]:
    """Map each endpoint's ``public_ref`` to its H3 cell at ``resolution``.

    Bounded by ``observed_at <= as_of`` like every other read in the system: an
    endpoint registered last week did not exist for a reconstruction of last
    month, and counting cash-out into a cell whose endpoint was not yet known
    would be the geographic version of reading the future.

    Endpoints with no coordinate — or none recorded at that resolution — are
    simply absent. See the module docstring for why a placeholder would be
    worse than a gap.
    """
    if as_of.tzinfo is None:
        raise ValueError("as_of must be timezone-aware; naive datetimes are ambiguous")
    if resolution not in SUPPORTED_RESOLUTIONS:
        raise ValueError(
            f"resolution {resolution} is not supported; "
            f"ADR-011 sweeps {sorted(SUPPORTED_RESOLUTIONS)}"
        )
    if not public_refs:
        return {}

    if resolution in STORED_RESOLUTIONS:
        # The column name is interpolated, not bound. It is checked against a
        # frozenset above and can only ever be one of three literals — a bind
        # parameter cannot name a column, and the alternative is three
        # near-identical query strings.
        column = f"h3_r{resolution}"
        rows = await session.execute(
            text(
                f"SELECT public_ref, {column} AS cell "  # noqa: S608
                "FROM geo.cash_out_endpoint "
                "WHERE public_ref = ANY(:refs) AND observed_at <= :as_of "
                f"AND {column} IS NOT NULL"
            ),
            {"refs": list(public_refs), "as_of": as_of},
        )
        return {row._mapping["public_ref"]: row._mapping["cell"] for row in rows}

    return await _computed_cells(
        session, public_refs=public_refs, as_of=as_of, resolution=resolution
    )


async def _computed_cells(
    session: AsyncSession,
    *,
    public_refs: Sequence[str],
    as_of: datetime,
    resolution: int,
) -> dict[str, str]:
    """Index coordinates into cells in Python, for resolutions with no column.

    ``h3`` is imported here rather than at module scope so that importing
    ``atlas.geo`` does not require it for the stored-resolution path, which is
    the one the serving code actually uses.
    """
    import h3

    rows = await session.execute(
        text(
            "SELECT public_ref, ST_Y(geom) AS lat, ST_X(geom) AS lon "
            "FROM geo.cash_out_endpoint "
            "WHERE public_ref = ANY(:refs) AND observed_at <= :as_of "
            "AND geom IS NOT NULL"
        ),
        {"refs": list(public_refs), "as_of": as_of},
    )
    return {
        row._mapping["public_ref"]: h3.latlng_to_cell(
            row._mapping["lat"], row._mapping["lon"], resolution
        )
        for row in rows
    }


async def all_endpoint_cells(
    session: AsyncSession, *, as_of: datetime, resolution: int
) -> dict[str, str]:
    """Every endpoint knowable at ``as_of``, mapped to its cell.

    The reverse direction from :func:`endpoint_cells`, which answers for a known
    set of references. Building a lattice needs the whole population: a cell with
    endpoints but no cash-out yet is still a cell the model must be able to rank,
    and asking only about endpoints that appear in the events would restrict the
    candidate set to places value has already left — which is the one place it is
    least likely to leave next.
    """
    if as_of.tzinfo is None:
        raise ValueError("as_of must be timezone-aware; naive datetimes are ambiguous")
    if resolution not in SUPPORTED_RESOLUTIONS:
        raise ValueError(
            f"resolution {resolution} is not supported; "
            f"ADR-011 sweeps {sorted(SUPPORTED_RESOLUTIONS)}"
        )

    if resolution in STORED_RESOLUTIONS:
        column = f"h3_r{resolution}"
        rows = await session.execute(
            text(
                f"SELECT public_ref, {column} AS cell "  # noqa: S608
                "FROM geo.cash_out_endpoint "
                f"WHERE observed_at <= :as_of AND {column} IS NOT NULL"
            ),
            {"as_of": as_of},
        )
        return {row._mapping["public_ref"]: row._mapping["cell"] for row in rows}

    import h3

    rows = await session.execute(
        text(
            "SELECT public_ref, ST_Y(geom) AS lat, ST_X(geom) AS lon "
            "FROM geo.cash_out_endpoint "
            "WHERE observed_at <= :as_of AND geom IS NOT NULL"
        ),
        {"as_of": as_of},
    )
    return {
        row._mapping["public_ref"]: h3.latlng_to_cell(
            row._mapping["lat"], row._mapping["lon"], resolution
        )
        for row in rows
    }
