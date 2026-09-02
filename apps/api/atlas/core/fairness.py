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

# Words that legitimately contain a prohibited token as a substring. Without
# these, `community_detection` (a graph algorithm) would be flagged as a caste
# proxy — and a check with false positives gets suppressed, which is worse than
# no check at all.
_ALLOWED_EXACT: frozenset[str] = frozenset(
    {
        "community_id",
        "community_detection",
        "community_size",
        "cluster_community",
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
    normalised = field_name.lower()
    if normalised in _ALLOWED_EXACT:
        return False

    tokens = _tokenise(normalised)
    if set(tokens) & _SINGLE_TOKEN:
        return True

    for phrase in _PHRASES:
        span = len(phrase)
        if any(tuple(tokens[i : i + span]) == phrase for i in range(len(tokens) - span + 1)):
            return True
    return False


def find_prohibited(field_names: Iterable[str]) -> list[str]:
    """Return every prohibited name in an iterable of field names."""
    return sorted(name for name in field_names if is_prohibited(name))
