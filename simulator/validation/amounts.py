"""Amount distribution sanity (spec §23.3): amounts stay inside each typology's declared bounds
and are exact rupee values.

This does not (yet) compare against published aggregate statistics — see
docs/ml/simulator-limitations.md. What it does check is internal consistency: does every
generated amount actually respect the ``TypologyProfile`` that supposedly produced it, and is it
representable as an exact amount (spec #23 review point 1 — see PR #25) rather than a float
artifact.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from simulator.typologies.base import TypologyProfile

_PAISA = Decimal("0.01")
_PAISA_EXPONENT = (
    -2
)  # Decimal("0.01").as_tuple().exponent — fixed, so asserted once here.


def _decimal_places(amount: Decimal) -> int:
    """Number of digits after the decimal point. Raises on non-finite Decimals (NaN/Infinity),
    which have no meaningful digit count and should never appear in a generated amount."""
    exponent = amount.as_tuple().exponent
    if not isinstance(exponent, int):
        raise TypeError(f"amount is not a finite Decimal: {amount!r}")
    return max(0, -exponent)


@dataclass(frozen=True)
class AmountSanityResult:
    sample_size: int
    out_of_bounds: int
    not_quantized: int
    non_positive: int
    passes: bool


def check_amount_sanity(
    amounts: list[Decimal], profile: TypologyProfile
) -> AmountSanityResult:
    floor = Decimal(str(profile.hop_amount.floor))
    ceiling = Decimal(str(profile.hop_amount.ceiling))

    out_of_bounds = sum(1 for a in amounts if a < floor or a > ceiling)
    # Decimal equality ignores trailing zeros (Decimal("1.0000") == Decimal("1.00")), so
    # comparing to a quantized copy can't detect excess precision — count decimal places instead.
    not_quantized = sum(1 for a in amounts if _decimal_places(a) > -_PAISA_EXPONENT)
    non_positive = sum(1 for a in amounts if a <= 0)

    return AmountSanityResult(
        sample_size=len(amounts),
        out_of_bounds=out_of_bounds,
        not_quantized=not_quantized,
        non_positive=non_positive,
        passes=out_of_bounds == 0 and not_quantized == 0 and non_positive == 0,
    )
