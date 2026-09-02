"""Data classification and masking (master spec §30).

Classification is attached to data, not to endpoints, so that a field carries its
sensitivity wherever it travels — into a log, an export, or an outbound
intelligence package.
"""

from __future__ import annotations

from enum import StrEnum


class Classification(StrEnum):
    """Sensitivity level. Ordered least to most restricted."""

    PUBLIC = "PUBLIC"
    INTERNAL = "INTERNAL"
    SENSITIVE = "SENSITIVE"
    HIGHLY_SENSITIVE = "HIGHLY_SENSITIVE"
    RESTRICTED = "RESTRICTED"


def mask_account(number: str, *, visible: int = 4) -> str:
    """Mask an account identifier, preserving length.

    ``123456789012`` -> ``XXXXXXXX9012``

    Length is preserved deliberately. A mask that shortens the value leaks the
    fact that it was shortened, and account-number length is itself a weak
    signal about the issuing institution. The predecessor brief's own example
    was inconsistent on exactly this point.
    """
    if visible < 0:
        raise ValueError("visible must be non-negative")
    if len(number) <= visible:
        return "X" * len(number)
    return "X" * (len(number) - visible) + number[-visible:]
