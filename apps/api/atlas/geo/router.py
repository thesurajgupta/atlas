"""Cash-out endpoint endpoints (master spec §24, §29)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select

from atlas.audit.service import Actor, AuditRequest, record
from atlas.core import context
from atlas.core.enums import CashOutChannel
from atlas.geo.models import CashOutEndpoint
from atlas.geo.schemas import EndpointListResponse, EndpointSummary
from atlas.iam.authz import Permission, jurisdiction_scope
from atlas.iam.dependencies import SessionDep, require
from atlas.iam.models import Investigator

router = APIRouter(prefix="/api/v1/geo", tags=["geo"])

CanRead = Annotated[Investigator, Depends(require(Permission.PREDICTION_READ))]


def _audit_actor(request: Request, investigator: Investigator) -> Actor:
    return Actor(
        id=investigator.id,
        role=investigator.role.value,
        jurisdiction=str(investigator.jurisdiction_id),
        source_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:256] or None,
    )


@router.get("/endpoints", response_model=EndpointListResponse)
async def list_endpoints(
    request: Request,
    session: SessionDep,
    investigator: CanRead,
    channel: CashOutChannel | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> EndpointListResponse:
    """Cash-out endpoints inside the caller's jurisdiction subtree.

    Endpoints with no owning jurisdiction are excluded rather than shown to
    everyone. An unowned row is a data-quality problem, and the safe reading of
    one is "nobody may see this" — the same posture `can_access_jurisdiction`
    takes (§29).

    Coordinates are read out of PostGIS here rather than stored twice. The
    geometry column is the single source of position; a denormalised lat/lon
    pair is one more thing to keep in step for no gain at this size.
    """
    scope = await jurisdiction_scope(session, investigator.jurisdiction_id)

    base = select(CashOutEndpoint).where(CashOutEndpoint.jurisdiction_id.in_(scope))
    if channel is not None:
        base = base.where(CashOutEndpoint.channel == channel)

    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    rows = await session.execute(
        base.order_by(CashOutEndpoint.public_ref).limit(limit).offset(offset)
    )
    endpoints = list(rows.scalars())

    coords: dict[str, tuple[float | None, float | None]] = {}
    if endpoints:
        located = await session.execute(
            select(
                CashOutEndpoint.public_ref,
                func.ST_Y(CashOutEndpoint.geom),
                func.ST_X(CashOutEndpoint.geom),
            ).where(CashOutEndpoint.public_ref.in_([e.public_ref for e in endpoints]))
        )
        coords = {ref: (lat, lon) for ref, lat, lon in located}

    items = []
    for e in endpoints:
        lat, lon = coords.get(e.public_ref, (None, None))
        items.append(
            EndpointSummary(
                id=e.id,
                public_ref=e.public_ref,
                channel=e.channel,
                operator=e.operator,
                jurisdiction_id=e.jurisdiction_id,
                h3_r8=e.h3_r8,
                lat=lat,
                lon=lon,
                is_geolocatable=e.channel.is_geolocatable,
            )
        )

    await record(
        session,
        AuditRequest(
            action="geo.endpoints.list",
            resource_type="cash_out_endpoint",
            resource_id="*",
            result="allowed",
            correlation_id=context.get_correlation_id(),
            detail={"returned": len(items), "channel": channel.value if channel else None},
        ),
        _audit_actor(request, investigator),
    )
    return EndpointListResponse(items=items, total=total or 0)
