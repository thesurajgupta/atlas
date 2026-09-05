"""Case API models (master spec §26)."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from atlas.core.enums import CaseStatus, FraudTypology


class CaseSummary(BaseModel):
    """A case as it appears in a list.

    ``golden_hour_minutes_elapsed`` is derived rather than stored: it is a
    function of now, so persisting it would mean a number that is wrong the
    moment after it is written.
    """

    id: uuid.UUID
    public_ref: str
    title: str
    status: CaseStatus
    opened_at: datetime
    closed_at: datetime | None
    owning_jurisdiction_id: uuid.UUID
    assigned_to_id: uuid.UUID | None
    amount_at_risk: Decimal | None
    complaint_count: int
    golden_hour_minutes_elapsed: int | None = None


class CaseComplaintRef(BaseModel):
    """A complaint attached to a case, as much of it as the list view needs."""

    id: uuid.UUID
    public_ref: str
    typology: FraudTypology
    reported_amount: Decimal
    reported_at: datetime


class CaseDetail(CaseSummary):
    complaints: list[CaseComplaintRef]


class CaseListResponse(BaseModel):
    """Cases the caller may see, with the total *they* can see.

    ``total`` is scoped to the caller's jurisdiction, not the table count.
    Returning a global total would leak how much exists elsewhere — the same
    reason a cross-jurisdiction read is a 404 rather than a 403 (§29).
    """

    items: list[CaseSummary]
    total: int
