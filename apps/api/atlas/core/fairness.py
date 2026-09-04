"""Prohibited attributes (master spec §18, §22.2).

ATLAS must never use a protected attribute, or a close proxy for one, as a
feature. Master spec §3 states this as a non-goal and §22.2 requires it to be
"enforced by a failing test, not by promise".

This module is that single source of truth. It is deliberately in `core` so both
the model layer and the feature pipeline check against the same list — two
divergent copies would mean one of them is wrong and nobody would know which.
"""

from __future__ import annotations

import re
from collections.abc import Iterable

#: Protected attributes under Indian equality law and constitutional protections.
PROTECTED_ATTRIBUTES: frozenset[str] = frozenset(
    {
        "caste",
        "religion",
        "race",
        "ethnicity",
        "sex",
        "gender",
        "sexual_orientation",
        "disability",
        "language",
        "mother_tongue",
        "place_of_birth",
        "descent",
        "tribe",
        "community",
        "creed",
    }
)

#: Close proxies. Not protected attributes themselves, but strongly correlated
#: with them, so using one is using the attribute at one remove. `surname` is
#: here because in the Indian context it is among the strongest caste proxies
#: available, and a model would find that signal readily.
PROXY_ATTRIBUTES: frozenset[str] = frozenset(
    {
        "surname",
        "family_name",
        "sub_caste",
        "gotra",
        "varna",
        "jati",
        "madrasa",
        "temple",
        "mosque",
        "church",
        "minority_status",
        "reservation_category",
    }
)

PROHIBITED: frozenset[str] = PROTECTED_ATTRIBUTES | PROXY_ATTRIBUTES

# `community` is both a caste proxy in Indian usage and the standard name for
# the output of a graph-clustering algorithm. An exact allow-list of the graph
# spellings was the first attempt and it did not survive contact: the real
# feature was named `community_detection_cluster_size`, which is on nobody's
# list and is plainly not about caste.
#
# The rule instead is contextual. `community` is permitted only when a
# graph-algorithm qualifier appears alongside it in the same name. That keeps
# `applicant_community` and `community_of_origin` prohibited, which is where the
# accidental version of this mistake actually looks like — a well-meaning
# connector field, not somebody deciding to use caste.
#
# It does not stop deliberate evasion, and no name-based check can. It exists to
# catch the accident, and a check with false positives gets suppressed, which is
# worse than no check at all.
_GRAPH_QUALIFIERS: frozenset[str] = frozenset(
    {
        "detection",
        "detect",
        "cluster",
        "clusters",
        "clustering",
        "louvain",
        "modularity",
        "component",
        "components",
        "partition",
        "id",
        "size",
        "count",
    }
)


def _tokenise(name: str) -> list[str]:
    """Split a field name into lowercase word tokens."""
    return [t for t in re.split(r"[^a-z0-9]+", name.lower()) if t]


# Split the prohibited set once, by arity. Single-token terms match by set
# intersection; multi-token terms ("mother_tongue", "place_of_birth") have to
# match as a contiguous phrase, because neither "mother" nor "tongue" is
# prohibited on its own.
_SINGLE_TOKEN: frozenset[str] = frozenset(t for t in PROHIBITED if "_" not in t)
_PHRASES: tuple[tuple[str, ...], ...] = tuple(tuple(t.split("_")) for t in PROHIBITED if "_" in t)


def is_prohibited(field_name: str) -> bool:
    """Whether a field name names a protected attribute or a close proxy.

    Token-based rather than substring-based: substring matching flags
    ``community_detection`` for containing "community", and a noisy check is one
    people learn to ignore.
    """
    tokens = _tokenise(field_name)
    hits = set(tokens) & _SINGLE_TOKEN
    if hits == {"community"} and set(tokens) & _GRAPH_QUALIFIERS:
        return False
    if hits:
        return True

    for phrase in _PHRASES:
        span = len(phrase)
        if any(tuple(tokens[i : i + span]) == phrase for i in range(len(tokens) - span + 1)):
            return True
    return False


def find_prohibited(field_names: Iterable[str]) -> list[str]:
    """Return every prohibited name in an iterable of field names."""
    return sorted(name for name in field_names if is_prohibited(name))
