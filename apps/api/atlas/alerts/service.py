"""Evaluate a candidate against the alert policy and record what was decided.

`policy.decide` is a pure function and stays that way. This module is the only
thing that touches the database: it gathers the two facts the policy needs,
calls it, and persists the answer — raised or not.

## Why the queries live here and not in `decide()`

``recent_keys`` and ``issued_in_window`` are parameters precisely so the policy
can be tested exhaustively without a database, and nineteen tests depend on
that. Moving either query inside would make every one of them need a session,
and the policy is the part most worth being able to reason about in isolation.

## Both gates count only *raised* alerts

A suppression must not suppress the next decision. If a case is refused for
INSUFFICIENT evidence at 09:00 and the evidence improves at 09:20, the second
decision has to be free to raise — treating the first as an "equivalent alert
already issued" would silence the case for the rest of the six-hour window for
the very reason that no longer applies.

The same holds for the budget: a suppressed alert consumed nobody's attention,
so it must not consume the jurisdiction's budget. The policy's own wording says
this — "an equivalent alert *was issued*", "budget exhausted (25/25)" — and both
queries filter on ``raised`` to match it.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from atlas.alerts.models import Alert
from atlas.alerts.policy import (
    DEFAULT_BUDGET_PER_WINDOW,
    DEFAULT_BUDGET_WINDOW,
    DEFAULT_SUPPRESSION_WINDOW,
    AlertCandidate,
    AlertDecision,
    decide,
)


async def recent_keys(
    session: AsyncSession,
    *,
    jurisdiction_id: uuid.UUID,
    now: datetime,
    window: timedelta = DEFAULT_SUPPRESSION_WINDOW,
) -> frozenset[str]:
    """Dedup keys of alerts *raised* in this jurisdiction inside the window.

    Scoped to one jurisdiction because an alert raised in another district
    interrupted a different person; it says nothing about whether this one has
    already been told.
    """
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware; naive datetimes are ambiguous")

    result = await session.execute(
        select(Alert.dedup_key).where(
            Alert.jurisdiction_id == jurisdiction_id,
            Alert.raised.is_(True),
            Alert.issued_at > now - window,
            Alert.issued_at <= now,
        )
    )
    return frozenset(result.scalars())


async def issued_in_window(
    session: AsyncSession,
    *,
    jurisdiction_id: uuid.UUID,
    now: datetime,
    window: timedelta = DEFAULT_BUDGET_WINDOW,
) -> int:
    """How many alerts this jurisdiction has actually been sent in the window.

    Counts raised alerts only — see the module docstring. Suppressions are rows
    in the same table and would otherwise exhaust the budget with decisions that
    interrupted nobody, which is precisely backwards: the budget exists to limit
    interruptions.
    """
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware; naive datetimes are ambiguous")

    total = await session.scalar(
        select(func.count())
        .select_from(Alert)
        .where(
            Alert.jurisdiction_id == jurisdiction_id,
            Alert.raised.is_(True),
            Alert.issued_at > now - window,
            Alert.issued_at <= now,
        )
    )
    return int(total or 0)


async def evaluate_and_record(
    session: AsyncSession,
    candidate: AlertCandidate,
    *,
    now: datetime,
    budget: int = DEFAULT_BUDGET_PER_WINDOW,
) -> AlertDecision:
    """Decide, persist the decision, and return it.

    A row is written **either way**. An alert that was not sent is a judgement
    somebody may have to explain later, and "no alert appeared" cannot
    distinguish a deliberate suppression from a pipeline that never ran.

    ``now`` is required and has no default. The policy already refuses to read
    the wall clock — an earlier version accepted ``now`` and ignored it, and
    every test dated in the past silently looked past the golden hour — so this
    threads the same instant through the queries that bound the windows. A
    default here would reintroduce exactly that bug one layer up.

    The row is added to the session but not committed: persisting the decision
    and whatever else the caller is doing in the same transaction is the point,
    so an alert cannot survive a pipeline step that rolled back.
    """
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware; naive datetimes are ambiguous")

    jurisdiction_id = uuid.UUID(candidate.jurisdiction_id)

    decision = decide(
        candidate,
        now=now,
        recent_keys=await recent_keys(session, jurisdiction_id=jurisdiction_id, now=now),
        issued_in_window=await issued_in_window(session, jurisdiction_id=jurisdiction_id, now=now),
        budget=budget,
    )

    session.add(
        Alert(
            case_ref=candidate.case_ref,
            jurisdiction_id=jurisdiction_id,
            severity=decision.severity,
            raised=decision.raise_alert,
            # Verbatim. The policy writes sentences a human can act on, and a
            # paraphrase here would be a second, worse copy that drifts.
            reason=decision.reason,
            dedup_key=decision.dedup_key,
            issued_at=now,
        )
    )
    await session.flush()
    return decision
