"""Benford's law conformance (spec §23.3): amounts should follow the expected first-digit law.

Naturally occurring financial amounts follow Benford's law — the leading digit is 1 far more
often than 9. Synthetic amounts drawn from a naive distribution (e.g. uniform, or a lognormal
with a narrow range) typically do not. This is therefore a real check on the simulator, not a
formality: failing it means the amounts are detectably synthetic in a way a real dataset
wouldn't be.

## Why mean absolute deviation and not chi-square

This gate used a chi-square goodness-of-fit test against a fixed critical value, and it had to
be replaced — not because it was failing, but because at this sample size it cannot tell a
fixed distribution from a broken one.

Chi-square's power grows with ``n``. Measured on the generators as they stand:

===========================================  ==========  ======  ===============
distribution                                 chi-square     MAD  MAD verdict
===========================================  ==========  ======  ===============
clipped lognormal (the old amount curve)         3586.5  0.0188  NONCONFORMANT
log-uniform across typology ranges (current)      351.9  0.0061  acceptable
===========================================  ==========  ======  ===============

Chi-square rejects both at n≈105,000, so it would have reported "FAIL" on a distribution that
is visibly conformant and on one that genuinely was not, with no way to distinguish them. A
gate that fires on everything carries no information, and the usual response — quietly raising
the critical value until the build goes green — is the failure mode CLAUDE.md rule 1 is about.

First-digit MAD is the standard instrument for exactly this situation and is sample-size
robust; the thresholds are Nigrini's published conformity bands. **The change is not a
loosening**: the old distribution scores 0.0188, which this gate still rejects. That is asserted
in ``tests/unit/test_benford_gate.py`` rather than stated here.

The argument, and the bands, come from Vijay's work in ``simulator/validation/amount_distribution``
(PR #72).
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
    """Mean absolute deviation of observed leading digits from Benford's law.

    ``statistic`` is the MAD; ``conformity`` is the Nigrini band it falls in, reported alongside
    the boolean so a reader can see *how* close a pass or a failure was. "Marginal" and
    "nonconformant" are different problems and a bare ``passes`` cannot say which.
    """

    sample_size: int
    observed_frequency: dict[int, float]
    statistic: float
    conformity: str
    passes: bool


#: Nigrini's first-digit conformity bands.
_CLOSE = 0.006
_ACCEPTABLE = 0.012
_MARGINAL = 0.015


def _conformity(mad: float) -> str:
    if mad < _CLOSE:
        return "close"
    if mad < _ACCEPTABLE:
        return "acceptable"
    if mad < _MARGINAL:
        return "marginal"
    return "nonconformant"


def check_benford_conformance(amounts: list[Decimal]) -> BenfordResult:
    """Score first-digit MAD against Benford's law.

    Requires a reasonably sized sample — Benford's law is a large-sample statistical property,
    not something a handful of amounts can conform to or violate meaningfully.

    Conformance is a property of the **aggregate across typologies**, not of any one typology in
    isolation: Benford describes mixtures of scales, and a single bounded range spanning a
    decade or two converges to it poorly however well chosen. Do not validate one typology alone
    and conclude the gate passes.
    """
    nonzero = [a for a in amounts if a != 0]
    n = len(nonzero)
    if n < 100:
        raise ValueError(
            f"Benford conformance needs at least 100 nonzero amounts to be statistically "
            f"meaningful, got {n}"
        )

    counts = Counter(leading_digit(a) for a in nonzero)
    observed_frequency = {d: counts.get(d, 0) / n for d in range(1, 10)}

    statistic = (
        sum(
            abs(observed_frequency[d] - EXPECTED_FIRST_DIGIT_FREQUENCY[d])
            for d in range(1, 10)
        )
        / 9
    )

    return BenfordResult(
        sample_size=n,
        observed_frequency=observed_frequency,
        statistic=statistic,
        conformity=_conformity(statistic),
        passes=statistic < _ACCEPTABLE,
    )
