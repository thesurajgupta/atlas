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

from pydantic import BaseModel

from atlas.core.enums import AlertSeverity


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
