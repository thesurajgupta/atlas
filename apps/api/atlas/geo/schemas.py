"""Geography API models (master spec §24)."""

from __future__ import annotations

import uuid

from pydantic import BaseModel

from atlas.core.enums import CashOutChannel


class EndpointSummary(BaseModel):
    """A cash-out endpoint as the map needs it.

    ``lat``/``lon`` are nullable, and that is a modelled fact rather than
    missing data: a ``CRYPTO_P2P`` off-ramp has no physical location, and
    imputing one would put a marker on a map where nothing exists (§8.1).
    """

    id: uuid.UUID
    public_ref: str
    channel: CashOutChannel
    operator: str
    jurisdiction_id: uuid.UUID | None
    h3_r8: str | None
    lat: float | None
    lon: float | None
    is_geolocatable: bool


class EndpointListResponse(BaseModel):
    items: list[EndpointSummary]
    total: int
