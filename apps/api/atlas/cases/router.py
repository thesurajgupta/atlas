"""Case endpoints (master spec §26, §29)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select

from atlas.audit.service import Actor, AuditRequest, record
from atlas.cases.models import Case, CaseComplaintLink
from atlas.cases.schemas import (
    CaseComplaintRef,
    CaseDetail,
    CaseListResponse,
    CaseSummary,
)
from atlas.complaints.models import Complaint
from atlas.core import context
from atlas.core.clock import golden_hour_position
from atlas.core.errors import NotFoundError
from atlas.iam.authz import Permission, jurisdiction_scope
from atlas.iam.dependencies import SessionDep, authorize_resource, require
from atlas.iam.models import Investigator

router = APIRouter(prefix="/api/v1/cases", tags=["cases"])

CanRead = Annotated[Investigator, Depends(require(Permission.CASE_READ))]


def _audit_actor(request: Request, investigator: Investigator) -> Actor:
    return Actor(
        id=investigator.id,
        role=investigator.role.value,
        jurisdiction=str(investigator.jurisdiction_id),
        source_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:256] or None,
    )


def _summary(case: Case, complaint_count: int, earliest: datetime | None) -> CaseSummary:
    # Golden-hour position is measured from the earliest fraud start across the
    # case's complaints — the clock the case is actually racing, not when the
    # case record happened to be opened.
    elapsed = (
        int(golden_hour_position(earliest).total_seconds() // 60) if earliest is not None else None
    )
    return CaseSummary(
        id=case.id,
        public_ref=case.public_ref,
        title=case.title,
        status=case.status,
        opened_at=case.opened_at,
        closed_at=case.closed_at,
        owning_jurisdiction_id=case.owning_jurisdiction_id,
        assigned_to_id=case.assigned_to_id,
        amount_at_risk=case.amount_at_risk,
        complaint_count=complaint_count,
        golden_hour_minutes_elapsed=elapsed,
    )


@router.get("", response_model=CaseListResponse)
async def list_cases(
    request: Request,
    session: SessionDep,
    investigator: CanRead,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CaseListResponse:
    """Cases inside the caller's jurisdiction subtree.

    Scoped in the *query*, not filtered after the fact. Fetching everything and
    dropping rows the caller may not see is the version of this that leaks
    through a count, a total, or a stray log line.
    """
    scope = await jurisdiction_scope(session, investigator.jurisdiction_id)

    base = select(Case).where(Case.owning_jurisdiction_id.in_(scope))
    total = await session.scalar(select(func.count()).select_from(base.subquery()))

    rows = await session.execute(base.order_by(Case.opened_at.desc()).limit(limit).offset(offset))
    cases = list(rows.scalars())

    summaries: list[CaseSummary] = []
    for case in cases:
        count = await session.scalar(
            select(func.count())
            .select_from(CaseComplaintLink)
            .where(CaseComplaintLink.case_id == case.id)
        )
        earliest = await session.scalar(
            select(func.min(Complaint.fraud_initiated_at))
            .select_from(Complaint)
            .join(CaseComplaintLink, CaseComplaintLink.complaint_id == Complaint.id)
            .where(CaseComplaintLink.case_id == case.id)
        )
        summaries.append(_summary(case, count or 0, earliest))

    await record(
        session,
        AuditRequest(
            action="case.list",
            resource_type="case",
            resource_id="*",
            result="allowed",
            correlation_id=context.get_correlation_id(),
            detail={"returned": len(summaries), "scope_size": len(scope)},
        ),
        _audit_actor(request, investigator),
    )
    return CaseListResponse(items=summaries, total=total or 0)


@router.get("/{case_id}", response_model=CaseDetail)
async def get_case(
    case_id: uuid.UUID,
    request: Request,
    session: SessionDep,
    investigator: CanRead,
) -> CaseDetail:
    """One case with its attached complaints.

    Outside the caller's jurisdiction this is a **404, not a 403** — a 403 would
    confirm the id exists and let someone map other jurisdictions by probing.
    The denial is audited with the real reason (§29).
    """
    case = await session.get(Case, case_id)
    if case is None:
        raise NotFoundError("case not found")

    try:
        await authorize_resource(
            session, investigator, resource_jurisdiction_id=case.owning_jurisdiction_id
        )
    except Exception:
        await record(
            session,
            AuditRequest(
                action="case.read",
                resource_type="case",
                resource_id=case.public_ref,
                result="denied",
                correlation_id=context.get_correlation_id(),
                detail={"reason": "outside jurisdiction"},
            ),
            _audit_actor(request, investigator),
        )
        await session.commit()
        raise

    linked = await session.execute(
        select(Complaint)
        .join(CaseComplaintLink, CaseComplaintLink.complaint_id == Complaint.id)
        .where(CaseComplaintLink.case_id == case.id)
        .order_by(Complaint.reported_at.desc())
    )
    complaints = list(linked.scalars())
    earliest = min((c.fraud_initiated_at for c in complaints if c.fraud_initiated_at), default=None)

    await record(
        session,
        AuditRequest(
            action="case.read",
            resource_type="case",
            resource_id=case.public_ref,
            result="allowed",
            correlation_id=context.get_correlation_id(),
            detail={"break_glass": context.break_glass_used()},
        ),
        _audit_actor(request, investigator),
    )

    summary = _summary(case, len(complaints), earliest)
    return CaseDetail(
        **summary.model_dump(),
        complaints=[
            CaseComplaintRef(
                id=c.id,
                public_ref=c.public_ref,
                typology=c.typology,
                reported_amount=c.reported_amount,
                reported_at=c.reported_at,
            )
            for c in complaints
        ],
    )
