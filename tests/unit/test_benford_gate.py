"""The Benford gate, and proof it still rejects what it used to (issue #45, §23.3).

Two things are asserted here, and the second is the one that matters. The gate's
instrument changed from chi-square to first-digit MAD, and "we changed the test
and now it passes" is indistinguishable from weakening it unless the old data is
still rejected. So the old distribution is reconstructed and scored.
"""

from __future__ import annotations

import math
from decimal import Decimal
from random import Random

import pytest

from simulator.validation.benford import check_benford_conformance

#: The seven typology amount ranges, as (floor, ceiling) in rupees.
RANGES = [
    (5_000.0, 500_000.0),
    (100_000.0, 5_000_000.0),
    (20_000.0, 3_000_000.0),
    (200.0, 15_000.0),
    (1_000.0, 100_000.0),
    (500.0, 100_000.0),
    (500.0, 50_000.0),
]

#: Matching (mean_log, sigma_log) for the lognormal the curves used before #45.
LOGNORMAL = [
    (10.5, 0.6),
    (12.5, 0.6),
    (11.0, 0.9),
    (7.5, 0.5),
    (8.0, 0.5),
    (8.0, 0.6),
    (8.5, 0.7),
]

PER_TYPOLOGY = 3_000


def _log_uniform(rng: Random) -> list[Decimal]:
    """What the generators emit now."""
    out: list[Decimal] = []
    for floor, ceiling in RANGES:
        lo, hi = math.log10(floor), math.log10(ceiling)
        out += [
            Decimal(str(round(10 ** rng.uniform(lo, hi), 2)))
            for _ in range(PER_TYPOLOGY)
        ]
    return out


def _clipped_lognormal(rng: Random) -> list[Decimal]:
    """What they emitted before, reconstructed — the distribution #45 was about."""
    out: list[Decimal] = []
    for (floor, ceiling), (mean_log, sigma_log) in zip(RANGES, LOGNORMAL, strict=True):
        for _ in range(PER_TYPOLOGY):
            value = min(max(rng.lognormvariate(mean_log, sigma_log), floor), ceiling)
            out.append(Decimal(str(round(value, 2))))
    return out


def test_the_current_amount_distribution_conforms() -> None:
    result = check_benford_conformance(_log_uniform(Random(26184)))

    assert result.passes
    assert result.conformity in {"close", "acceptable"}


def test_the_gate_still_rejects_the_distribution_it_was_opened_for() -> None:
    """The check on the check.

    The instrument changed from chi-square to MAD because chi-square rejected
    everything at this sample size and so carried no information. Changing an
    instrument is the same shape of action as raising a threshold, and it is only
    legitimate if the new one still fails the data the old one was right about.
    """
    result = check_benford_conformance(_clipped_lognormal(Random(26184)))

    assert not result.passes
    assert result.conformity == "nonconformant"


def test_the_two_are_not_close() -> None:
    """A fix, not a nudge past a threshold."""
    fixed = check_benford_conformance(_log_uniform(Random(7)))
    broken = check_benford_conformance(_clipped_lognormal(Random(7)))

    assert broken.statistic > 2 * fixed.statistic


def test_conformity_bands_are_reported_not_just_a_boolean() -> None:
    """ "Marginal" and "nonconformant" are different problems.

    A bare pass/fail cannot say which, and the difference decides whether someone
    reruns with a bigger sample or goes back to the generators.
    """
    result = check_benford_conformance(_log_uniform(Random(3)))

    assert result.conformity in {"close", "acceptable", "marginal", "nonconformant"}
    assert result.sample_size == PER_TYPOLOGY * len(RANGES)


def test_a_sample_too_small_to_mean_anything_is_refused() -> None:
    """Benford is a large-sample property; a handful of amounts cannot violate it."""
    with pytest.raises(ValueError, match="at least 100"):
        check_benford_conformance([Decimal("1234.00")] * 20)
