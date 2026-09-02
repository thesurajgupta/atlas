"""Synthetic identifiers.

Real account numbers are never primary keys, in any environment (master spec §5).
Every externally-visible identifier is synthetic, prefixed by entity type so that
a value appearing in a log or a screenshot is immediately recognisable as
non-production data.
"""

from __future__ import annotations

import uuid
from enum import StrEnum


class IdPrefix(StrEnum):
    """Type prefixes for human-readable synthetic identifiers."""

    COMPLAINT = "CMP"
    CASE = "CASE"
    ACCOUNT = "ACC"
    TRANSACTION = "TXN"
    ENDPOINT = "EP"
    ENTITY = "ENT"
    ALERT = "ALT"
    PREDICTION = "PRD"
    INTERVENTION = "INT"
    EVIDENCE = "EVD"
    PACKAGE = "PKG"
    INVESTIGATOR = "USR"


def new_id() -> uuid.UUID:
    """Internal immutable identifier. Never exposed to users."""
    return uuid.uuid4()


def public_ref(prefix: IdPrefix, sequence: int) -> str:
    """Human-quotable reference, e.g. ``CASE-SYN-0000914``.

    The ``SYN`` segment is deliberate and permanent: it marks the value as
    synthetic wherever it is seen — a log line, a screenshot, a slide. If ATLAS
    is ever deployed against authorised real data, that segment changes and the
    difference is visible at a glance rather than buried in configuration.
    """
    return f"{prefix.value}-SYN-{sequence:07d}"
