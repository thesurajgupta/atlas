"""Leakage gate 4: point-in-time entity resolution (master spec §19.3).

The subtlest of the five gates. An entity merge made today, applied
retroactively, lets a model "know" a linkage that was not knowable at prediction
time — inflating recall on exactly the mule networks that matter most.

Nothing is broken when this happens. The feature pipeline reads its own entity
table, exactly as designed, and the other four gates stay silent. Only reading
the entity graph *as of* the prediction timestamp prevents it.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from atlas.core.clock import utc_now
from atlas.entity.resolution import (
    entity_as_of,
    get_or_create_canonical,
    record_decision,
)
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.leakage


@pytest.fixture
async def entity(session: AsyncSession):  # type: ignore[no-untyped-def]
    return await get_or_create_canonical(
        session,
        public_ref=f"ENT-SYN-{uuid.uuid4().hex[:8]}",
        kind="account",
        attributes={"bank": "SYNTHETIC"},
    )


async def test_a_later_merge_is_invisible_to_an_earlier_prediction(
    session: AsyncSession, entity
) -> None:  # type: ignore[no-untyped-def]
    """The leak this gate exists to stop."""
    prediction_time = utc_now() - timedelta(days=7)

    # A merge discovered today, well after the prediction was made.
    await record_decision(
        session,
        canonical_entity_id=entity.id,
        decision="merge",
        method="blocking+score",
        score=0.92,
        evidence={"account_number": "exact"},
        decided_at=utc_now(),
    )

    visible = await entity_as_of(session, entity.id, prediction_time)
    assert visible == [], (
        "a merge made after the prediction was visible to it — the model can "
        "read the future and every metric built on it is invalid"
    )


async def test_an_earlier_merge_is_visible(session: AsyncSession, entity) -> None:  # type: ignore[no-untyped-def]
    """The gate must not be so strict that it hides genuinely known facts."""
    await record_decision(
        session,
        canonical_entity_id=entity.id,
        decision="merge",
        method="blocking+score",
        score=0.91,
        evidence={},
        decided_at=utc_now() - timedelta(days=30),
    )
    assert len(await entity_as_of(session, entity.id, utc_now())) == 1


async def test_decisions_are_ordered_and_bounded_by_as_of(
    session: AsyncSession, entity
) -> None:  # type: ignore[no-untyped-def]
    now = utc_now()
    for days, decision in ((30, "merge"), (20, "split"), (1, "merge")):
        await record_decision(
            session,
            canonical_entity_id=entity.id,
            decision=decision,
            method="test",
            score=0.9,
            evidence={},
            decided_at=now - timedelta(days=days),
        )

    as_of_25_days_ago = await entity_as_of(session, entity.id, now - timedelta(days=25))
    assert [d.decision for d in as_of_25_days_ago] == ["merge"]

    everything = await entity_as_of(session, entity.id, now)
    assert [d.decision for d in everything] == ["merge", "split", "merge"]


async def test_a_merge_is_reversible(session: AsyncSession, entity) -> None:  # type: ignore[no-untyped-def]
    """A merge is a hypothesis.

    An unrecoverable wrong merge in a law-enforcement context is a serious harm,
    so the split must be recordable without destroying the history attached to
    the entity.
    """
    merge = await record_decision(
        session,
        canonical_entity_id=entity.id,
        decision="merge",
        method="blocking+score",
        score=0.88,
        evidence={"phone": "exact"},
    )
    split = await record_decision(
        session,
        canonical_entity_id=entity.id,
        decision="split",
        method="human-review",
        score=None,
        evidence={"reason": "different account holders, shared family handset"},
    )
    split.reversed_by_id = merge.id
    await session.flush()

    history = await entity_as_of(session, entity.id, utc_now())
    assert [d.decision for d in history] == ["merge", "split"]
    assert history[0].evidence == {"phone": "exact"}, (
        "original evidence must survive the split"
    )


async def test_gate_fails_if_as_of_filtering_is_removed(
    session: AsyncSession, entity
) -> None:
    """Prove the gate fires rather than trusting that it would.

    Reads the same rows without the as-of bound and confirms the future merge
    becomes visible — which is exactly the failure the gate prevents.
    """
    from atlas.entity.models import EntityResolutionDecision
    from sqlalchemy import select

    prediction_time = utc_now() - timedelta(days=7)
    await record_decision(
        session,
        canonical_entity_id=entity.id,
        decision="merge",
        method="test",
        score=0.95,
        evidence={},
        decided_at=utc_now(),
    )

    assert await entity_as_of(session, entity.id, prediction_time) == []

    unbounded = await session.execute(
        select(EntityResolutionDecision).where(
            EntityResolutionDecision.canonical_entity_id == entity.id
        )
    )
    assert len(list(unbounded.scalars())) == 1, (
        "without the as-of bound the future merge is visible — the gate is "
        "doing real work, not passing vacuously"
    )
