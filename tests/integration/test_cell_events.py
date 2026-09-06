"""Placing cash-out on the H3 lattice (ADR-011, master spec §15, §16).

Traceability: ``INT-PRED-001`` — withdrawals become cell events, or are counted
as unplaced.

The composition crosses three modules, and the hop that worries me is
entity -> endpoint: it goes through ``public_ref``, which is a convention held
by the ingest path rather than a foreign key. A broken convention produces an
empty lattice and no error at all, so these tests pin both halves — that a
matching reference places an event, and that a non-matching one is *counted*
rather than silently dropped.

All rows are created here and synthetic
(``PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md``).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from atlas.core.enums import CashOutChannel, EdgeType
from atlas.predict.cells import cash_out_cell_events
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio

DAY0 = datetime(2026, 8, 1, 9, 0, tzinfo=UTC)
LATER = DAY0 + timedelta(days=1)
SINCE = DAY0 - timedelta(days=30)

# Two coordinates far enough apart to fall in different cells at every
# resolution ADR-011 sweeps. Invented locations in central India.
BHOPAL = (23.2599, 77.4126)
NAGPUR = (21.1458, 79.0882)


async def _entity(session: AsyncSession, public_ref: str) -> uuid.UUID:
    entity_id = uuid.uuid4()
    await session.execute(
        text(
            "INSERT INTO entity.canonical_entity "
            "(id, public_ref, kind, attributes, observed_at, source_system, classification) "
            "VALUES (:id, :ref, 'BC_AGENT', '{}'::jsonb, :obs, 'test', 'SENSITIVE')"
        ),
        {"id": entity_id, "ref": public_ref, "obs": DAY0 - timedelta(days=60)},
    )
    return entity_id


async def _endpoint(
    session: AsyncSession,
    public_ref: str,
    *,
    lat_lon: tuple[float, float] | None = BHOPAL,
    observed_at: datetime | None = None,
    channel: CashOutChannel = CashOutChannel.AEPS_BC,
) -> None:
    """A cash-out endpoint, with H3 columns filled the way ingest would."""
    import h3

    cells: dict[str, str | None] = {"r6": None, "r7": None, "r8": None}
    geom = None
    if lat_lon is not None:
        lat, lon = lat_lon
        geom = f"SRID=4326;POINT({lon} {lat})"
        for resolution in (6, 7, 8):
            cells[f"r{resolution}"] = h3.latlng_to_cell(lat, lon, resolution)

    await session.execute(
        text(
            "INSERT INTO geo.cash_out_endpoint "
            "(id, public_ref, channel, operator, geom, h3_r6, h3_r7, h3_r8, "
            " observed_at, source_system, source_record_id, classification, is_synthetic) "
            "VALUES (:id, :ref, CAST(:chan AS geo.cash_out_channel), 'Test Operator', "
            " ST_GeomFromEWKT(:geom), :r6, :r7, :r8, :obs, 'test', :srec, "
            " 'SENSITIVE', true)"
        ),
        {
            "id": uuid.uuid4(),
            "ref": public_ref,
            "chan": channel.value,
            "geom": geom,
            "r6": cells["r6"],
            "r7": cells["r7"],
            "r8": cells["r8"],
            "obs": observed_at or (DAY0 - timedelta(days=60)),
            "srec": uuid.uuid4().hex,
        },
    )


async def _withdrawal(
    session: AsyncSession, frm: uuid.UUID, to: uuid.UUID, *, occurred_at: datetime
) -> None:
    edge_id = uuid.uuid4()
    await session.execute(
        text(
            "INSERT INTO graph.transaction_edge "
            "(id, from_entity_id, to_entity_id, edge_type, amount, currency, occurred_at, "
            " channel, rail, observed_at, source_system, source_record_id, classification, "
            " is_synthetic) "
            "VALUES (:id, :frm, :to, CAST(:etype AS graph.edge_type), :amt, 'INR', :occ, "
            " CAST(:chan AS geo.cash_out_channel), 'AEPS', :obs, 'test', :srec, "
            " 'SENSITIVE', true)"
        ),
        {
            "id": edge_id,
            "frm": frm,
            "to": to,
            "etype": EdgeType.WITHDREW_AT.value,
            "amt": Decimal("5000.00"),
            "occ": occurred_at,
            "chan": CashOutChannel.AEPS_BC.value,
            "obs": occurred_at,
            "srec": edge_id.hex,
        },
    )


async def _placed_scenario(session: AsyncSession, ref: str) -> uuid.UUID:
    """A mule, an endpoint whose reference matches its entity, one withdrawal."""
    mule = await _entity(session, f"MULE-{uuid.uuid4().hex[:8]}")
    agent = await _entity(session, ref)
    await _endpoint(session, ref)
    await _withdrawal(session, mule, agent, occurred_at=DAY0)
    return agent


async def test_a_withdrawal_becomes_an_event_in_the_endpoints_cell(
    session: AsyncSession,
) -> None:
    ref = f"EP-{uuid.uuid4().hex[:8]}"
    await _placed_scenario(session, ref)

    result = await cash_out_cell_events(session, as_of=LATER, since=SINCE, resolution=7)

    assert result.unplaced == 0
    assert result.placement_rate == 1.0
    assert len(result.events) == 1
    assert result.events[0].occurred_at == DAY0
    assert result.events[0].cell.startswith("87")  # an r7 index


async def test_the_resolution_changes_the_cell(session: AsyncSession) -> None:
    """The sweep depends on this: same event, different lattice."""
    ref = f"EP-{uuid.uuid4().hex[:8]}"
    await _placed_scenario(session, ref)

    r7 = await cash_out_cell_events(session, as_of=LATER, since=SINCE, resolution=7)
    r8 = await cash_out_cell_events(session, as_of=LATER, since=SINCE, resolution=8)

    assert r7.events[0].cell != r8.events[0].cell


async def test_r9_is_computed_from_geometry(session: AsyncSession) -> None:
    """No stored column exists for r9, so it comes from `geom`.

    ADR-011 sweeps r9 as a candidate; adding a column for a resolution the sweep
    may never choose would bake in the guess the ADR exists to avoid.
    """
    ref = f"EP-{uuid.uuid4().hex[:8]}"
    await _placed_scenario(session, ref)

    result = await cash_out_cell_events(session, as_of=LATER, since=SINCE, resolution=9)
    assert len(result.events) == 1
    assert result.events[0].cell.startswith("89")  # an r9 index


async def test_an_unmatched_reference_is_counted_not_silently_dropped(
    session: AsyncSession,
) -> None:
    """The contract gap made visible.

    Entity-to-endpoint goes through `public_ref`, which is a convention rather
    than a foreign key. If it breaks, the join matches nothing, the lattice is
    empty, and no error is raised anywhere. The count is what makes that
    situation distinguishable from "no cash-out happened".
    """
    mule = await _entity(session, f"MULE-{uuid.uuid4().hex[:8]}")
    orphan = await _entity(session, f"NO-SUCH-ENDPOINT-{uuid.uuid4().hex[:8]}")
    await _withdrawal(session, mule, orphan, occurred_at=DAY0)

    result = await cash_out_cell_events(session, as_of=LATER, since=SINCE, resolution=7)

    assert result.events == ()
    assert result.unplaced == 1
    assert result.total == 1
    assert result.placement_rate == 0.0


async def test_a_crypto_off_ramp_is_unplaced_and_that_is_correct(
    session: AsyncSession,
) -> None:
    """A CRYPTO_P2P cash-out is real and has no location.

    The geospatial tiers structurally cannot rank it, so the evaluation excludes
    it rather than scoring it as a miss (§17). Placing it on a hexagon would put
    a withdrawal on a map where nothing physical happened.
    """
    ref = f"EP-{uuid.uuid4().hex[:8]}"
    mule = await _entity(session, f"MULE-{uuid.uuid4().hex[:8]}")
    agent = await _entity(session, ref)
    await _endpoint(session, ref, lat_lon=None, channel=CashOutChannel.CRYPTO_P2P)
    await _withdrawal(session, mule, agent, occurred_at=DAY0)

    result = await cash_out_cell_events(session, as_of=LATER, since=SINCE, resolution=7)
    assert result.events == ()
    assert result.unplaced == 1


async def test_an_endpoint_registered_after_as_of_places_nothing(
    session: AsyncSession,
) -> None:
    """Point-in-time, applied to geography.

    At `as_of` nobody knew where that reference was, so a reconstruction of that
    instant must not place the event — the geographic form of reading the future.
    """
    ref = f"EP-{uuid.uuid4().hex[:8]}"
    mule = await _entity(session, f"MULE-{uuid.uuid4().hex[:8]}")
    agent = await _entity(session, ref)
    await _endpoint(session, ref, observed_at=DAY0 + timedelta(days=10))
    await _withdrawal(session, mule, agent, occurred_at=DAY0)

    early = await cash_out_cell_events(session, as_of=LATER, since=SINCE, resolution=7)
    assert early.unplaced == 1

    later = await cash_out_cell_events(
        session, as_of=DAY0 + timedelta(days=20), since=SINCE, resolution=7
    )
    assert len(later.events) == 1


async def test_a_withdrawal_observed_after_as_of_is_invisible(
    session: AsyncSession,
) -> None:
    """Leakage gate 1, at the lattice."""
    ref = f"EP-{uuid.uuid4().hex[:8]}"
    mule = await _entity(session, f"MULE-{uuid.uuid4().hex[:8]}")
    agent = await _entity(session, ref)
    await _endpoint(session, ref)

    edge_id = uuid.uuid4()
    await session.execute(
        text(
            "INSERT INTO graph.transaction_edge "
            "(id, from_entity_id, to_entity_id, edge_type, amount, currency, occurred_at, "
            " channel, rail, observed_at, source_system, source_record_id, classification, "
            " is_synthetic) "
            "VALUES (:id, :frm, :to, 'WITHDREW_AT', 5000.00, 'INR', :occ, "
            " 'AEPS_BC', 'AEPS', :obs, 'test', :srec, 'SENSITIVE', true)"
        ),
        {
            "id": edge_id,
            "frm": mule,
            "to": agent,
            "occ": DAY0,
            "obs": DAY0 + timedelta(days=10),
            "srec": edge_id.hex,
        },
    )

    result = await cash_out_cell_events(session, as_of=LATER, since=SINCE, resolution=7)
    assert result.total == 0, "a withdrawal disclosed later reached the lattice"


async def test_events_arrive_in_ascending_time_order(session: AsyncSession) -> None:
    """The Hawkes history walk stops at the first event later than the scoring
    instant, which is only correct on an ascending sequence."""
    ref = f"EP-{uuid.uuid4().hex[:8]}"
    mule = await _entity(session, f"MULE-{uuid.uuid4().hex[:8]}")
    agent = await _entity(session, ref)
    await _endpoint(session, ref)
    for hours in (5, 1, 3):
        await _withdrawal(
            session, mule, agent, occurred_at=DAY0 + timedelta(hours=hours)
        )

    result = await cash_out_cell_events(session, as_of=LATER, since=SINCE, resolution=7)
    stamps = [e.occurred_at for e in result.events]
    assert stamps == sorted(stamps)


async def test_an_unsupported_resolution_is_refused(session: AsyncSession) -> None:
    with pytest.raises(ValueError, match="not supported"):
        await cash_out_cell_events(session, as_of=LATER, since=SINCE, resolution=12)


async def test_no_withdrawals_is_an_empty_result_not_an_error(
    session: AsyncSession,
) -> None:
    result = await cash_out_cell_events(
        session,
        as_of=DAY0 - timedelta(days=200),
        since=DAY0 - timedelta(days=210),
        resolution=7,
    )
    assert result.total == 0
    assert result.placement_rate == 0.0
