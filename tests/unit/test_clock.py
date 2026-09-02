"""Clock discipline. A temporal prediction system cannot be sloppy about time."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from atlas.core.clock import IST, ensure_utc, golden_hour_position, to_ist, utc_now


def test_utc_now_is_timezone_aware() -> None:
    assert utc_now().tzinfo is not None


def test_to_ist_rejects_naive_datetime() -> None:
    """Guessing a timezone is how off-by-5:30 bugs enter a time-window system."""
    with pytest.raises(ValueError, match="naive"):
        to_ist(datetime(2026, 9, 1, 12, 0))  # noqa: DTZ001


def test_ensure_utc_rejects_naive_datetime() -> None:
    with pytest.raises(ValueError, match="naive"):
        ensure_utc(datetime(2026, 9, 1, 12, 0))  # noqa: DTZ001


def test_ist_offset_is_five_thirty() -> None:
    moment = datetime(2026, 9, 1, 6, 30, tzinfo=UTC)
    assert to_ist(moment).hour == 12
    assert to_ist(moment).minute == 0
    assert to_ist(moment).tzinfo == IST


def test_golden_hour_position_measures_elapsed_time() -> None:
    started = datetime(2026, 9, 1, 10, 0, tzinfo=UTC)
    now = datetime(2026, 9, 1, 10, 41, tzinfo=UTC)
    assert golden_hour_position(started, now=now) == timedelta(minutes=41)
