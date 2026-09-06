"""Entity resolution: blocking, matching, clustering (master spec §13, ADR-013).

A system that cannot tell that two accounts belong to the same actor cannot
detect a mule network, and mule networks are the entire subject. This is the
backbone, not a helper.

Three stages, for a reason that only matters at scale:

  * **Blocking** — cheap candidate keys, so we never compare all pairs. At
    national volume, all-pairs is not slow, it is impossible.
  * **Matching** — scored comparison within a block, against a documented
    threshold.
  * **Clustering** — transitive closure into a canonical entity, recorded as a
    reversible decision.

Every merge is a *hypothesis*. When it turns out wrong it must be splittable
without destroying the cases, alerts and audit records attached to it — an
unrecoverable wrong merge in a law-enforcement context is a serious harm, not an
inconvenience.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from atlas.core.clock import utc_now
from atlas.entity.models import CanonicalEntity, EntityResolutionDecision

#: A pair scoring at or above this is merged automatically. Chosen to be
#: conservative: a false merge is far more damaging than a missed one, because a
#: missed link can still be found later while a wrong merge contaminates every
#: case attached to it.
AUTO_MERGE_THRESHOLD = 0.85

#: Between this and AUTO_MERGE_THRESHOLD a pair is recorded for human review
#: rather than merged or discarded silently.
REVIEW_THRESHOLD = 0.60


@dataclass(frozen=True)
class EntitySignals:
    """The identifying facts we have about one observed entity.

    Deliberately narrow. Adding a field here means it can influence a merge, so
    anything correlated with a protected attribute must never appear — that is
    checked by the fairness gate, not left to memory (§22.2).
    """

    kind: str
    account_number: str | None = None
    ifsc: str | None = None
    phone: str | None = None
    device_id: str | None = None
    kyc_district: str | None = None
    endpoint_ref: str | None = None

    def blocking_keys(self) -> set[str]:
        """Cheap keys that put plausibly-matching entities in the same bucket.

        A key must be *narrow enough to be useful* and *stable enough to survive
        the noise real data carries*. A full account number is both. A district
        alone is neither — it would put a whole city in one block.
        """
        keys: set[str] = set()
        if self.account_number:
            digits = _digits(self.account_number)
            if len(digits) >= 6:
                # Last six digits: survives formatting differences and leading-zero
                # loss, which are the two ways account numbers actually differ
                # between systems describing the same account.
                keys.add(f"acct:{digits[-6:]}")
        if self.phone:
            digits = _digits(self.phone)
            if len(digits) >= 10:
                keys.add(f"phone:{digits[-10:]}")
        if self.device_id:
            keys.add(f"device:{self.device_id.strip().lower()}")
        if self.endpoint_ref:
            keys.add(f"endpoint:{self.endpoint_ref.strip().lower()}")
        return keys


@dataclass(frozen=True)
class MatchScore:
    score: float
    evidence: dict[str, Any] = field(default_factory=dict)

    @property
    def should_merge(self) -> bool:
        return self.score >= AUTO_MERGE_THRESHOLD

    @property
    def needs_review(self) -> bool:
        return REVIEW_THRESHOLD <= self.score < AUTO_MERGE_THRESHOLD


def _digits(value: str) -> str:
    return re.sub(r"\D", "", value)


def score_pair(left: EntitySignals, right: EntitySignals) -> MatchScore:
    """Score how likely two observations describe the same entity.

    Weights reflect how *identifying* each signal is, not how often it is
    present. An exact account number plus matching IFSC is close to conclusive.
    A shared district is barely evidence at all — millions of people share one —
    so it contributes only in combination.
    """
    if left.kind != right.kind:
        return MatchScore(0.0, {"reason": "different entity kinds"})

    evidence: dict[str, Any] = {}
    score = 0.0

    if left.account_number and right.account_number:
        if _digits(left.account_number) == _digits(right.account_number):
            score += 0.70
            evidence["account_number"] = "exact"
            if left.ifsc and right.ifsc and left.ifsc.upper() == right.ifsc.upper():
                # Account numbers are only unique within a bank, so IFSC is what
                # turns a strong signal into a near-certain one.
                score += 0.25
                evidence["ifsc"] = "exact"
        else:
            # Different account numbers are positive evidence *against* a match,
            # not merely absent evidence for one.
            score -= 0.40
            evidence["account_number"] = "conflict"

    if left.phone and right.phone and _digits(left.phone)[-10:] == _digits(right.phone)[-10:]:
        # Weighted to land in the review band on its own. A phone shared between
        # accounts is among the strongest links available in Indian mule
        # networks — but families share handsets too, so it earns a human look
        # rather than an automatic merge.
        score += 0.60
        evidence["phone"] = "exact"

    if left.device_id and right.device_id and left.device_id == right.device_id:
        score += 0.35
        evidence["device_id"] = "exact"

    if left.endpoint_ref and right.endpoint_ref and left.endpoint_ref == right.endpoint_ref:
        score += 0.60
        evidence["endpoint_ref"] = "exact"

    if left.kyc_district and right.kyc_district and left.kyc_district == right.kyc_district:
        # Weak on its own; meaningful only alongside something stronger.
        score += 0.05
        evidence["kyc_district"] = "same"

    return MatchScore(max(0.0, min(1.0, score)), evidence)


def block(candidates: dict[uuid.UUID, EntitySignals]) -> dict[str, set[uuid.UUID]]:
    """Group candidates by shared blocking key.

    Only pairs sharing at least one key are ever compared. Without this, national
    volume makes matching quadratic and therefore impossible.
    """
    blocks: dict[str, set[uuid.UUID]] = {}
    for entity_id, signals in candidates.items():
        for key in signals.blocking_keys():
            blocks.setdefault(key, set()).add(entity_id)
    return {key: ids for key, ids in blocks.items() if len(ids) > 1}


def candidate_pairs(
    candidates: dict[uuid.UUID, EntitySignals],
) -> set[tuple[uuid.UUID, uuid.UUID]]:
    """Every pair worth scoring. Ordered so a pair appears once, not twice."""
    pairs: set[tuple[uuid.UUID, uuid.UUID]] = set()
    for ids in block(candidates).values():
        ordered = sorted(ids)
        for i, left in enumerate(ordered):
            for right in ordered[i + 1 :]:
                pairs.add((left, right))
    return pairs


def cluster(
    candidates: dict[uuid.UUID, EntitySignals],
) -> tuple[list[set[uuid.UUID]], list[tuple[uuid.UUID, uuid.UUID, MatchScore]]]:
    """Transitive closure over merge-worthy pairs.

    Returns the clusters, and the pairs that scored into the review band. Those
    are surfaced rather than dropped: a near-miss is exactly where a human adds
    value, and silently discarding them hides the cases most worth looking at.
    """
    parent: dict[uuid.UUID, uuid.UUID] = {i: i for i in candidates}

    def find(node: uuid.UUID) -> uuid.UUID:
        while parent[node] != node:
            parent[node] = parent[parent[node]]
            node = parent[node]
        return node

    def union(a: uuid.UUID, b: uuid.UUID) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for_review: list[tuple[uuid.UUID, uuid.UUID, MatchScore]] = []
    for left, right in candidate_pairs(candidates):
        result = score_pair(candidates[left], candidates[right])
        if result.should_merge:
            union(left, right)
        elif result.needs_review:
            for_review.append((left, right, result))

    grouped: dict[uuid.UUID, set[uuid.UUID]] = {}
    for entity_id in candidates:
        grouped.setdefault(find(entity_id), set()).add(entity_id)
    return list(grouped.values()), for_review


async def record_decision(
    session: AsyncSession,
    *,
    canonical_entity_id: uuid.UUID,
    decision: str,
    method: str,
    score: float | None,
    evidence: dict[str, Any],
    decided_at: datetime | None = None,
) -> EntityResolutionDecision:
    """Record a merge or split so it can be reversed and reconstructed.

    ``decided_at`` is what makes point-in-time entity joins possible. A merge
    made today must not change what a prediction made last week could see —
    leakage gate 4 (§19.3), and the one gate that no rule violation triggers.
    """
    record = EntityResolutionDecision(
        canonical_entity_id=canonical_entity_id,
        decision=decision,
        decided_at=decided_at or utc_now(),
        method=method,
        score=score,
        evidence=evidence,
    )
    session.add(record)
    await session.flush()
    return record


async def entity_as_of(
    session: AsyncSession, canonical_entity_id: uuid.UUID, as_of: datetime
) -> list[EntityResolutionDecision]:
    """The resolution decisions that had been made by ``as_of``.

    Feature pipelines must read the entity graph as it stood at prediction time,
    never as it stands now. Reading current state would let a model know a
    linkage that had not yet been discovered — inflating recall on exactly the
    mule networks that matter most, with nothing visibly wrong.
    """
    result = await session.execute(
        select(EntityResolutionDecision)
        .where(
            EntityResolutionDecision.canonical_entity_id == canonical_entity_id,
            EntityResolutionDecision.decided_at <= as_of,
        )
        .order_by(EntityResolutionDecision.decided_at)
    )
    return list(result.scalars())


async def get_or_create_canonical(
    session: AsyncSession, *, public_ref: str, kind: str, attributes: dict[str, Any]
) -> CanonicalEntity:
    existing = await session.execute(
        select(CanonicalEntity).where(CanonicalEntity.public_ref == public_ref)
    )
    found = existing.scalar_one_or_none()
    if found is not None:
        return found

    entity = CanonicalEntity(
        public_ref=public_ref,
        kind=kind,
        attributes=attributes,
        observed_at=utc_now(),
        source_system="entity-resolution",
    )
    session.add(entity)
    await session.flush()
    return entity


async def public_refs_for(
    session: AsyncSession, *, entity_ids: Sequence[uuid.UUID], as_of: datetime
) -> dict[uuid.UUID, str]:
    """Map canonical entity ids to their business references, as of an instant.

    Exists so callers above this module can cross from an entity id to whatever
    the owning system calls the same thing, without reading
    ``entity.canonical_entity`` themselves (ADR-009).

    Bounded by ``observed_at <= as_of`` like every other read here: an entity
    resolved last week was not available to a reconstruction of last month, and
    silently including it would let a later merge change what an earlier
    prediction could see (leakage gate 4, §19.3).
    """
    if as_of.tzinfo is None:
        raise ValueError("as_of must be timezone-aware; naive datetimes are ambiguous")
    if not entity_ids:
        return {}

    result = await session.execute(
        select(CanonicalEntity.id, CanonicalEntity.public_ref).where(
            CanonicalEntity.id.in_(list(entity_ids)),
            CanonicalEntity.observed_at <= as_of,
        )
    )
    return {row[0]: row[1] for row in result}


async def entity_ids_for(
    session: AsyncSession, *, public_refs: Sequence[str], as_of: datetime
) -> dict[str, uuid.UUID]:
    """Map business references to canonical entity ids, as of an instant.

    The inverse of :func:`public_refs_for`, and needed for the same reason:
    callers above this module cross between an owning system's reference and an
    entity id without reading ``entity.canonical_entity`` themselves (ADR-009).

    A reference with no canonical entity is absent rather than an error. An
    endpoint that has never appeared in a transaction has no entity yet, which is
    a normal state and not a data-quality problem.
    """
    if as_of.tzinfo is None:
        raise ValueError("as_of must be timezone-aware; naive datetimes are ambiguous")
    if not public_refs:
        return {}

    result = await session.execute(
        select(CanonicalEntity.public_ref, CanonicalEntity.id).where(
            CanonicalEntity.public_ref.in_(list(public_refs)),
            CanonicalEntity.observed_at <= as_of,
        )
    )
    return {row[0]: row[1] for row in result}
