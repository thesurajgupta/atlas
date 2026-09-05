"""As-of reads against the feature store (master spec §19.1).

Every function here takes an ``as_of`` and refuses to work without one. That is
the entire design: a read with no temporal bound is the bug this module exists
to make impossible, and a default of "now" would turn the parameter into a
formality every caller satisfies without meaning to.

The allow-list in :func:`assert_no_prohibited_features` is gate 19.4 at the
feature boundary rather than downstream — a feature derived from an artefact
edge is rejected where it is requested, not filtered out after a model has
already seen it.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from atlas.core.fairness import find_prohibited

#: Feature-name prefixes that may never enter a feature vector (§19.4).
#:
#: A `Prediction` node linked to a `Case` is investigative context for a human.
#: A model that can traverse to its own prior output manufactures confidence
#: from it, and the resulting self-agreement is indistinguishable from skill in
#: every metric we compute.
PROHIBITED_FEATURE_PREFIXES: frozenset[str] = frozenset(
    {
        "artefact_",
        "prediction_",
        "alert_",
        "case_",
        "intervention_",
        # Anything derived from the answer key. Nothing should be able to
        # produce these — atlas_features has no grant on `truth` — but naming
        # them means a hand-written feature that smuggles one in is rejected
        # rather than merely improbable.
        "truth_",
        "label_",
        "cash_out_actual_",
    }
)


@dataclass(frozen=True)
class FeatureVector:
    """Features for one subject, as they stood at ``as_of``.

    ``as_of`` travels with the values rather than being remembered by the
    caller. A vector separated from its timestamp cannot be checked, and the
    check is the only thing that makes it trustworthy.
    """

    subject_kind: str
    subject_id: uuid.UUID
    as_of: datetime
    values: dict[str, float]
    pipeline_versions: dict[str, str]

    def __getitem__(self, name: str) -> float:
        return self.values[name]

    def __contains__(self, name: str) -> bool:
        return name in self.values


class ProhibitedFeatureError(ValueError):
    """Raised when a requested feature may not enter a feature vector."""


def assert_no_prohibited_features(feature_names: Sequence[str]) -> None:
    """Reject artefact-derived, truth-derived and protected-attribute features.

    Raised rather than filtered. Dropping a prohibited feature silently would
    let a caller believe it received what it asked for, and the resulting vector
    would differ from the requested one in a way nothing downstream could see.
    """
    prohibited = sorted(
        name
        for name in feature_names
        if any(name.startswith(prefix) for prefix in PROHIBITED_FEATURE_PREFIXES)
    )
    if prohibited:
        raise ProhibitedFeatureError(
            f"features derived from artefacts or ground truth may never enter a "
            f"feature vector (spec §19.4): {prohibited}"
        )

    protected = find_prohibited(feature_names)
    if protected:
        raise ProhibitedFeatureError(
            f"features name protected attributes or close proxies (spec §22.2): {protected}"
        )


# The as-of join.
#
# DISTINCT ON takes the first row per group after ORDER BY, so ordering by
# observed_at DESC inside each (subject, feature) group selects the most recent
# value *at or before* as_of. The alternative — a correlated MAX subquery — is
# both slower and easier to get subtly wrong when two rows share a timestamp.
#
# The bound is `<=`, not `<`: a fact knowable at exactly the prediction instant
# was knowable. Excluding it would understate what the system had, which is a
# different error from leakage but still a wrong answer.
_AS_OF_SQL = text(
    """
SELECT DISTINCT ON (subject_id, feature_name)
       subject_id, feature_name, value, pipeline_version, observed_at
FROM features.feature_value
WHERE subject_kind = :subject_kind
  AND subject_id = ANY(:subject_ids)
  AND feature_name IN :feature_names
  AND observed_at <= :as_of
ORDER BY subject_id, feature_name, observed_at DESC
"""
).bindparams(bindparam("feature_names", expanding=True))


async def read_as_of(
    session: AsyncSession,
    *,
    subject_kind: str,
    subject_ids: Sequence[uuid.UUID],
    feature_names: Sequence[str],
    as_of: datetime,
) -> dict[uuid.UUID, FeatureVector]:
    """Feature vectors for several subjects, as they stood at ``as_of``.

    Subjects with no features at that instant are absent from the result rather
    than present with an empty vector. "We had no features for this yet" and
    "we had features and they were all zero" are different facts, and a model
    trained on the second when the first was true has learned from a value
    nobody ever observed.
    """
    if as_of.tzinfo is None:
        raise ValueError("as_of must be timezone-aware; naive datetimes are ambiguous")
    assert_no_prohibited_features(feature_names)

    if not subject_ids or not feature_names:
        return {}

    result = await session.execute(
        _AS_OF_SQL,
        {
            "subject_kind": subject_kind,
            "subject_ids": list(subject_ids),
            "feature_names": list(feature_names),
            "as_of": as_of,
        },
    )

    vectors: dict[uuid.UUID, FeatureVector] = {}
    for row in result:
        m = row._mapping
        subject_id = m["subject_id"]
        existing = vectors.get(subject_id)
        if existing is None:
            existing = FeatureVector(
                subject_kind=subject_kind,
                subject_id=subject_id,
                as_of=as_of,
                values={},
                pipeline_versions={},
            )
            vectors[subject_id] = existing
        existing.values[m["feature_name"]] = float(m["value"])
        existing.pipeline_versions[m["feature_name"]] = m["pipeline_version"]

    return vectors


async def write_feature(
    session: AsyncSession,
    *,
    subject_kind: str,
    subject_id: uuid.UUID,
    feature_name: str,
    value: float,
    observed_at: datetime,
    pipeline_version: str,
) -> None:
    """Append one feature value.

    Rejects a prohibited name at write time as well as at read time. Catching it
    only on read would leave the row sitting in the store, one query away from
    a caller who does not go through :func:`read_as_of`.
    """
    if observed_at.tzinfo is None:
        raise ValueError("observed_at must be timezone-aware")
    assert_no_prohibited_features([feature_name])

    await session.execute(
        text(
            "INSERT INTO features.feature_value "
            "(id, subject_kind, subject_id, feature_name, value, pipeline_version, observed_at) "
            "VALUES (:id, :kind, :sid, :name, :value, :pv, :obs) "
            "ON CONFLICT ON CONSTRAINT uq_feature_value_point_in_time DO NOTHING"
        ),
        {
            "id": uuid.uuid4(),
            "kind": subject_kind,
            "sid": subject_id,
            "name": feature_name,
            "value": value,
            "pv": pipeline_version,
            "obs": observed_at,
        },
    )
