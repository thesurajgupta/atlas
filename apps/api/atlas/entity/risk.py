"""Dynamic entity risk (master spec §13.2, §15.3).

Every entity type carries a score, not only mule accounts — a cash-out endpoint,
a BC agent, a device shared across otherwise unlinked accounts. Spec §13.3 makes
the point that this *is* Tier 3, not a bolt-on classifier: Tiers 1 and 2 consume
it, and the outbound bank package is built from it.

Four properties, each of which changes the shape of the code:

**Versioned.** Scores are appended, never updated. "When did this endpoint become
risky?" is the question investigators actually ask, and a current-value column
cannot answer it.

**Decayed at read, not by a job.** An entity risky in 2024 and quiet since is not
risky today; a system that cannot forget eventually flags everything. Decay is
applied as a function of elapsed time when a score is read, which means there is
no re-scoring job to fall behind, and a historical reconstruction is exact
rather than dependent on when a job last ran.

**Explained.** Factors carry a sentence with a quantity and a window, never a
bare coefficient. A score an investigator cannot interrogate is one they will
either over-trust or ignore, and both are worse than no score.

**Never derived from who someone is.** Factor names are checked against
``atlas.core.fairness`` at write time, so a prohibited factor cannot be
persisted at all (§3, §22.2).
"""

from __future__ import annotations

import json
import math
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from atlas.core.fairness import find_prohibited

# Half-lives by entity kind. **These are placeholders and should be read as
# such.** They encode one defensible ordering — an account's behaviour goes
# stale faster than cash-out infrastructure, because a mule account is used and
# abandoned while a complicit BC agent is a standing facility — but the
# magnitudes are chosen, not fitted.
#
# They should be set from the observed interval between repeat use of the same
# entity once the simulator produces it, and the number that matters is how long
# an endpoint stays predictive, which nobody here knows yet.
DEFAULT_HALF_LIVES: dict[str, timedelta] = {
    "ACCOUNT": timedelta(days=30),
    "WALLET": timedelta(days=30),
    "DEVICE": timedelta(days=45),
    "NETWORK_INDICATOR": timedelta(days=45),
    "BC_AGENT": timedelta(days=120),
    "CASH_OUT_ENDPOINT": timedelta(days=120),
    "MERCHANT": timedelta(days=120),
}
FALLBACK_HALF_LIFE = timedelta(days=60)


@dataclass(frozen=True)
class RiskFactor:
    """One contributing factor, in a form an investigator can argue with."""

    name: str
    weight: float
    detail: str

    def __post_init__(self) -> None:
        if not self.detail.strip():
            raise ValueError(
                f"risk factor {self.name!r} has no detail; a factor without a "
                f"stated quantity and window is not an explanation"
            )


@dataclass(frozen=True)
class RiskAssessment:
    """A score as it stands at a given instant.

    ``score`` is an **ordering signal on [0, 1], not a probability.** Nothing
    here has been calibrated against outcomes, so 0.8 does not mean "80% of such
    endpoints are used for cash-out" — it means this entity ranks above one
    scored 0.6. Calibration lands with the isotonic step in Phase 8.4; until
    then the API contract says ``score``, and any UI rendering it as a
    percentage is wrong (CLAUDE.md rule 4).

    ``raw_score`` and ``recorded_at`` travel alongside so a reader can always see
    how much of the difference is decay rather than assessment.
    """

    entity_id: uuid.UUID
    score: float
    raw_score: float
    recorded_at: datetime
    as_of: datetime
    model_version: str
    factors: tuple[RiskFactor, ...]

    @property
    def age(self) -> timedelta:
        return self.as_of - self.recorded_at

    @property
    def is_stale(self) -> bool:
        """Whether decay has taken more than half the original score.

        A caller showing a decayed score should say so. "Risk 0.3" and "risk 0.3,
        down from 0.9, last assessed five months ago" call for different actions.
        """
        return self.raw_score > 0 and self.score < self.raw_score / 2


def decayed(raw_score: float, *, age: timedelta, half_life: timedelta) -> float:
    """Exponential decay of a score over elapsed time.

    Exponential rather than linear because a linear decay reaches exactly zero
    and then has to be clamped — and an entity's risk does not become *provably
    absent*, it becomes unsupported by recent evidence. Exponential decay
    approaches zero without asserting it.

    A negative age (reading a score as of before it was recorded) returns 0.0
    rather than amplifying it. That is a caller bug, and the safe reading of a
    bug is "we know nothing", not "we know a great deal".
    """
    if half_life <= timedelta(0):
        raise ValueError("half_life must be positive")
    if age < timedelta(0):
        return 0.0
    return raw_score * math.pow(0.5, age / half_life)


def half_life_for(kind: str) -> timedelta:
    return DEFAULT_HALF_LIVES.get(kind.upper(), FALLBACK_HALF_LIFE)


