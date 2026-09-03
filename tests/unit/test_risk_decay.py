"""Risk decay (master spec §13.2).

Pure arithmetic, tested without a database. The property that matters is not
"the formula is exponential" — it is that an entity risky a year ago and quiet
since does not still read as risky today, and that the code says so rather than
relying on somebody running a re-scoring job.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from atlas.entity.risk import (
    DEFAULT_HALF_LIVES,
    FALLBACK_HALF_LIFE,
    RiskFactor,
    decayed,
    half_life_for,
)

MONTH = timedelta(days=30)


def test_a_fresh_score_is_undecayed() -> None:
    assert decayed(0.9, age=timedelta(0), half_life=MONTH) == 0.9


def test_one_half_life_halves_the_score() -> None:
    assert decayed(0.9, age=MONTH, half_life=MONTH) == pytest.approx(0.45)


def test_decay_compounds() -> None:
    assert decayed(0.8, age=3 * MONTH, half_life=MONTH) == pytest.approx(0.1)


def test_decay_approaches_zero_without_reaching_it() -> None:
    """Exponential rather than linear, and the difference is a claim.

    A linear decay hits exactly zero and has to be clamped there — which asserts
    that risk is provably absent. It is not; it is unsupported by recent
    evidence, and those are different statements.
    """
    far = decayed(0.9, age=timedelta(days=3650), half_life=MONTH)
    assert far > 0.0
    assert far < 1e-30


def test_reading_a_score_before_it_was_recorded_yields_nothing() -> None:
    """A negative age is a caller bug, and the safe reading of a bug is
    "we know nothing", not an amplified score."""
    assert decayed(0.9, age=-MONTH, half_life=MONTH) == 0.0


def test_a_non_positive_half_life_is_rejected() -> None:
    with pytest.raises(ValueError, match="half_life"):
        decayed(0.9, age=MONTH, half_life=timedelta(0))


def test_infrastructure_decays_slower_than_accounts() -> None:
    """The one ordering these placeholder half-lives are meant to encode.

    A mule account is used and abandoned; a complicit BC agent is a standing
    facility. The magnitudes are guesses, but the direction is not.
    """
    assert half_life_for("CASH_OUT_ENDPOINT") > half_life_for("ACCOUNT")
    assert half_life_for("BC_AGENT") > half_life_for("ACCOUNT")


def test_an_unknown_entity_kind_gets_the_fallback_not_a_crash() -> None:
    """New entity kinds arrive before their half-life is chosen.

    Raising here would make adding a node type a breaking change; defaulting to
    a very long half-life would let a new kind accumulate risk forever.
    """
    assert half_life_for("SOMETHING_ADDED_LATER") == FALLBACK_HALF_LIFE
    assert FALLBACK_HALF_LIFE <= max(DEFAULT_HALF_LIVES.values())


def test_a_factor_without_detail_is_rejected() -> None:
    """An unexplained factor is not an explanation.

    A score an investigator cannot interrogate is one they will either
    over-trust or ignore.
    """
    with pytest.raises(ValueError, match="detail"):
        RiskFactor(name="distinct_complaints_30d", weight=0.4, detail="   ")
