"""Data-quality gates (master spec §10.2).

Malformed data is rejected safely, counted, and surfaced — never silently
dropped. A pipeline that quietly discards 5% of complaints looks identical to
one that receives 5% fewer, and the difference matters enormously.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from atlas.core.clock import ensure_utc, utc_now
from atlas.ingest.ports import ValidationIssue, ValidationResult

#: Complaints dated further ahead than this are rejected. Small clock skew
#: between a source system and ours is normal; an hour is not.
MAX_CLOCK_SKEW = timedelta(minutes=5)

#: Nothing older than this is accepted as a *new* complaint. A five-year-old
#: report arriving today is a backfill or a bug, and either way it should not
#: silently enter the live pipeline where it would distort recency features.
MAX_AGE = timedelta(days=365 * 2)


@dataclass
class QualityReport:
    """What happened to a batch. Published, not just logged."""

    accepted: int = 0
    rejected: int = 0
    duplicates: int = 0
    reasons: Counter[str] = field(default_factory=Counter)

    @property
    def total(self) -> int:
        return self.accepted + self.rejected + self.duplicates

    @property
    def acceptance_rate(self) -> float:
        return self.accepted / self.total if self.total else 1.0

    def record_rejection(self, reason: str) -> None:
        self.rejected += 1
        self.reasons[reason] += 1


def check_amount(value: Any) -> ValidationIssue | None:
    """Amounts must be positive and parseable as an exact decimal.

    Rejects floats outright. Accepting one here would let binary rounding into a
    money column at the only point where we can still refuse it.
    """
    if isinstance(value, float):
        return ValidationIssue("reported_amount", "float amounts are not accepted; send a string")
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError):
        return ValidationIssue("reported_amount", f"not a valid decimal: {value!r}")
    if amount <= 0:
        return ValidationIssue("reported_amount", "must be greater than zero")
    if amount.as_tuple().exponent < -2:  # type: ignore[operator]
        return ValidationIssue("reported_amount", "more than two decimal places")
    return None


def check_timestamps(
    reported_at: datetime, fraud_initiated_at: datetime | None, *, now: datetime | None = None
) -> list[ValidationIssue]:
    """Temporal sanity.

    The ordering rule is the important one: a fraud cannot begin after it was
    reported. Accepting that would produce a negative golden-hour position and a
    lead time that looks impossibly good.
    """
    current = ensure_utc(now or utc_now())
    issues: list[ValidationIssue] = []

    reported = ensure_utc(reported_at)
    if reported > current + MAX_CLOCK_SKEW:
        issues.append(ValidationIssue("reported_at", "is in the future"))
    if reported < current - MAX_AGE:
        issues.append(ValidationIssue("reported_at", "older than the accepted backlog window"))

    if fraud_initiated_at is not None:
        initiated = ensure_utc(fraud_initiated_at)
        if initiated > reported + MAX_CLOCK_SKEW:
            issues.append(
                ValidationIssue(
                    "fraud_initiated_at",
                    "fraud cannot begin after it was reported — this would make lead "
                    "time look better than it is",
                )
            )
        if initiated > current + MAX_CLOCK_SKEW:
            issues.append(ValidationIssue("fraud_initiated_at", "is in the future"))
    return issues


def check_required(payload: dict[str, Any], required: tuple[str, ...]) -> list[ValidationIssue]:
    return [
        ValidationIssue(name, "missing or empty")
        for name in required
        if payload.get(name) in (None, "")
    ]


def combine(*groups: list[ValidationIssue] | ValidationIssue | None) -> ValidationResult:
    issues: list[ValidationIssue] = []
    for group in groups:
        if group is None:
            continue
        issues.extend(group if isinstance(group, list) else [group])
    return ValidationResult.valid() if not issues else ValidationResult.invalid(*issues)
