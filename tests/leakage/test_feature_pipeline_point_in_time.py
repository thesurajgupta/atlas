"""Leakage gate 1, applied to the feature pipeline (master spec §19.1, §22).

Traceability: ``LEAK-006`` — computed features are bounded by what was knowable.

``tests/leakage/test_feature_store_point_in_time.py`` proves the *store* refuses
to read a value written after ``as_of``. That is a bound on reads. This is the
other half, and the easier half to get wrong: a pipeline can write a row whose
``observed_at`` is honest and whose *value* was computed from data that was not
knowable then. The store would then serve a leaked number through a correct
as-of read, and every gate downstream would agree it was fine.

Two distinct failures are covered here, because they are opposite mistakes:

1. **Value leakage** — the number includes something disclosed after ``as_of``.
   Nothing errors; the feature is simply better informed than it could have
   been, and the metric it feeds improves for a reason that will never exist in
   production.
2. **Stamp drift** — the value is honest but ``observed_at`` is wrong. Stamped
   with ``utc_now()`` a backfill of last Tuesday is marked knowable today, so
   the as-of read finds nothing for any historical instant. That does not leak;
   it silently empties the training set and reads as "no features computed yet".

Both are checked through the store's own reader, not by inspecting rows, so what
is asserted is what a model would actually receive.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from atlas.core.enums import EdgeType
from atlas.features.pipeline import SUBJECT_ENTITY, run_pipeline
from atlas.features.store import read_as_of
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.leakage

DAY0 = datetime(2026, 6, 1, 9, 0, tzinfo=UTC)
WEEK = (timedelta(days=7),)

VELOCITY = "txn_out_count_7d"


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
) -> None:
    edge_id = uuid.uuid4()
    await session.execute(
        text(
            "INSERT INTO graph.transaction_edge "
            "(id, from_entity_id, to_entity_id, edge_type, amount, currency, occurred_at, "
            " channel, rail, observed_at, source_system, source_record_id, classification, "
            " is_synthetic) "
            "VALUES (:id, :frm, :to, CAST(:etype AS graph.edge_type), :amt, 'INR', :occ, "
            " NULL, 'IMPS', :obs, 'test', :srec, 'SENSITIVE', true)"
        ),
        {
            "id": edge_id,
            "frm": frm,
            "to": to,
            "etype": EdgeType.TRANSFERRED_TO.value,
            "amt": Decimal("1000.00"),
            "occ": occurred_at,
            "obs": observed_at,
            "srec": edge_id.hex,
        },
    )


async def _velocity_at(
    session: AsyncSession, entity_id: uuid.UUID, as_of: datetime
) -> float | None:
    vectors = await read_as_of(
        session,
        subject_kind=SUBJECT_ENTITY,
        subject_ids=[entity_id],
        feature_names=[VELOCITY],
        as_of=as_of,
    )
    vector = vectors.get(entity_id)
    return None if vector is None else vector[VELOCITY]


async def test_a_feature_never_includes_a_disclosure_that_had_not_arrived(
    session: AsyncSession,
) -> None:
    """The realistic failure, and it is not exotic.

    A bank answers a production request on day 6 about a transfer that happened
    on day 2. A feature computed as of day 3 must count one transfer, not two —
    in the real world the value computed on day 3 could not have seen it.
    """
    subject, other = await _entity(session), await _entity(session)
    await _edge(session, subject, other, occurred_at=DAY0, observed_at=DAY0)
    await _edge(
        session,
        subject,
        other,
        occurred_at=DAY0 + timedelta(days=2),
        observed_at=DAY0 + timedelta(days=6),
    )

    day3 = DAY0 + timedelta(days=3)
    await run_pipeline(session, entity_ids=[subject], as_of=day3, windows=WEEK)

    assert await _velocity_at(session, subject, day3) == 1.0, (
        "a transfer disclosed on day 6 reached a feature computed as of day 3"
    )


async def test_the_same_computation_run_later_does_see_it(
    session: AsyncSession,
) -> None:
    """The bound is point-in-time, not a permanent exclusion.

    Without this the previous test passes for a pipeline that reads nothing at
    all, which would be exactly as leak-free and entirely useless.
    """
    subject, other = await _entity(session), await _entity(session)
    await _edge(session, subject, other, occurred_at=DAY0, observed_at=DAY0)
    await _edge(
        session,
        subject,
        other,
        occurred_at=DAY0 + timedelta(days=2),
        observed_at=DAY0 + timedelta(days=6),
    )

    # An hour past the late disclosure, and still inside a seven-day window that
    # contains both transfers. Not day 7 exactly: the window is half-open, so
    # the day-0 transfer would sit precisely on the excluded lower bound and
    # this would assert the wrong thing for the right reason.
    day6 = DAY0 + timedelta(days=6, hours=1)
    await run_pipeline(session, entity_ids=[subject], as_of=day6, windows=WEEK)

    assert await _velocity_at(session, subject, day6) == 2.0


async def test_a_backfilled_feature_is_readable_at_the_instant_it_describes(
    session: AsyncSession,
) -> None:
    """``observed_at`` is ``as_of``, not the wall clock.

    Stamped with ``utc_now()`` this row would be marked knowable today, and the
    as-of read for last Tuesday would return nothing. That is not a leak — it is
    a silently empty training set that reads as "no features computed yet", and
    the pipeline would look like it had run successfully.
    """
    subject, other = await _entity(session), await _entity(session)
    await _edge(session, subject, other, occurred_at=DAY0, observed_at=DAY0)

    day3 = DAY0 + timedelta(days=3)
    await run_pipeline(session, entity_ids=[subject], as_of=day3, windows=WEEK)

    assert await _velocity_at(session, subject, day3) == 1.0

    # ...and it is not readable one second before the instant it describes. A
    # window closing at day 3 was not knowable at day 3 minus a second.
    assert await _velocity_at(session, subject, day3 - timedelta(seconds=1)) is None


async def test_a_later_run_does_not_rewrite_an_earlier_answer(
    session: AsyncSession,
) -> None:
    """Append-only, and this is what that buys.

    Recomputing today must not change what a prediction made last week could
    see. A store that overwrote in place would make every historical metric a
    measurement of today's data, and nothing would report it.
    """
    subject, other = await _entity(session), await _entity(session)
    await _edge(session, subject, other, occurred_at=DAY0, observed_at=DAY0)

    day3 = DAY0 + timedelta(days=3)
    await run_pipeline(session, entity_ids=[subject], as_of=day3, windows=WEEK)

    await _edge(
        session,
        subject,
        other,
        occurred_at=DAY0 + timedelta(days=4),
        observed_at=DAY0 + timedelta(days=4),
    )
    day5 = DAY0 + timedelta(days=5)
    await run_pipeline(session, entity_ids=[subject], as_of=day5, windows=WEEK)

    assert await _velocity_at(session, subject, day5) == 2.0
    assert await _velocity_at(session, subject, day3) == 1.0, (
        "recomputing today changed what was knowable on day 3"
    )


async def test_rerunning_the_same_instant_changes_nothing(
    session: AsyncSession,
) -> None:
    """Backfilling is normal, so a second run must be a no-op.

    A pipeline that doubled its own output on re-run would corrupt every window
    it touched, and the corruption would look like activity.
    """
    subject, other = await _entity(session), await _entity(session)
    await _edge(session, subject, other, occurred_at=DAY0, observed_at=DAY0)

    day3 = DAY0 + timedelta(days=3)
    await run_pipeline(session, entity_ids=[subject], as_of=day3, windows=WEEK)
    await run_pipeline(session, entity_ids=[subject], as_of=day3, windows=WEEK)

    rows = await session.execute(
        text(
            "SELECT count(*) FROM features.feature_value "
            "WHERE subject_id = :sid AND feature_name = :name AND observed_at = :obs"
        ),
        {"sid": subject, "name": VELOCITY, "obs": day3},
    )
    assert rows.scalar_one() == 1
