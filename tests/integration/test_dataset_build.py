"""Entity features aggregated to cell observations (master spec §15, §19.1).

Traceability: ``INT-PRED-002`` — the entity-to-cell crossing.

The feature store holds facts about entities; Tier 1 predicts over cells. The
crossing is a modelling decision, and these tests pin what was decided: both
sum and max are emitted, the endpoint count comes with them, negatives are kept,
and features are read at the prediction instant while labels look forward.

All rows are created here and synthetic
(``PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md``).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from atlas.features.pipeline import SUBJECT_ENTITY
from atlas.features.store import write_feature
from atlas.predict.dataset import (
    ENDPOINT_COUNT_FEATURE,
    MAX_PREFIX,
    SUM_PREFIX,
    build_slice,
)
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio

DAY0 = datetime(2026, 11, 1, 9, 0, tzinfo=UTC)
HORIZON = timedelta(hours=24)
FEATURE = "endpoint_cash_out_count_7d"

# Two coordinates that share an r6 cell but differ at r8 — enough to put two
# endpoints in one cell without hand-writing an H3 index.
NEAR_A = (23.2599, 77.4126)
NEAR_B = (23.2610, 77.4131)
FAR = (21.1458, 79.0882)


async def _endpoint_entity(
    session: AsyncSession, ref: str, lat_lon: tuple[float, float]
) -> uuid.UUID:
    """An endpoint and the canonical entity that shares its reference."""
    import h3

    entity_id = uuid.uuid4()
    await session.execute(
        text(
            "INSERT INTO entity.canonical_entity "
            "(id, public_ref, kind, attributes, observed_at, source_system, classification) "
            "VALUES (:id, :ref, 'BC_AGENT', '{}'::jsonb, :obs, 'test', 'SENSITIVE')"
        ),
        {"id": entity_id, "ref": ref, "obs": DAY0 - timedelta(days=90)},
    )

    lat, lon = lat_lon
    await session.execute(
        text(
            "INSERT INTO geo.cash_out_endpoint "
            "(id, public_ref, channel, operator, geom, h3_r6, h3_r7, h3_r8, "
            " observed_at, source_system, source_record_id, classification, is_synthetic) "
            "VALUES (:id, :ref, 'AEPS_BC', 'Test Operator', ST_GeomFromEWKT(:geom), "
            " :r6, :r7, :r8, :obs, 'test', :srec, 'SENSITIVE', true)"
        ),
        {
            "id": uuid.uuid4(),
            "ref": ref,
            "geom": f"SRID=4326;POINT({lon} {lat})",
            "r6": h3.latlng_to_cell(lat, lon, 6),
            "r7": h3.latlng_to_cell(lat, lon, 7),
            "r8": h3.latlng_to_cell(lat, lon, 8),
            "obs": DAY0 - timedelta(days=90),
            "srec": uuid.uuid4().hex,
        },
    )
    return entity_id


async def _feature(
    session: AsyncSession, entity_id: uuid.UUID, value: float, *, observed_at: datetime
) -> None:
    await write_feature(
        session,
        subject_kind=SUBJECT_ENTITY,
        subject_id=entity_id,
        feature_name=FEATURE,
        value=value,
        observed_at=observed_at,
        pipeline_version="test@1",
    )


async def test_sum_and_max_are_both_emitted_for_a_shared_cell(
    session: AsyncSession,
) -> None:
    """The decision this module exists to make, asserted.

    Two endpoints in one cell: sum finds the neighbourhood, max finds the single
    hot agent. Either alone discards a real pattern, so both are given to the
    model and it decides which matters.
    """
    a = await _endpoint_entity(session, f"EP-A-{uuid.uuid4().hex[:8]}", NEAR_A)
    b = await _endpoint_entity(session, f"EP-B-{uuid.uuid4().hex[:8]}", NEAR_B)
    await _feature(session, a, 7.0, observed_at=DAY0 - timedelta(days=1))
    await _feature(session, b, 2.0, observed_at=DAY0 - timedelta(days=1))
    await session.flush()

    result = await build_slice(
        session,
        as_of=DAY0,
        horizon=HORIZON,
        resolution=6,
        entity_feature_names=[FEATURE],
    )

    shared = [o for o in result.observations if o.features[ENDPOINT_COUNT_FEATURE] >= 2]
    assert shared, "the two endpoints should share an r6 cell"
    features = shared[0].features
    assert features[f"{SUM_PREFIX}{FEATURE}"] == 9.0
    assert features[f"{MAX_PREFIX}{FEATURE}"] == 7.0
    assert features[ENDPOINT_COUNT_FEATURE] == 2.0


async def test_a_cell_with_no_cash_out_is_kept_as_a_negative(
    session: AsyncSession,
) -> None:
    """A dataset of only cells where value already left teaches the wrong thing.

    Those are the places it is least likely to leave next, and a model trained
    on positives alone has nothing to rank them against.
    """
    quiet = await _endpoint_entity(session, f"EP-Q-{uuid.uuid4().hex[:8]}", FAR)
    await _feature(session, quiet, 0.0, observed_at=DAY0 - timedelta(days=1))
    await session.flush()

    result = await build_slice(
        session,
        as_of=DAY0,
        horizon=HORIZON,
        resolution=8,
        entity_feature_names=[FEATURE],
    )

    assert result.observations
    assert all(o.label == 0 for o in result.observations)


async def test_a_feature_written_after_the_instant_is_not_read(
    session: AsyncSession,
) -> None:
    """Leakage gate 1, at the dataset boundary.

    The store applies the bound; this asserts the dataset builder actually asks
    for the prediction instant rather than for "now".
    """
    entity = await _endpoint_entity(session, f"EP-L-{uuid.uuid4().hex[:8]}", FAR)
    await _feature(session, entity, 5.0, observed_at=DAY0 + timedelta(days=3))
    await session.flush()

    early = await build_slice(
        session,
        as_of=DAY0,
        horizon=HORIZON,
        resolution=8,
        entity_feature_names=[FEATURE],
    )
    assert early.observations == ()
    assert early.cells_without_features >= 1

    later = await build_slice(
        session,
        as_of=DAY0 + timedelta(days=4),
        horizon=HORIZON,
        resolution=8,
        entity_feature_names=[FEATURE],
    )
    assert later.observations


async def test_a_cell_with_no_features_is_counted_not_zero_filled(
    session: AsyncSession,
) -> None:
    """The store separates "absent" from "observed zero", and so does this.

    Inventing zeroes would hand the model values nobody measured.
    """
    await _endpoint_entity(session, f"EP-N-{uuid.uuid4().hex[:8]}", FAR)
    await session.flush()

    result = await build_slice(
        session,
        as_of=DAY0,
        horizon=HORIZON,
        resolution=8,
        entity_feature_names=[FEATURE],
    )
    assert result.cells_without_features >= 1


async def test_a_naive_instant_is_refused(session: AsyncSession) -> None:
    with pytest.raises(ValueError, match="timezone-aware"):
        await build_slice(
            session,
            as_of=datetime(2026, 11, 1, 9, 0),  # noqa: DTZ001 - naive on purpose
            horizon=HORIZON,
            resolution=8,
            entity_feature_names=[FEATURE],
        )


async def test_a_non_positive_horizon_is_refused(session: AsyncSession) -> None:
    """A zero horizon makes every label zero, silently."""
    with pytest.raises(ValueError, match="horizon"):
        await build_slice(
            session,
            as_of=DAY0,
            horizon=timedelta(0),
            resolution=8,
            entity_feature_names=[FEATURE],
        )
