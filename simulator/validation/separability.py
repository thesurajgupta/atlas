"""Separability sanity gate (spec §23.3): "the most important gate in the file."

No single feature may separate synthetic-fraud from synthetic-normal transactions above a
threshold. If one does, the simulator has embedded the answer in an easily-found shortcut, and
every downstream metric trained or evaluated on this data is worthless — a model that hits 99%
by keying off that one feature has learned nothing about real fraud.

**This module is the generic mechanism.** Running it end-to-end requires labelled
synthetic-normal transactions (spec §23.1's "normal population": salary credits, bills,
shopping, ordinary withdrawals) alongside the synthetic-fraud scenarios issue #5 produces.
That normal-population generator does not exist yet — it was out of scope for issue #4 (see
docs/ml/population-assumptions.md, "What this does not yet cover") and issue #5. Recorded as a
known gap in docs/ml/simulator-limitations.md rather than silently assumed away: this gate
cannot be fully exercised until that generator lands, and no dataset version should be called
validated on the strength of the other four checks alone — this is explicitly "the most
important gate in the file."
"""

from __future__ import annotations

from dataclasses import dataclass


def _auc_from_ranks(positive: list[float], negative: list[float]) -> float:
    """AUC via the Mann-Whitney U statistic, computed from ranks — equivalent to the probability
    a random positive example scores higher than a random negative one for this single feature.
    Pure Python, no scipy/sklearn dependency for one number."""
    combined = sorted((v, 0) for v in positive) + sorted((v, 1) for v in negative)
    combined.sort(key=lambda pair: pair[0])

    ranks: list[float] = [0.0] * len(combined)
    i = 0
    while i < len(combined):
        j = i
        while j < len(combined) and combined[j][0] == combined[i][0]:
            j += 1
        # Tied values share the average rank of their block (standard tie-handling for U).
        average_rank = (i + 1 + j) / 2
        for k in range(i, j):
            ranks[k] = average_rank
        i = j

    rank_sum_positive = sum(
        r for r, (_v, label) in zip(ranks, combined, strict=True) if label == 0
    )
    n_pos, n_neg = len(positive), len(negative)
    u_statistic = rank_sum_positive - n_pos * (n_pos + 1) / 2
    return u_statistic / (n_pos * n_neg)


@dataclass(frozen=True)
class FeatureSeparability:
    feature_name: str
    auc: float
    passes: bool


@dataclass(frozen=True)
class SeparabilityResult:
    per_feature: tuple[FeatureSeparability, ...]
    max_auc: float
    passes: bool


# spec: "no single feature may separate ... above a threshold." An AUC of 0.5 is chance; 1.0 (or
# 0.0, i.e. perfectly separating the other way) is a dead giveaway. 0.80 is a deliberately
# generous ceiling — a single feature that alone gets even close to that has clearly leaked the
# label, since real fraud/normal transactions overlap heavily on any one dimension. Not
# calibrated against a real dataset; see docs/ml/simulator-limitations.md.
_MAX_ALLOWED_SINGLE_FEATURE_AUC = 0.80


def check_separability(
    fraud_features: dict[str, list[float]], normal_features: dict[str, list[float]]
) -> SeparabilityResult:
    """``fraud_features``/``normal_features`` map feature name to that feature's values across a
    sample of fraud-linked and normal transactions respectively. Same feature names required in
    both, same as any real feature table would produce."""
    if fraud_features.keys() != normal_features.keys():
        raise ValueError(
            "fraud_features and normal_features must cover the same feature names"
        )
    if not fraud_features:
        raise ValueError("no features supplied")

    per_feature = []
    for name, fraud_values in fraud_features.items():
        auc = _auc_from_ranks(fraud_values, normal_features[name])
        # A feature separating strongly in *either* direction is equally a leak — distance from
        # chance (0.5) is what matters, not which class it favours. Effective separation is
        # symmetric around 0.5.
        effective_auc = 0.5 + abs(auc - 0.5)
        passes = effective_auc <= _MAX_ALLOWED_SINGLE_FEATURE_AUC
        per_feature.append(
            FeatureSeparability(feature_name=name, auc=auc, passes=passes)
        )

    max_auc = max(max(f.auc, 1 - f.auc) for f in per_feature)
    return SeparabilityResult(
        per_feature=tuple(per_feature),
        max_auc=max_auc,
        passes=all(f.passes for f in per_feature),
    )
