"""Alert API models (master spec §35.1).

Raised and suppressed alerts come back from the same endpoint, distinguished by
``raised`` rather than split into two responses. The console shows suppressions
in a collapsed section, and a client that had to call twice to build one list
would be one forgotten call away from a screen that quietly claims nothing was
decided.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from atlas.core.enums import AlertSeverity, EvidenceSufficiency


class AlertSummary(BaseModel):
    """One decision the alert policy made.

    ``reason`` is present on both outcomes and is the field that matters most on
    a suppressed row: it is the only record of why nobody was told.
    """

    id: uuid.UUID
    case_ref: str
    jurisdiction_id: uuid.UUID
    #: Null when suppressed — a suppressed alert was never rated.
    severity: AlertSeverity | None
    raised: bool
    reason: str
    issued_at: datetime
    acknowledged_at: datetime | None
    acknowledged_by_id: uuid.UUID | None


class AlertEvaluateRequest(BaseModel):
    """A candidate to put through the alert policy.

    Carries no probability. Nothing in ATLAS is calibrated, so a threshold on a
    probability would look principled and be arbitrary — evidence sufficiency is
    the honest band available today (§16.2) and it is what gates severity.
    """

    case_ref: str = Field(min_length=1, max_length=32)
    typology: str = Field(min_length=1, max_length=64)
    evidence: EvidenceSufficiency
    amount_at_risk: Decimal = Field(gt=0, max_digits=18, decimal_places=2)
    fraud_initiated_at: datetime
    top_candidate_ref: str | None = Field(default=None, max_length=64)


class AlertListResponse(BaseModel):
    """Alerts the caller may see, with the totals *they* can see.

    ``total`` is scoped to the caller's jurisdiction, not the table count — a
    global total would leak how much is happening elsewhere, which is the same
    reason ``ComplaintListResponse`` scopes its own.

    ``raised_total`` and ``suppressed_total`` are separated because they answer
    different questions. "How many interruptions did we send" and "how many did
    we withhold" are both operational facts, and a single number that mixes them
    answers neither.
    """

    items: list[AlertSummary]
    total: int
    raised_total: int
    suppressed_total: int
