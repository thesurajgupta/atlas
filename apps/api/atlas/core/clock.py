"""Time handling.

ATLAS predicts *when* something will happen, so clock discipline is load-bearing
rather than housekeeping. Two rules, applied everywhere:

1. **Storage is always UTC.** Every timestamp column is ``TIMESTAMPTZ`` and every
   datetime in Python is timezone-aware. Naive datetimes are a bug, not a style
   preference — ``ruff`` rule DTZ enforces this.
2. **Presentation is IST.** Investigators work in Indian Standard Time and a
   report that says "02:00" must mean 02:00 to them. Conversion happens at the
   edge, never in storage or in a feature.

The indirection through :func:`utc_now` exists so tests can freeze time. Calling
``datetime.now()`` directly anywhere in the codebase defeats that.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")

# The window after fraud initiation in which intervention can still recover funds.
# Not a hard cutoff — it is the reference point that makes lead time meaningful
# (master spec §11). A prediction delivered after the money is gone has a lead
# time of zero regardless of how well it ranked.
GOLDEN_HOUR = timedelta(hours=1)


def utc_now() -> datetime:
    """Current time, timezone-aware, in UTC. The only clock the codebase reads."""
    return datetime.now(UTC)


def to_ist(moment: datetime) -> datetime:
    """Convert to IST for display. Rejects naive input rather than guessing."""
    if moment.tzinfo is None:
        raise ValueError("refusing to convert a naive datetime; storage is always UTC")
    return moment.astimezone(IST)


def ensure_utc(moment: datetime) -> datetime:
    """Normalise an aware datetime to UTC. Rejects naive input.

    Assuming a timezone for a naive datetime is how off-by-five-and-a-half-hour
    bugs enter a system whose whole output is a time window.
    """
    if moment.tzinfo is None:
        raise ValueError("naive datetime rejected; supply an aware datetime")
    return moment.astimezone(UTC)


def golden_hour_position(fraud_initiated_at: datetime, *, now: datetime | None = None) -> timedelta:
    """Elapsed time since fraud initiation.

    Surfaced in the case fact-strip (master spec §25.2) because it determines
    whether any prediction on the screen is still actionable.
    """
    return ensure_utc(now or utc_now()) - ensure_utc(fraud_initiated_at)
