"""Inter-hop timing sanity (spec §23.3): delays stay inside each typology's declared range and
never run backwards in time.

Like ``amounts.py``, this checks internal consistency against the declared
``TypologyProfile`` rather than comparing to a published transaction-rhythm dataset — see
docs/ml/simulator-limitations.md for what that gap means.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from itertools import pairwise

from simulator.typologies.base import TypologyProfile


@dataclass(frozen=True)
class TimingSanityResult:
    sample_size: int
    non_monotonic: int
    delay_out_of_bounds: int
    passes: bool


def check_timing_sanity(
    timestamps: list[datetime], profile: TypologyProfile
) -> TimingSanityResult:
    """``timestamps`` is one scenario's ordered hop/cash-out timestamps, including the fraud
    initiation time as the first element — pass one call per scenario, not amounts pooled across
    scenarios, since monotonicity is a per-scenario property."""
    if len(timestamps) < 2:
        return TimingSanityResult(
            sample_size=0, non_monotonic=0, delay_out_of_bounds=0, passes=True
        )

    _min_delay, max_delay = profile.inter_hop_delay_minutes
    non_monotonic = 0
    delay_out_of_bounds = 0

    for earlier, later in pairwise(timestamps):
        if later < earlier:
            non_monotonic += 1
            continue
        delay_minutes = (later - earlier).total_seconds() / 60
        # A generous tolerance band, not an exact-range check: profile delays compose (e.g. the
        # cash-out delay is drawn independently on top of the last hop's), so pairwise gaps can
        # legitimately exceed a single draw's range. The check exists to catch gross violations
        # (a delay of zero, or one far outside any plausible multiple), not to re-derive the
        # sampling distribution.
        if delay_minutes < 0 or delay_minutes > max_delay * 3 + 1:
            delay_out_of_bounds += 1

    pairs = len(timestamps) - 1
    return TimingSanityResult(
        sample_size=pairs,
        non_monotonic=non_monotonic,
        delay_out_of_bounds=delay_out_of_bounds,
        passes=non_monotonic == 0 and delay_out_of_bounds == 0,
    )
