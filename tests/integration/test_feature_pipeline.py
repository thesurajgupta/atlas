"""The feature pipeline's outputs (master spec §19.1, §22).

Traceability: ``INT-FEAT-001`` — behavioural features computed into the store.

The point-in-time behaviour is a gate and lives in
``tests/leakage/test_feature_pipeline_point_in_time.py``. What is tested here is
what the numbers actually are, and — more importantly — which features the
pipeline declines to write. An absent feature and a zero are different claims,
and the only place that distinction can still be made is at the moment of
writing.

All rows are created here and synthetic
(``PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md``).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from atlas.core.enums import CashOutChannel, EdgeType
from atlas.features.pipeline import (
    SUBJECT_ENTITY,
    ComputedFeature,
    compute_entity_features,
    run_pipeline,
)
from atlas.features.store import ProhibitedFeatureError, read_as_of
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio

DAY0 = datetime(2026, 7, 1, 9, 0, tzinfo=UTC)
LATER = DAY0 + timedelta(hours=1)
WEEK = (timedelta(days=7),)


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
            "occ": DAY0,
            "chan": channel.value if channel else None,
            "obs": DAY0,
            "srec": edge_id.hex,
        },
    )


def _named(features: list[ComputedFeature], subject: uuid.UUID) -> dict[str, float]:
    return {f.feature_name: f.value for f in features if f.subject_id == subject}


async def test_velocity_spread_and_shape_are_computed(session: AsyncSession) -> None:
    """One pass-through account: two in, three out, across two counterparties."""
    subject = await _entity(session)
    senders = [await _entity(session) for _ in range(2)]
    receivers = [await _entity(session) for _ in range(3)]
    for sender in senders:
        await _edge(session, sender, subject, amount="5000.00")
    for receiver in receivers:
        await _edge(session, subject, receiver, amount="1500.00")

    values = _named(
        await compute_entity_features(
            session, entity_ids=[subject], as_of=LATER, windows=WEEK
        ),
        subject,
    )

    assert values["txn_in_count_7d"] == 2.0
    assert values["txn_out_count_7d"] == 3.0
    assert values["txn_out_amount_7d"] == 4500.0
    assert values["distinct_in_counterparties_7d"] == 2.0
    assert values["distinct_out_counterparties_7d"] == 3.0
    assert values["fan_in_out_ratio_7d"] == pytest.approx(2 / 3)


async def test_a_ratio_with_no_denominator_is_omitted_not_zero(
    session: AsyncSession,
) -> None:
    """An account that sent nothing has no fan-in/out ratio.

    The quantity is undefined, and 0.0 is a specific claim about balance the
    data does not make. Writing a placeholder would destroy the distinction at
    the one point where it is still available — the store cannot recover it
    later, because a zero read back is indistinguishable from a zero observed.
    """
    collector, sender = await _entity(session), await _entity(session)
    await _edge(session, sender, collector)

    values = _named(
        await compute_entity_features(
            session, entity_ids=[collector], as_of=LATER, windows=WEEK
        ),
        collector,
    )

    assert values["txn_in_count_7d"] == 1.0
    assert values["txn_out_count_7d"] == 0.0
    assert "fan_in_out_ratio_7d" not in values


async def test_an_unscored_entity_has_no_risk_feature(session: AsyncSession) -> None:
    """Never scored is not zero risk.

    Substituting 0.0 turns "we have not looked" into "we looked and found
    nothing", and once they are the same number no model can tell them apart.
    """
    subject = await _entity(session)

    values = _named(
        await compute_entity_features(
            session, entity_ids=[subject], as_of=LATER, windows=WEEK
        ),
        subject,
    )
    assert "entity_risk_decayed" not in values


async def test_a_scored_entity_carries_its_decayed_risk(session: AsyncSession) -> None:
    """Carried through from ``atlas.entity``, which owns that judgement.

    This module transports the number and does not weigh it — a risk the
    pipeline recomputed would be a second, uncalibrated opinion wearing the same
    name.
    """
    subject = await _entity(session)
    await session.execute(
        text(
            "INSERT INTO entity.entity_risk_score "
            "(id, canonical_entity_id, score, model_version, valid_from, "
            " contributing_factors) "
            "VALUES (:id, :eid, 0.8, 'test@1', :vf, '[]'::jsonb)"
        ),
        {"id": uuid.uuid4(), "eid": subject, "vf": DAY0},
    )

    values = _named(
        await compute_entity_features(
            session, entity_ids=[subject], as_of=LATER, windows=WEEK
        ),
        subject,
    )
    assert "entity_risk_decayed" in values
    # Decay has barely started an hour in, and the score must not exceed the raw
    # value it decays from.
    assert 0.0 < values["entity_risk_decayed"] <= 0.8


async def test_cash_out_frequency_is_attributed_to_the_endpoint(
    session: AsyncSession,
) -> None:
    mule, agent = await _entity(session), await _entity(session, "BC_AGENT")
    await _edge(
        session,
        mule,
        agent,
        edge_type=EdgeType.WITHDREW_AT,
        channel=CashOutChannel.AEPS_BC,
    )

    features = await compute_entity_features(
        session, entity_ids=[mule, agent], as_of=LATER, windows=WEEK
    )
    assert _named(features, agent)["endpoint_cash_out_count_7d"] == 1.0
    assert _named(features, mule)["endpoint_cash_out_count_7d"] == 0.0


async def test_each_window_produces_its_own_named_feature(
    session: AsyncSession,
) -> None:
    """Two velocities over different windows are two features, not one.

    Sharing a name would make them overwrite each other at the same
    ``observed_at`` — and the store's uniqueness constraint would keep whichever
    was written first, silently.
    """
    subject, other = await _entity(session), await _entity(session)
    await _edge(session, subject, other)

    features = await compute_entity_features(
        session,
        entity_ids=[subject],
        as_of=LATER,
        windows=(timedelta(days=7), timedelta(days=30)),
    )
    names = _named(features, subject)
    assert "txn_out_count_7d" in names
    assert "txn_out_count_30d" in names


async def test_every_computed_name_survives_the_prohibited_check(
    session: AsyncSession,
) -> None:
    """The pipeline is a caller of the boundary, not an exception to it.

    ``compute_entity_features`` asserts this on its own output before returning,
    so a feature added later that names an artefact, the answer key or a
    protected attribute fails here rather than in the store — or worse, in a
    model.
    """
    subject, other = await _entity(session), await _entity(session)
    await _edge(session, subject, other)

    features = await compute_entity_features(
        session, entity_ids=[subject], as_of=LATER, windows=WEEK
    )
    assert features, "nothing was computed, so nothing was checked"

    # And the check it relies on is real, not a no-op on this shape of name.
    from atlas.features.store import assert_no_prohibited_features

    with pytest.raises(ProhibitedFeatureError):
        assert_no_prohibited_features(["txn_out_count_7d", "label_cash_out_zone"])


async def test_the_written_rows_are_readable_through_the_store(
    session: AsyncSession,
) -> None:
    """End to end: what a model would actually receive."""
    subject, other = await _entity(session), await _entity(session)
    await _edge(session, subject, other, amount="2500.00")

    written = await run_pipeline(
        session, entity_ids=[subject], as_of=LATER, windows=WEEK
    )
    assert written > 0

    vectors = await read_as_of(
        session,
        subject_kind=SUBJECT_ENTITY,
        subject_ids=[subject],
        feature_names=["txn_out_count_7d", "txn_out_amount_7d"],
        as_of=LATER,
    )
    assert vectors[subject]["txn_out_count_7d"] == 1.0
    assert vectors[subject]["txn_out_amount_7d"] == 2500.0
    assert vectors[subject].pipeline_versions["txn_out_count_7d"] == "behavioural@1"


async def test_a_naive_as_of_is_rejected(session: AsyncSession) -> None:
    with pytest.raises(ValueError, match="timezone-aware"):
        await compute_entity_features(
            session,
            entity_ids=[uuid.uuid4()],
            as_of=datetime(2026, 7, 1, 9, 0),  # noqa: DTZ001 - naive on purpose
            windows=WEEK,
        )
