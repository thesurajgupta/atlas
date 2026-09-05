"""Complaint endpoints — the vertical slice (master spec §11, §29)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import select

from atlas.audit.service import Actor, AuditRequest, record
from atlas.complaints.models import Complaint
from atlas.complaints.schemas import ComplaintCreate, ComplaintResponse
from atlas.core import context
from atlas.core.classification import Classification
from atlas.core.clock import golden_hour_position, utc_now
from atlas.core.errors import NotFoundError, ValidationError
from atlas.iam.authz import Permission
from atlas.iam.dependencies import SessionDep, authorize_resource, require
from atlas.iam.models import Investigator

router = APIRouter(prefix="/api/v1/complaints", tags=["complaints"])

CanRead = Annotated[Investigator, Depends(require(Permission.COMPLAINT_READ))]
CanCreate = Annotated[Investigator, Depends(require(Permission.COMPLAINT_CREATE))]


def _to_response(complaint: Complaint) -> ComplaintResponse:
    elapsed = None
    if complaint.fraud_initiated_at is not None:
        elapsed = int(golden_hour_position(complaint.fraud_initiated_at).total_seconds() // 60)
    return ComplaintResponse(
        id=complaint.id,
        public_ref=complaint.public_ref,
        reported_at=complaint.reported_at,
        fraud_initiated_at=complaint.fraud_initiated_at,
        observed_at=complaint.observed_at,
        typology=complaint.typology,
        reported_amount=complaint.reported_amount,
        currency=complaint.currency,
        victim_jurisdiction_id=complaint.victim_jurisdiction_id,
        is_synthetic=complaint.is_synthetic,
        golden_hour_minutes_elapsed=elapsed,
    )


def _audit_actor(request: Request, investigator: Investigator) -> Actor:
    return Actor(
        id=investigator.id,
        role=investigator.role.value,
        jurisdiction=str(investigator.jurisdiction_id),
        source_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:256] or None,
    )


@router.post("", response_model=ComplaintResponse, status_code=status.HTTP_201_CREATED)
async def create_complaint(
    payload: ComplaintCreate,
    request: Request,
    session: SessionDep,
    investigator: CanCreate,
) -> ComplaintResponse:
    """Record a complaint.

    `observed_at` is stamped server-side as now. Letting a client supply it would
    hand an attacker — or a careless integration — the ability to backdate a fact
    into a window a model has already trained on.
    """
    await authorize_resource(
        session, investigator, resource_jurisdiction_id=payload.victim_jurisdiction_id
    )

    existing = await session.execute(
        select(Complaint.id).where(Complaint.public_ref == payload.public_ref)
    )
    if existing.scalar_one_or_none() is not None:
        raise ValidationError(f"complaint {payload.public_ref} already exists")

    complaint = Complaint(
        public_ref=payload.public_ref,
        reported_at=payload.reported_at,
        fraud_initiated_at=payload.fraud_initiated_at,
        observed_at=utc_now(),
        typology=payload.typology,
        reported_amount=payload.reported_amount,
        currency=payload.currency,
        victim_jurisdiction_id=payload.victim_jurisdiction_id,
        narrative=payload.narrative,
        reported_beneficiary_account=payload.reported_beneficiary_account,
        reported_beneficiary_ifsc=payload.reported_beneficiary_ifsc,
        source_system="api",
        source_record_id=payload.public_ref,
        classification=Classification.SENSITIVE,
        is_synthetic=True,
    )
    session.add(complaint)
    await session.flush()

    await record(
        session,
        AuditRequest(
            action="complaint.create",
            resource_type="complaint",
            resource_id=complaint.public_ref,
            result="allowed",
            correlation_id=context.get_correlation_id(),
            detail={
                "typology": payload.typology.value,
                "jurisdiction": str(payload.victim_jurisdiction_id),
                "break_glass": context.break_glass_used(),
            },
        ),
        _audit_actor(request, investigator),
    )
    return _to_response(complaint)


@router.get("/{complaint_id}", response_model=ComplaintResponse)
async def get_complaint(
    complaint_id: uuid.UUID,
    request: Request,
    session: SessionDep,
    investigator: CanRead,
) -> ComplaintResponse:
    """Fetch one complaint, if it is inside the caller's jurisdiction.

    A complaint outside the caller's scope returns **404, not 403**. A 403 would
    confirm the id exists, letting someone map cases in other jurisdictions by
    probing. The denial is recorded in the audit log with the real reason.
    """
    complaint = await session.get(Complaint, complaint_id)
    if complaint is None:
        raise NotFoundError("complaint not found")

    try:
        await authorize_resource(
            session, investigator, resource_jurisdiction_id=complaint.victim_jurisdiction_id
        )
    except Exception:
        await record(
            session,
            AuditRequest(
                action="complaint.read",
                resource_type="complaint",
                resource_id=complaint.public_ref,
                result="denied",
                correlation_id=context.get_correlation_id(),
                detail={"reason": "outside jurisdiction"},
            ),
            _audit_actor(request, investigator),
        )
        await session.commit()
        raise

    await record(
        session,
        AuditRequest(
            action="complaint.read",
            resource_type="complaint",
            resource_id=complaint.public_ref,
            result="allowed",
            correlation_id=context.get_correlation_id(),
            detail={"break_glass": context.break_glass_used()},
        ),
        _audit_actor(request, investigator),
    )
    return _to_response(complaint)
