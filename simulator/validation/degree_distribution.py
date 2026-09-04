"""Account degree distribution (spec §23.3): heavy-tailed, not uniform.

A uniform degree distribution (every mule used about equally often) is a tell that the population
generator isn't modelling real mule-network structure, where a small number of accounts handle a
disproportionate share of hops (spec §23.3, and the fan-in typologies in spec §9).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DegreeDistributionResult:
    """Gini coefficient of the degree distribution, plus the top-decile share as a second,
    more intuitive readout of the same property."""

    sample_size: int
    gini: float
    top_decile_share: float
    passes: bool


def gini_coefficient(degrees: list[int]) -> float:
    """0 = perfectly uniform (every account has the same degree); approaches 1 as degree
    concentrates in fewer accounts. Standard discrete Gini formula, no external dependency."""
    if not degrees:
        raise ValueError("cannot compute Gini coefficient of an empty degree list")
    values = sorted(degrees)
    n = len(values)
    total = sum(values)
    if total == 0:
        return 0.0
    cumulative = sum((i + 1) * v for i, v in enumerate(values))
    return (2 * cumulative) / (n * total) - (n + 1) / n


def top_decile_share(degrees: list[int]) -> float:
    """Fraction of total degree held by the busiest ~10% of accounts. A uniform distribution
    gives approximately 0.10; a heavy-tailed one gives substantially more."""
    if not degrees:
        raise ValueError("cannot compute top-decile share of an empty degree list")
    values = sorted(degrees, reverse=True)
    total = sum(values)
    if total == 0:
        return 0.0
    top_n = max(1, len(values) // 10)
    return sum(values[:top_n]) / total


# A uniform distribution over N accounts gives a Gini of 0 and a top-decile share of ~0.10.
# These thresholds require visibly more concentration than that before passing — chosen to be a
# clear, not a marginal, departure from uniform. Not calibrated against a real mule-network
# dataset; see docs/ml/simulator-limitations.md.
_MIN_GINI = 0.25
_MIN_TOP_DECILE_SHARE = 0.25


def check_heavy_tailed_degree(degrees: list[int]) -> DegreeDistributionResult:
    gini = gini_coefficient(degrees)
    share = top_decile_share(degrees)
    return DegreeDistributionResult(
        sample_size=len(degrees),
        gini=gini,
        top_decile_share=share,
        passes=gini >= _MIN_GINI and share >= _MIN_TOP_DECILE_SHARE,
    )
