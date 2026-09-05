"""Benford's law conformance (spec §23.3): amounts should follow the expected first-digit law.

Naturally occurring financial amounts follow Benford's law — the leading digit is 1 far more
often than 9. Synthetic amounts drawn from a naive distribution (e.g. uniform, or a lognormal
with a narrow range) typically do not. This is therefore a real check on the simulator, not a
formality: failing it means the amounts are detectably synthetic in a way a real dataset
wouldn't be.
"""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass
from decimal import Decimal

# P(leading digit = d) = log10(1 + 1/d), for d in 1..9.
EXPECTED_FIRST_DIGIT_FREQUENCY: dict[int, float] = {
    d: math.log10(1 + 1 / d) for d in range(1, 10)
}


def leading_digit(amount: Decimal) -> int:
    """The first significant digit of a positive amount. ``Decimal("0.00")`` has none —
    callers are expected to filter zero amounts before calling this."""
    text = format(amount.copy_abs(), "f").lstrip("0").lstrip(".")
    for ch in text:
        if ch.isdigit() and ch != "0":
            return int(ch)
    raise ValueError(f"amount has no non-zero leading digit: {amount!r}")


@dataclass(frozen=True)
class BenfordResult:
    """Chi-square goodness-of-fit of observed leading digits against Benford's law.

    ``statistic`` is the chi-square statistic; ``passes`` compares it to a fixed critical value
    for 8 degrees of freedom rather than computing a p-value, to avoid a scipy dependency for one
    lookup. df=8, alpha=0.01 → critical value 20.09 (standard chi-square table).
    """

    sample_size: int
    observed_frequency: dict[int, float]
    statistic: float
    passes: bool


_CHI_SQUARE_CRITICAL_DF8_ALPHA01 = 20.09


def check_benford_conformance(amounts: list[Decimal]) -> BenfordResult:
    """Run the chi-square goodness-of-fit test. Requires a reasonably sized sample — Benford's
    law is a large-sample statistical property, not something a handful of amounts can conform
    to or violate meaningfully."""
    nonzero = [a for a in amounts if a != 0]
    n = len(nonzero)
    if n < 100:
        raise ValueError(
            f"Benford conformance needs at least 100 nonzero amounts to be statistically "
            f"meaningful, got {n}"
        )

    counts = Counter(leading_digit(a) for a in nonzero)
    observed_frequency = {d: counts.get(d, 0) / n for d in range(1, 10)}

    statistic = sum(
        ((counts.get(d, 0) - n * EXPECTED_FIRST_DIGIT_FREQUENCY[d]) ** 2)
        / (n * EXPECTED_FIRST_DIGIT_FREQUENCY[d])
        for d in range(1, 10)
    )

    return BenfordResult(
        sample_size=n,
        observed_frequency=observed_frequency,
        statistic=statistic,
        passes=statistic < _CHI_SQUARE_CRITICAL_DF8_ALPHA01,
    )
