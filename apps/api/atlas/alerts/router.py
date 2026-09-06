"""Alert endpoints (master spec §29, §35.1).

Reads are scoped to the caller's jurisdiction subtree, applied **in the query**
rather than by filtering results — an alert outside that scope is never loaded,
never counted in a total, and never reaches a log line.

Suppressed alerts are returned alongside raised ones. Withholding them here
would undo the reason they are stored: the record of a decision nobody can see
is not a record anybody can review.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select

from atlas.alerts.models import Alert
from atlas.alerts.schemas import AlertListResponse, AlertSummary
from atlas.audit.service import Actor, AuditRequest, record
from atlas.core import context
from atlas.iam.authz import Permission, jurisdiction_scope
from atlas.iam.dependencies import SessionDep, require
from atlas.iam.models import Investigator

router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])

CanRead = Annotated[Investigator, Depends(require(Permission.ALERT_READ))]


def _audit_actor(request: Request, investigator: Investigator) -> Actor:
    return Actor(
        id=investigator.id,
        role=investigator.role.value,
        jurisdiction=str(investigator.jurisdiction_id),
        source_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:256] or None,
    )


def _to_summary(alert: Alert) -> AlertSummary:
    return AlertSummary(
        id=alert.id,
        case_ref=alert.case_ref,
        jurisdiction_id=alert.jurisdiction_id,
        severity=alert.severity,
        raised=alert.raised,
        reason=alert.reason,
        issued_at=alert.issued_at,
        acknowledged_at=alert.acknowledged_at,
        acknowledged_by_id=alert.acknowledged_by_id,
    )


@router.get("", response_model=AlertListResponse)
async def list_alerts(
    request: Request,
    session: SessionDep,
    investigator: CanRead,
    raised: Annotated[bool | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AlertListResponse:
    """Alert decisions inside the caller's jurisdiction subtree, newest first.

    Returns **raised and suppressed decisions together**, separated by the
    ``raised`` flag, so a client can render withheld alerts in their own section
    without a second request. ``raised=true`` or ``raised=false`` narrows to one
    kind when a caller genuinely wants only that.

    The two totals are always computed over the whole scoped set, not over the
    filtered page. A console showing "3 suppressed" while filtered to raised
    alerts would otherwise report zero, and the count of decisions nobody was
    told about is the one figure this endpoint exists to surface.
    """
    scope = await jurisdiction_scope(session, investigator.jurisdiction_id)
    scoped = select(Alert).where(Alert.jurisdiction_id.in_(scope))

    raised_total = await session.scalar(
        select(func.count())
        .select_from(Alert)
        .where(Alert.jurisdiction_id.in_(scope), Alert.raised.is_(True))
    )
    suppressed_total = await session.scalar(
        select(func.count())
        .select_from(Alert)
        .where(Alert.jurisdiction_id.in_(scope), Alert.raised.is_(False))
    )

    page = scoped if raised is None else scoped.where(Alert.raised.is_(raised))
    rows = await session.execute(
        page.order_by(Alert.issued_at.desc(), Alert.id).limit(limit).offset(offset)
    )
    alerts = list(rows.scalars())

    await record(
        session,
        AuditRequest(
            action="alert.list",
            resource_type="alert",
            resource_id="*",
            result="allowed",
            correlation_id=context.get_correlation_id(),
            detail={
                "returned": len(alerts),
                "scope_size": len(scope),
                "raised_filter": raised,
            },
        ),
        _audit_actor(request, investigator),
    )

    return AlertListResponse(
        items=[_to_summary(alert) for alert in alerts],
        total=int(raised_total or 0) + int(suppressed_total or 0),
        raised_total=int(raised_total or 0),
        suppressed_total=int(suppressed_total or 0),
    )
