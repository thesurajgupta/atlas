"""Leakage gates 1, 4 and 5 at the feature store (master spec §19.1, §19.4, §19.5).

Three mechanisms, tested here because this is where all three can actually be
defeated:

* **as-of correctness** — no row whose ``observed_at`` is after the prediction
  timestamp may be read;
* **temporal shuffle** — corrupting everything after ``as_of`` must not change
  a single value. If it does, something read the future;
* **canary** — a feature planted only in the future must never surface.

The shuffle is the one worth understanding. As-of correctness can be asserted
directly, but only against the rows a test author thought to create. The shuffle
asserts a property instead: whatever the query does, it cannot be *sensitive* to
data it should not see. It catches reads nobody wrote a case for.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from atlas.features.store import ProhibitedFeatureError, read_as_of, write_feature
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.leakage

DAY0 = datetime(2026, 4, 1, 9, 0, tzinfo=UTC)
AS_OF = DAY0 + timedelta(days=3)
PIPELINE = "features@test"

FEATURES = ("inbound_velocity_24h", "distinct_counterparties_7d", "fan_out_ratio")


async def _subject(session: AsyncSession) -> uuid.UUID:
    """A feature subject. Nothing references it — `subject_id` carries no FK."""
    return uuid.uuid4()


async def _seed(session: AsyncSession, subject: uuid.UUID) -> None:
    """Values before, at, and after the as-of instant."""
    for offset_days, base in ((0, 1.0), (2, 2.0), (3, 3.0)):
        for i, name in enumerate(FEATURES):
            await write_feature(
                session,
                subject_kind="ENTITY",
                subject_id=subject,
                feature_name=name,
                value=base + i,
                observed_at=DAY0 + timedelta(days=offset_days),
                pipeline_version=PIPELINE,
            )
    # Strictly after as_of — must never be read.
    for i, name in enumerate(FEATURES):
        await write_feature(
            session,
            subject_kind="ENTITY",
            subject_id=subject,
            feature_name=name,
            value=900.0 + i,
            observed_at=AS_OF + timedelta(hours=1),
            pipeline_version=PIPELINE,
        )
    await session.flush()


# --------------------------------------------------------------------------
# Gate 1 — as-of correctness
# --------------------------------------------------------------------------


async def test_reads_the_latest_value_at_or_before_as_of(session: AsyncSession) -> None:
    subject = await _subject(session)
    await _seed(session, subject)

    vectors = await read_as_of(
        session,
        subject_kind="ENTITY",
        subject_ids=[subject],
        feature_names=FEATURES,
        as_of=AS_OF,
    )

    vector = vectors[subject]
    # The day-3 write lands exactly on as_of and is knowable at that instant.
    assert vector["inbound_velocity_24h"] == pytest.approx(3.0)
    assert vector["distinct_counterparties_7d"] == pytest.approx(4.0)
    assert vector["fan_out_ratio"] == pytest.approx(5.0)


async def test_a_value_written_after_as_of_is_never_read(session: AsyncSession) -> None:
    """The failure is silent when it happens: no error, just a better number."""
    subject = await _subject(session)
    await _seed(session, subject)

    vector = (
        await read_as_of(
            session,
            subject_kind="ENTITY",
            subject_ids=[subject],
            feature_names=FEATURES,
            as_of=AS_OF,
        )
    )[subject]

    assert all(value < 900.0 for value in vector.values.values()), (
        "a post-as_of value reached the feature vector; the model can read the future"
    )


async def test_the_same_read_later_does_see_it(session: AsyncSession) -> None:
    """Otherwise the assertion above would pass on a store that returns nothing."""
    subject = await _subject(session)
    await _seed(session, subject)

    vector = (
        await read_as_of(
            session,
            subject_kind="ENTITY",
            subject_ids=[subject],
            feature_names=FEATURES,
            as_of=AS_OF + timedelta(days=1),
        )
    )[subject]

    assert vector["inbound_velocity_24h"] == pytest.approx(900.0)


async def test_a_subject_with_no_features_is_absent_not_empty(
    session: AsyncSession,
) -> None:
    """ "We had nothing yet" and "we had zeros" are different facts.

    A model trained on the second when the first was true has learned from a
    value nobody ever observed.
    """
    known, unknown = await _subject(session), await _subject(session)
    await _seed(session, known)

    vectors = await read_as_of(
        session,
        subject_kind="ENTITY",
        subject_ids=[known, unknown],
        feature_names=FEATURES,
        as_of=AS_OF,
    )

    assert known in vectors
    assert unknown not in vectors


async def test_a_naive_as_of_is_rejected(session: AsyncSession) -> None:
    """A naive timestamp is ambiguous, and the ambiguity is a whole hour wide."""
    with pytest.raises(ValueError, match="timezone-aware"):
        await read_as_of(
            session,
            subject_kind="ENTITY",
            subject_ids=[uuid.uuid4()],
            feature_names=FEATURES,
            as_of=datetime(2026, 4, 1, 9, 0),  # noqa: DTZ001 — naive on purpose
        )


# --------------------------------------------------------------------------
# Gate 5 — temporal shuffle
# --------------------------------------------------------------------------


async def test_shuffling_everything_after_as_of_changes_nothing(
    session: AsyncSession,
) -> None:
    """The gate that catches reads nobody wrote a case for.

    Direct assertions only cover the rows a test author imagined. This asserts a
    property: whatever the query does internally, its output cannot be sensitive
    to data after ``as_of``. Any read of the future — a forgotten bound, a join
    that widens the window, an ``ORDER BY`` that reaches past it — changes a
    value here.
    """
    subject = await _subject(session)
    await _seed(session, subject)

    before = (
        await read_as_of(
            session,
            subject_kind="ENTITY",
            subject_ids=[subject],
            feature_names=FEATURES,
            as_of=AS_OF,
        )
    )[subject]

    # Corrupt every post-as_of row: new values, new ordering, new timestamps.
    await session.execute(
        text(
            "UPDATE features.feature_value "
            "SET value = value * -7.3, observed_at = observed_at + interval '11 hours' "
            "WHERE subject_id = :s AND observed_at > :as_of"
        ),
        {"s": subject, "as_of": AS_OF},
    )
    await session.flush()

    after = (
        await read_as_of(
            session,
            subject_kind="ENTITY",
            subject_ids=[subject],
            feature_names=FEATURES,
            as_of=AS_OF,
        )
    )[subject]

    assert after.values == before.values, (
        "changing post-as_of data changed the feature vector; the read is not "
        "point-in-time correct"
    )


# --------------------------------------------------------------------------
# Gate 5 — canary
# --------------------------------------------------------------------------


async def test_a_canary_planted_in_the_future_never_surfaces(
    session: AsyncSession,
) -> None:
    """A feature that exists only after ``as_of``.

    If a read ever returns it, the bound has failed in a way that the value
    assertions above might not catch — they compare numbers, and a number can
    coincide. A name cannot.
    """
    subject = await _subject(session)
    await _seed(session, subject)
    await write_feature(
        session,
        subject_kind="ENTITY",
        subject_id=subject,
        feature_name="canary_future_only",
        value=1.0,
        observed_at=AS_OF + timedelta(seconds=1),
        pipeline_version=PIPELINE,
    )
    await session.flush()

    vectors = await read_as_of(
        session,
        subject_kind="ENTITY",
        subject_ids=[subject],
        feature_names=[*FEATURES, "canary_future_only"],
        as_of=AS_OF,
    )

    assert "canary_future_only" not in vectors[subject], (
        "the canary reached a feature vector; something read past as_of"
    )


# --------------------------------------------------------------------------
# Gate 4 — artefact and ground-truth features are refused
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "name",
    [
        "artefact_linked_case_count",
        "prediction_prior_score",
        "alert_severity_last_7d",
        "case_status_code",
        "intervention_count",
        "truth_cash_out_endpoint",
        "label_actual_endpoint",
        "cash_out_actual_distance_km",
    ],
)
async def test_artefact_and_truth_features_are_refused(
    session: AsyncSession, name: str
) -> None:
    """Rejected where requested, not filtered downstream (§19.4).

    A model that can traverse to its own prior output manufactures confidence
    from it, and the resulting self-agreement is indistinguishable from skill in
    every metric this project computes.
    """
    with pytest.raises(ProhibitedFeatureError):
        await read_as_of(
            session,
            subject_kind="ENTITY",
            subject_ids=[uuid.uuid4()],
            feature_names=[name],
            as_of=AS_OF,
        )


async def test_a_protected_attribute_cannot_be_a_feature(session: AsyncSession) -> None:
    """Same list the entity-risk factors are checked against (§22.2)."""
    with pytest.raises(ProhibitedFeatureError, match="protected attributes"):
        await read_as_of(
            session,
            subject_kind="ENTITY",
            subject_ids=[uuid.uuid4()],
            feature_names=["applicant_religion"],
            as_of=AS_OF,
        )


async def test_a_prohibited_feature_cannot_even_be_written(
    session: AsyncSession,
) -> None:
    """Catching it only on read leaves the row in the store.

    One query away from a caller who does not go through ``read_as_of``.
    """
    with pytest.raises(ProhibitedFeatureError):
        await write_feature(
            session,
            subject_kind="ENTITY",
            subject_id=uuid.uuid4(),
            feature_name="truth_cash_out_endpoint",
            value=1.0,
            observed_at=DAY0,
            pipeline_version=PIPELINE,
        )


async def test_legitimate_behavioural_features_are_accepted(
    session: AsyncSession,
) -> None:
    """The gates above are only meaningful if ordinary features get through."""
    subject = await _subject(session)
    await write_feature(
        session,
        subject_kind="ENTITY",
        subject_id=subject,
        feature_name="community_detection_cluster_size",
        value=34.0,
        observed_at=DAY0,
        pipeline_version=PIPELINE,
    )
    await session.flush()

    vectors = await read_as_of(
        session,
        subject_kind="ENTITY",
        subject_ids=[subject],
        feature_names=["community_detection_cluster_size"],
        as_of=AS_OF,
    )
    assert vectors[subject]["community_detection_cluster_size"] == pytest.approx(34.0)
