"""Realism validation gates (spec §23.3, issue #6): "the most important gate we have."

Checks whether data from ``simulator.typologies`` (issue #5) and ``simulator.generators``
(issue #4) is realistic enough to train and evaluate on, without embedding an easy shortcut to
the answer. See ``docs/ml/simulator-limitations.md`` for what is and isn't checked yet.
"""

from __future__ import annotations

from .amounts import AmountSanityResult, check_amount_sanity
from .benford import BenfordResult, check_benford_conformance, leading_digit
from .degree_distribution import (
    DegreeDistributionResult,
    check_heavy_tailed_degree,
    gini_coefficient,
    top_decile_share,
)
from .report import RealismReport, generate_scenario_batch, run_realism_checks
from .separability import FeatureSeparability, SeparabilityResult, check_separability
from .timing import TimingSanityResult, check_timing_sanity

__all__ = [
    "AmountSanityResult",
    "BenfordResult",
    "DegreeDistributionResult",
    "FeatureSeparability",
    "RealismReport",
    "SeparabilityResult",
    "TimingSanityResult",
    "check_amount_sanity",
    "check_benford_conformance",
    "check_heavy_tailed_degree",
    "check_separability",
    "check_timing_sanity",
    "generate_scenario_batch",
    "gini_coefficient",
    "leading_digit",
    "run_realism_checks",
    "top_decile_share",
]
