"""Risk attaches to behaviour, never to who someone is (master spec §3, §22.2).

Spec §22.2 requires this to be "enforced by a failing test, not by promise", and
`docs/NON-GOALS.md` makes it the line the whole project is defined against:
ATLAS forecasts the cash-out leg of reported fraud — a logistics prediction about
criminal infrastructure — and never scores individuals.

The check runs at the write boundary rather than at review time, because the
realistic way a protected attribute enters a model is not somebody deciding to
use caste. It is a feature named `applicant_community` arriving from a
well-meaning connector and nobody reading the diff closely.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from atlas.entity.risk import RiskFactor, record_risk
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio

DAY0 = datetime(2026, 2, 2, 9, 0, tzinfo=UTC)

LEGITIMATE = RiskFactor(
    name="distinct_complaints_30d",
    weight=0.6,
    detail="7 unrelated complaints reached this endpoint in 30 days",
)


async def _entity(session: AsyncSession) -> uuid.UUID:
    entity_id = uuid.uuid4()
    await session.execute(
        text(
            "INSERT INTO entity.canonical_entity "
            "(id, public_ref, kind, attributes, observed_at, source_system, classification) "
            "VALUES (:id, :ref, 'CASH_OUT_ENDPOINT', '{}'::jsonb, :obs, 'test', 'SENSITIVE')"
        ),
        {"id": entity_id, "ref": uuid.uuid4().hex[:16], "obs": DAY0},
    )
    return entity_id


@pytest.mark.parametrize(
    "factor_name",
    [
        "religion",
        "applicant_caste",
        "surname_cluster",  # the strongest caste proxy available here
        "reservation_category",
        "mother_tongue_group",
        "place_of_birth_district",
    ],
)
async def test_a_prohibited_factor_cannot_be_persisted(
    session: AsyncSession, factor_name: str
) -> None:
    entity_id = await _entity(session)

    with pytest.raises(ValueError, match="protected attributes or proxies"):
        await record_risk(
            session,
            entity_id=entity_id,
            score=0.7,
            model_version="v1",
            valid_from=DAY0,
            factors=(
                LEGITIMATE,
                RiskFactor(name=factor_name, weight=0.3, detail="a stated quantity"),
            ),
        )


async def test_the_rejection_is_loud_rather_than_a_silent_drop(
    session: AsyncSession,
) -> None:
    """Dropping the factor quietly would be worse than either extreme.

    The score would still have been *computed* from a protected attribute, while
    the stored explanation looked clean — a model that discriminates and an
    audit trail that says it did not.
    """
    entity_id = await _entity(session)

    with pytest.raises(ValueError):
        await record_risk(
            session,
            entity_id=entity_id,
            score=0.7,
            model_version="v1",
            valid_from=DAY0,
            factors=(RiskFactor(name="caste_group", weight=1.0, detail="x"),),
        )

    count = await session.execute(
        text(
            "SELECT count(*) FROM entity.entity_risk_score WHERE canonical_entity_id = :e"
        ),
        {"e": entity_id},
    )
    assert count.scalar_one() == 0, "nothing may be written when a factor is rejected"


async def test_behavioural_factors_are_accepted(session: AsyncSession) -> None:
    """The gate above is only meaningful if legitimate factors get through.

    A check that rejected everything would pass every test in this file while
    making entity risk unusable.
    """
    entity_id = await _entity(session)

    await record_risk(
        session,
        entity_id=entity_id,
        score=0.7,
        model_version="v1",
        valid_from=DAY0,
        factors=(
            LEGITIMATE,
            RiskFactor(
                name="community_detection_cluster_size",
                weight=0.2,
                detail="sits in a 34-node cluster detected on shared beneficiaries",
            ),
            RiskFactor(
                name="aeps_biometric_retry_rate",
                weight=0.2,
                detail="biometric retries ran at 3.2x this agent's own 90-day median",
            ),
        ),
    )

    count = await session.execute(
        text(
            "SELECT count(*) FROM entity.entity_risk_score WHERE canonical_entity_id = :e"
        ),
        {"e": entity_id},
    )
    assert count.scalar_one() == 1
