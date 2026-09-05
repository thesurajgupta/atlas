"""Versioned, decayed, explained entity risk (master spec §13.2).

Traceability: ``ML-ENTRISK-001`` — dynamic risk for all entity types.

The headline requirement is that "when did this endpoint become risky?" is
answerable, which is the question an investigator actually asks. A current-value
column cannot answer it, so the tests here are mostly about history.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from atlas.entity.risk import RiskFactor, became_risky_at, record_risk, risk_as_of
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio

DAY0 = datetime(2026, 1, 5, 8, 0, tzinfo=UTC)
MONTH = timedelta(days=30)

FACTORS = (
    RiskFactor(
        name="distinct_complaints_30d",
        weight=0.6,
        detail="7 unrelated complaints reached this endpoint in 30 days",
    ),
    RiskFactor(
        name="aeps_volume_ratio",
        weight=0.4,
        detail="AePS withdrawals ran 4.1x this agent's 90-day median",
    ),
)


async def _endpoint(
    session: AsyncSession, kind: str = "CASH_OUT_ENDPOINT"
) -> uuid.UUID:
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


async def test_a_score_is_read_back_with_its_explanation(session: AsyncSession) -> None:
    endpoint = await _endpoint(session)
    await record_risk(
        session,
        entity_id=endpoint,
        score=0.82,
        model_version="entity-risk@test",
        valid_from=DAY0,
        factors=FACTORS,
    )

    assessment = await risk_as_of(session, entity_id=endpoint, as_of=DAY0)

    assert assessment is not None
    assert assessment.raw_score == pytest.approx(0.82)
    assert assessment.score == pytest.approx(0.82), "no elapsed time, no decay"
    assert len(assessment.factors) == 2
    assert "7 unrelated complaints" in assessment.factors[0].detail


async def test_risk_decays_without_a_rescoring_job(session: AsyncSession) -> None:
    """Decay is applied at read, so nothing has to run for this to be true."""
    endpoint = await _endpoint(session)
    await record_risk(
        session,
        entity_id=endpoint,
        score=0.8,
        model_version="entity-risk@test",
        valid_from=DAY0,
        factors=FACTORS,
    )

    # CASH_OUT_ENDPOINT half-life is 120 days.
    later = await risk_as_of(
        session, entity_id=endpoint, as_of=DAY0 + timedelta(days=120)
    )

    assert later is not None
    assert later.score == pytest.approx(0.4)
    assert later.raw_score == pytest.approx(0.8), "the recorded score is not rewritten"
    assert later.is_stale is False, "exactly half is not yet more than half"

    much_later = await risk_as_of(
        session, entity_id=endpoint, as_of=DAY0 + timedelta(days=300)
    )
    assert much_later is not None
    assert much_later.is_stale is True


async def test_a_later_score_is_invisible_to_an_earlier_as_of(
    session: AsyncSession,
) -> None:
    """The same point-in-time rule the feature store and graph traversal follow."""
    endpoint = await _endpoint(session)
    await record_risk(
        session,
        entity_id=endpoint,
        score=0.2,
        model_version="v1",
        valid_from=DAY0,
        factors=FACTORS,
    )
    await record_risk(
        session,
        entity_id=endpoint,
        score=0.9,
        model_version="v1",
        valid_from=DAY0 + 2 * MONTH,
        factors=FACTORS,
    )

    early = await risk_as_of(session, entity_id=endpoint, as_of=DAY0 + MONTH)

    assert early is not None
    assert early.raw_score == pytest.approx(0.2), "a prediction made in month 1 saw 0.2"


async def test_an_unscored_entity_returns_none_not_zero(session: AsyncSession) -> None:
    """ "We have not looked" and "we looked and found nothing" are different.

    Substituting 0.0 turns the first into the second, and an investigator
    reading a confident zero on an entity nobody assessed is being misled.
    """
    endpoint = await _endpoint(session)

    assert await risk_as_of(session, entity_id=endpoint, as_of=DAY0) is None


async def test_scores_are_appended_never_updated(session: AsyncSession) -> None:
    endpoint = await _endpoint(session)
    for i, score in enumerate((0.3, 0.5, 0.9)):
        await record_risk(
            session,
            entity_id=endpoint,
            score=score,
            model_version="v1",
            valid_from=DAY0 + i * MONTH,
            factors=FACTORS,
        )

    count = await session.execute(
        text(
            "SELECT count(*) FROM entity.entity_risk_score WHERE canonical_entity_id = :e"
        ),
        {"e": endpoint},
    )
    assert count.scalar_one() == 3, "history is the product, not a side effect"


# --------------------------------------------------------------------------
# "When did this endpoint become risky?"
# --------------------------------------------------------------------------


async def test_the_answer_is_the_start_of_the_current_episode(
    session: AsyncSession,
) -> None:
    """Not the first time it ever crossed.

    An endpoint flagged once, quiet for a year, then flagged again last month
    became risky *last month*. Answering with the older date sends an
    investigator looking for a year-old pattern that is not there.
    """
    endpoint = await _endpoint(session)
    long_ago = DAY0
    quiet = DAY0 + timedelta(days=200)
    flagged_again = DAY0 + timedelta(days=400)

    await record_risk(
        session,
        entity_id=endpoint,
        score=0.85,
        model_version="v1",
        valid_from=long_ago,
        factors=FACTORS,
    )
    await record_risk(
        session,
        entity_id=endpoint,
        score=0.10,
        model_version="v1",
        valid_from=quiet,
        factors=FACTORS,
    )
    await record_risk(
        session,
        entity_id=endpoint,
        score=0.88,
        model_version="v1",
        valid_from=flagged_again,
        factors=FACTORS,
    )

    answer = await became_risky_at(
        session,
        entity_id=endpoint,
        threshold=0.7,
        as_of=flagged_again + timedelta(days=5),
    )

    assert answer == flagged_again


async def test_a_sustained_episode_reports_its_earliest_assessment(
    session: AsyncSession,
) -> None:
    endpoint = await _endpoint(session)
    first = DAY0
    for i in range(3):
        await record_risk(
            session,
            entity_id=endpoint,
            score=0.9,
            model_version="v1",
            valid_from=DAY0 + i * timedelta(days=20),
            factors=FACTORS,
        )

    answer = await became_risky_at(
        session, entity_id=endpoint, threshold=0.7, as_of=DAY0 + timedelta(days=45)
    )

    assert answer == first


async def test_an_entity_below_threshold_now_is_not_risky(
    session: AsyncSession,
) -> None:
    endpoint = await _endpoint(session)
    await record_risk(
        session,
        entity_id=endpoint,
        score=0.9,
        model_version="v1",
        valid_from=DAY0,
        factors=FACTORS,
    )
    await record_risk(
        session,
        entity_id=endpoint,
        score=0.2,
        model_version="v1",
        valid_from=DAY0 + MONTH,
        factors=FACTORS,
    )

    assert (
        await became_risky_at(
            session, entity_id=endpoint, threshold=0.7, as_of=DAY0 + 2 * MONTH
        )
        is None
    )


async def test_an_episode_broken_by_decay_alone_does_not_stay_open(
    session: AsyncSession,
) -> None:
    """The subtle case, and the reason decay is applied to episode boundaries.

    Two assessments, both above threshold when made, separated by long enough
    that the first had decayed well below it before the second arrived. Treating
    that as one continuous episode would report the endpoint as risky since the
    first date — through a year in which the system's own view of it was that it
    was not.
    """
    endpoint = await _endpoint(session, kind="ACCOUNT")  # 30-day half-life
    first = DAY0
    second = DAY0 + timedelta(days=365)

    await record_risk(
        session,
        entity_id=endpoint,
        score=0.9,
        model_version="v1",
        valid_from=first,
        factors=FACTORS,
    )
    await record_risk(
        session,
        entity_id=endpoint,
        score=0.9,
        model_version="v1",
        valid_from=second,
        factors=FACTORS,
    )

    answer = await became_risky_at(
        session, entity_id=endpoint, threshold=0.7, as_of=second + timedelta(days=1)
    )

    assert answer == second, "the first assessment had long since decayed away"


async def test_never_scored_has_no_answer(session: AsyncSession) -> None:
    endpoint = await _endpoint(session)

    assert (
        await became_risky_at(session, entity_id=endpoint, threshold=0.7, as_of=DAY0)
        is None
    )
