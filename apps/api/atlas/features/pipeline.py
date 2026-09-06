"""Compute behavioural features into the point-in-time store (spec §19.1, §22).

`store.py` can read a feature vector as of an instant and refuses every
prohibited name. Nothing filled it. This does.

## What `observed_at` is set to, and why it is `as_of`

This is the only decision in the module that matters, so it is stated once here
rather than repeated at each write.

Every feature below is a **window ending at `as_of`** — "outbound transfers in
the seven days to Tuesday", "risk, decayed to Tuesday". A window that ends at
`as_of` cannot be computed before `as_of`, because the window is not closed
until then; and it needs nothing observed after `as_of`, because every input is
filtered to `observed_at <= as_of`. So the value becomes knowable at exactly
`as_of`, and that is what is written.

Two wrong answers this rules out:

* **`utc_now()`** — stamps a backfill of last Tuesday as knowable today, so the
  as-of read never returns it for any historical prediction. It does not leak;
  it silently empties the store for training and looks like "no features yet".
* **The contributing rows' own `observed_at`** — earlier than `as_of`, and
  therefore a claim that a seven-day total was knowable before the seven days
  had elapsed. That direction *is* a leak: a model asking what was knowable on
  Monday would receive a window that runs to Tuesday.

The rule that generalises: `observed_at` is never earlier than the latest input
that fed the value, and never later than the instant the value was determined.
For a window ending at `as_of`, both bounds are `as_of`.

## What is not here

No feature derived from an artefact, a case, an alert, a prediction or the
answer key — `store.assert_no_prohibited_features` refuses those names at both
write and read, and this pipeline is a caller of it like anyone else. No
protected attribute or proxy (§22.2). Nothing that reads `simulator/`; the
import contract makes that unbuildable rather than merely discouraged.

Nothing here is a score, a risk rating or a likelihood. `entity_risk_decayed` is
carried through from `atlas.entity`, which owns that judgement and states its
own basis; this module transports it and does not weigh it.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from atlas.entity.risk import risk_as_of
from atlas.features.store import assert_no_prohibited_features, write_feature
from atlas.graph.aggregates import edge_activity

#: Identifies the computation, not the code version. It changes when a feature's
#: *meaning* changes — a different window, a different denominator, a different
#: exclusion — because two runs that disagree about the same feature at the same
#: instant must be distinguishable in the store. A metric that cannot say which
#: version produced its inputs is not reproducible (CLAUDE.md rule 2).
PIPELINE_VERSION = "behavioural@1"

#: Seven days is a fraud-response window; thirty is an account-behaviour window.
#: Both are stated rather than chosen inside a query, so a caller can see which
#: windows a feature set was built on without reading the SQL.
DEFAULT_WINDOWS: tuple[timedelta, ...] = (timedelta(days=7), timedelta(days=30))

SUBJECT_ENTITY = "ENTITY"


@dataclass(frozen=True)
class ComputedFeature:
    """One feature value, before it is written.

    Materialised rather than written directly so the computation can be tested
    without a store, and so a caller can inspect what a run *would* write. The
    pipeline is the thing most likely to be wrong in a way no error reports, and
    a pure value is the only part of it that can be checked by eye.
    """

    subject_kind: str
    subject_id: uuid.UUID
    feature_name: str
    value: float


def _window_suffix(window: timedelta) -> str:
    """`7d`, `30d`, `12h` — the window as it appears in a feature name.

    Part of the name rather than a separate column because the window *is* part
    of what the feature means: two velocities over different windows are two
    features, not one feature with a parameter. A store keyed on the shorter
    name would have them overwrite each other at the same `observed_at`.
    """
    total_seconds = int(window.total_seconds())
    if total_seconds % 86_400 == 0:
        return f"{total_seconds // 86_400}d"
    if total_seconds % 3_600 == 0:
        return f"{total_seconds // 3_600}h"
    return f"{total_seconds}s"


async def compute_entity_features(
    session: AsyncSession,
    *,
    entity_ids: Sequence[uuid.UUID],
    as_of: datetime,
    windows: Sequence[timedelta] = DEFAULT_WINDOWS,
) -> list[ComputedFeature]:
    """Behavioural and structural features for each entity, as knowable at ``as_of``.

    Pure with respect to the store: it reads the graph and the risk history and
    returns values. Writing is :func:`run_pipeline`'s job, so a caller can
    compute and inspect without appending anything.

    A ratio whose denominator is zero is **omitted, not zero**. An account that
    sent nothing has no fan-in/fan-out ratio — the quantity is undefined, and
    0.0 is a specific claim about balance that the data does not make. The store
    already distinguishes "absent" from "present and zero" for exactly this
    reason, and writing a placeholder would throw that distinction away at the
    only point where it is still available.
    """
    if as_of.tzinfo is None:
        raise ValueError("as_of must be timezone-aware; naive datetimes are ambiguous")
    if not entity_ids:
        return []

    features: list[ComputedFeature] = []

    def emit(subject_id: uuid.UUID, name: str, value: float) -> None:
        features.append(
            ComputedFeature(
                subject_kind=SUBJECT_ENTITY,
                subject_id=subject_id,
                feature_name=name,
                value=value,
            )
        )

    for window in windows:
        suffix = _window_suffix(window)
        activity = await edge_activity(session, entity_ids=entity_ids, as_of=as_of, window=window)

        for entity_id, a in activity.items():
            # Velocity: how much moved, and how often, in the window.
            emit(entity_id, f"txn_out_count_{suffix}", float(a.out_count))
            emit(entity_id, f"txn_in_count_{suffix}", float(a.in_count))
            emit(entity_id, f"txn_out_amount_{suffix}", float(a.out_amount))

            # Spread: how many distinct parties, which separates one large
            # transfer from the same total split across forty accounts.
            emit(
                entity_id,
                f"distinct_out_counterparties_{suffix}",
                float(a.distinct_out_counterparties),
            )
            emit(
                entity_id,
                f"distinct_in_counterparties_{suffix}",
                float(a.distinct_in_counterparties),
            )

            # Shape: collecting, dispersing, or passing through. Undefined with
            # no outbound movement, and therefore not written.
            if a.out_count > 0:
                emit(
                    entity_id,
                    f"fan_in_out_ratio_{suffix}",
                    a.in_count / a.out_count,
                )

            # How often value left the traceable system at this entity. Zero for
            # everything that is not a cash-out endpoint, and that zero is a
            # fact rather than a gap — the entity was observed and no withdrawal
            # terminated there.
            emit(
                entity_id,
                f"endpoint_cash_out_count_{suffix}",
                float(a.cash_out_count),
            )

    # Risk is not windowed: `risk_as_of` already applies decay relative to
    # `as_of`, so the window is implicit in the decay half-life and adding one
    # here would apply the same forgetting twice.
    for entity_id in entity_ids:
        assessment = await risk_as_of(session, entity_id=entity_id, as_of=as_of)
        if assessment is None:
            # Never scored is not zero risk. Substituting 0.0 would turn "we
            # have not looked" into "we looked and found nothing", and a model
            # cannot tell those apart once they are the same number.
            continue
        emit(entity_id, "entity_risk_decayed", assessment.score)

    assert_no_prohibited_features(sorted({f.feature_name for f in features}))
    return features


async def run_pipeline(
    session: AsyncSession,
    *,
    entity_ids: Sequence[uuid.UUID],
    as_of: datetime,
    windows: Sequence[timedelta] = DEFAULT_WINDOWS,
    pipeline_version: str = PIPELINE_VERSION,
) -> int:
    """Compute features and append them to the store. Returns the number written.

    Idempotent by construction rather than by checking: the store's uniqueness
    constraint covers (subject, feature, ``observed_at``) and the insert takes
    ``DO NOTHING``, so re-running for the same ``as_of`` writes the same rows
    and changes nothing. That matters because backfilling is normal here — the
    pipeline is meant to be run repeatedly over a grid of historical instants,
    and a run that doubled its own output would corrupt every window it touched.

    The count returned is rows *offered*, not rows inserted; the two differ on a
    re-run. It is a progress figure and must never be reported as a measurement.
    """
    features = await compute_entity_features(
        session, entity_ids=entity_ids, as_of=as_of, windows=windows
    )
    for feature in features:
        await write_feature(
            session,
            subject_kind=feature.subject_kind,
            subject_id=feature.subject_id,
            feature_name=feature.feature_name,
            value=feature.value,
            # See the module docstring: the window closes at `as_of`, so that is
            # when the value became knowable. Never `utc_now()`.
            observed_at=as_of,
            pipeline_version=pipeline_version,
        )
    return len(features)
