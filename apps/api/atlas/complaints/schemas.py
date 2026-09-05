"""Complaint API models (master spec §11)."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from atlas.core.enums import FraudTypology


class ComplaintCreate(BaseModel):
    """An incoming complaint.

    `occurred_at` is when the fraud began, as reported. `observed_at` is set by
    the server to now — when ATLAS could first have known. They are not the same
    thing, and only the second may ever bound a feature read (§19.1), so the
    client is not permitted to supply it.
    """

    public_ref: str = Field(min_length=1, max_length=32)
    reported_at: datetime
    fraud_initiated_at: datetime | None = None
    typology: FraudTypology
    reported_amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    victim_jurisdiction_id: uuid.UUID
    narrative: str | None = Field(default=None, max_length=8000)
    reported_beneficiary_account: str | None = Field(default=None, max_length=64)
    reported_beneficiary_ifsc: str | None = Field(default=None, max_length=16)


class ComplaintResponse(BaseModel):
    id: uuid.UUID
    public_ref: str
    reported_at: datetime
    fraud_initiated_at: datetime | None
    observed_at: datetime
    typology: FraudTypology
    reported_amount: Decimal
    currency: str
    victim_jurisdiction_id: uuid.UUID | None
    is_synthetic: bool
    golden_hour_minutes_elapsed: int | None = None


class ComplaintListResponse(BaseModel):
    """Complaints the caller may see, with the total *they* can see.

    ``total`` is scoped to the caller's jurisdiction, not the table count —
    a global total would leak how much exists elsewhere.
    """

    items: list[ComplaintResponse]
    total: int