async def record_risk(
    session: AsyncSession,
    *,
    entity_id: uuid.UUID,
    score: float,
    model_version: str,
    valid_from: datetime,
    factors: tuple[RiskFactor, ...],
) -> uuid.UUID:
    """Append a score. Never updates an existing row.

    Rejects a prohibited factor name outright rather than dropping it. Silently
    discarding one would leave a score that was *computed* from a protected
    attribute while looking clean in the audit trail — the worst of both.
    """
    if not 0.0 <= score <= 1.0:
        raise ValueError(f"score must be in [0, 1], got {score}")
    if not factors:
        raise ValueError("a score with no factors cannot be explained, and so cannot be shown")

    prohibited = find_prohibited(f.name for f in factors)
    if prohibited:
        raise ValueError(
            f"risk factors name protected attributes or proxies: {prohibited}. "
            f"Risk attaches to observed behaviour, never to who someone is (spec §3, §22.2)."
        )

    row_id = uuid.uuid4()
    await session.execute(
        text(
            "INSERT INTO entity.entity_risk_score "
            "(id, canonical_entity_id, score, model_version, valid_from, contributing_factors) "
            "VALUES (:id, :eid, :score, :mv, :vf, CAST(:factors AS jsonb))"
        ),
        {
            "id": row_id,
            "eid": entity_id,
            "score": score,
            "mv": model_version,
            "vf": valid_from,
            "factors": _factors_json(factors),
        },
    )
    return row_id


def _factors_json(factors: tuple[RiskFactor, ...]) -> str:
    return json.dumps([{"name": f.name, "weight": f.weight, "detail": f.detail} for f in factors])


def _factors_from_json(raw: object) -> tuple[RiskFactor, ...]:
    if not isinstance(raw, list):
        return ()
    return tuple(
        RiskFactor(name=str(f["name"]), weight=float(f["weight"]), detail=str(f["detail"]))
        for f in raw
        if isinstance(f, dict) and {"name", "weight", "detail"} <= set(f)
    )


async def risk_as_of(
    session: AsyncSession,
    *,
    entity_id: uuid.UUID,
    as_of: datetime,
    half_life: timedelta | None = None,
) -> RiskAssessment | None:
    """The entity's risk as it stood at ``as_of``, with decay applied.

    Reads the latest score recorded at or before ``as_of`` — never a later one,
    which is the same point-in-time rule the feature store and the graph
    traversal follow. Returns ``None`` when the entity has never been scored;
    that is not zero risk, it is no assessment, and a caller substituting 0.0
    turns "we have not looked" into "we looked and found nothing".
    """
    result = await session.execute(
        text(
            "SELECT r.score, r.valid_from, r.model_version, r.contributing_factors, e.kind "
            "FROM entity.entity_risk_score r "
            "JOIN entity.canonical_entity e ON e.id = r.canonical_entity_id "
            "WHERE r.canonical_entity_id = :eid AND r.valid_from <= :as_of "
            "ORDER BY r.valid_from DESC LIMIT 1"
        ),
        {"eid": entity_id, "as_of": as_of},
    )
    row = result.first()
    if row is None:
        return None

    m = row._mapping
    hl = half_life or half_life_for(str(m["kind"]))
    raw = float(m["score"])
    recorded_at = m["valid_from"]

    return RiskAssessment(
        entity_id=entity_id,
        score=decayed(raw, age=as_of - recorded_at, half_life=hl),
        raw_score=raw,
        recorded_at=recorded_at,
        as_of=as_of,
        model_version=str(m["model_version"]),
        factors=_factors_from_json(m["contributing_factors"]),
    )


async def became_risky_at(
    session: AsyncSession,
    *,
    entity_id: uuid.UUID,
    threshold: float,
    as_of: datetime,
    half_life: timedelta | None = None,
) -> datetime | None:
    """When the entity's *current* risk episode began, or ``None`` if it is not risky.

    The literal question is "when did this endpoint become risky?", and the
    literal answer — the first time it ever crossed — is usually the wrong one.
    An endpoint flagged once in 2024, quiet for a year, and flagged again last
    week became risky *last week*. Reporting 2024 would send an investigator
    looking for a year-old pattern that is not there.

    So this walks back from ``as_of`` through consecutive assessments and stops
    where the run above ``threshold`` began. Decay is applied at the end of each
    assessment's validity window, not just at the moment it was recorded: a score
    that started at 0.9 and had decayed below the threshold before the next
    assessment did not hold the episode open.
    """
    result = await session.execute(
        text(
            "SELECT r.score, r.valid_from, e.kind "
            "FROM entity.entity_risk_score r "
            "JOIN entity.canonical_entity e ON e.id = r.canonical_entity_id "
            "WHERE r.canonical_entity_id = :eid AND r.valid_from <= :as_of "
            "ORDER BY r.valid_from ASC"
        ),
        {"eid": entity_id, "as_of": as_of},
    )
    rows = list(result)
    if not rows:
        return None

    hl = half_life or half_life_for(str(rows[0]._mapping["kind"]))

    # Each assessment holds until the next one replaces it; the last holds until
    # ``as_of``. An assessment counts as "above" only if it is still above at the
    # end of that window, once decay has been applied.
    above: list[tuple[datetime, bool]] = []
    for i, row in enumerate(rows):
        m = row._mapping
        valid_from: datetime = m["valid_from"]
        window_end = rows[i + 1]._mapping["valid_from"] if i + 1 < len(rows) else as_of
        end_score = decayed(float(m["score"]), age=window_end - valid_from, half_life=hl)
        above.append((valid_from, end_score >= threshold))

    if not above[-1][1]:
        return None

    episode_start = above[-1][0]
    for valid_from, is_above in reversed(above[:-1]):
        if not is_above:
            break
        episode_start = valid_from
    return episode_start
