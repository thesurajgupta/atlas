"""Audit read endpoint (master spec §32, §29).

The hash-chained store and the Ed25519 checkpoint signing were built; nothing
could read them over HTTP. An integrity guarantee that requires shell access to
the server is one nobody outside the team can check, and therefore one nobody
outside the team has reason to trust.

## Denials are the point

ATLAS answers **404, not 403**, when someone reads across a jurisdiction
boundary — a 403 would confirm the record exists and let somebody map other
jurisdictions by probing. That is a deliberate lie to the caller, and it is only
defensible because the truth is written down somewhere: ``result="denied"`` with
the real reason in ``detail``.

This endpoint is that somewhere. An audit API returning only successes would
discard the most important row type in the table and make the 404 policy
unauditable. ``?result=denied`` is the query a supervisor actually runs, and it
is supported first-class.

## Read-only, and structurally so

There is no write, edit or delete route here and there must never be. The audit
schema is append-only *by grant* — ``atlas_app`` holds ``SELECT, INSERT`` with
``UPDATE`` and ``DELETE`` revoked in migration ``b1c2d3e4f5a6`` — and that
revoke is what makes the chain mean anything. An endpoint that edited an event
would need privileges the database deliberately withholds.

## Why this lives in ``atlas.audit_api`` and not ``atlas.audit``

``atlas.audit`` sits below ``atlas.iam`` in the layering contract because
``iam/router.py`` records every login through ``audit.service``. A router has to
authenticate, which means importing ``atlas.iam`` — the one thing a module at
that depth may not do. See ``atlas/audit_api/__init__.py``.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select

from atlas.audit.models import AuditCheckpoint, AuditEvent
from atlas.audit.service import Actor, AuditRequest, count_events, record, verify_chain
from atlas.audit_api.schemas import AuditEventOut, AuditListResponse, ChainStatus
from atlas.core import context
from atlas.core.errors import ForbiddenError
from atlas.iam import authz
from atlas.iam.authz import Permission, jurisdiction_scope
from atlas.iam.dependencies import CurrentInvestigator, SessionDep
from atlas.iam.models import Investigator

router = APIRouter(prefix="/api/v1/audit", tags=["audit"])


async def require_audit_read(investigator: CurrentInvestigator) -> Investigator:
    """Gate on ``audit:read``, refusing with **403** rather than 404.

    Every other endpoint in this codebase uses ``require()``, which raises
    ``AuthorizationError`` and answers 404 so that probing cannot enumerate
    records. That reasoning does not apply here, and copying it would be
    cargo-culting a defence against a threat this route does not have.

    The audit endpoint's *existence* is published in the OpenAPI schema. Nothing
    is protected by pretending it is absent, and an auditor whose role was
    misconfigured would be told the API does not exist instead of that their
    permissions are wrong — a worse answer that hides an operational fault.

    The refusal is still role-level only. Which *rows* a caller may read is
    decided in the query below, and that decision discloses nothing.
    """
    if not authz.has_permission(investigator.role, Permission.AUDIT_READ):
        raise ForbiddenError(
            f"role {investigator.role.value} lacks {Permission.AUDIT_READ.value}",
            role=investigator.role.value,
            permission=Permission.AUDIT_READ.value,
        )
    return investigator


CanReadAudit = Annotated[Investigator, Depends(require_audit_read)]


def _audit_actor(request: Request, investigator: Investigator) -> Actor:
    return Actor(
        id=investigator.id,
        role=investigator.role.value,
        jurisdiction=str(investigator.jurisdiction_id),
        source_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:256] or None,
    )


def _to_out(event: AuditEvent) -> AuditEventOut:
    return AuditEventOut(
        id=event.id,
        sequence=event.sequence,
        occurred_at=event.occurred_at,
        actor_id=event.actor_id,
        actor_role=event.actor_role,
        actor_jurisdiction=event.actor_jurisdiction,
        action=event.action,
        resource_type=event.resource_type,
        resource_id=event.resource_id,
        case_id=event.case_id,
        result=event.result,
        correlation_id=event.correlation_id,
        source_ip=event.source_ip,
        user_agent=event.user_agent,
        detail=event.detail,
        previous_event_hash=event.previous_event_hash,
        event_hash=event.event_hash,
    )


async def _chain_status(session: SessionDep) -> ChainStatus:
    """Verify the chain and find the newest signed checkpoint.

    Verification recomputes every hash rather than reading a stored flag — a
    stored flag would be exactly as forgeable as the rows it describes. It calls
    ``audit.service.verify_chain``, the same function ``scripts/verify_audit_chain.py``
    uses; a second implementation of an integrity check would eventually
    disagree with the first, and the disagreement would be silent.

    **Cost is honest rather than hidden.** This walks the whole chain on every
    request, which is fine at this project's volume and will not be at ten
    million events. ``verify_chain`` already accepts a ``start``, so the fix when
    it is needed is to verify forward from the last signed checkpoint and let the
    signature attest the prefix. That is a real change in what ``verified``
    claims, so it is not made pre-emptively here.
    """
    verification = await verify_chain(session)
    latest = await session.scalar(select(func.max(AuditCheckpoint.created_at)))
    return ChainStatus(
        verified=verification.ok,
        events=await count_events(session),
        last_checkpoint_at=latest,
        first_bad_sequence=verification.first_bad_sequence,
        reason=verification.reason,
    )


@router.get("", response_model=AuditListResponse)
async def list_audit_events(
    request: Request,
    session: SessionDep,
    investigator: CanReadAudit,
    result: Annotated[str | None, Query(pattern="^(allowed|denied)$")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AuditListResponse:
    """Audit events for the caller's jurisdiction, newest first, with chain status.

    ``result=denied`` returns the refusals, each carrying the real reason the
    caller was never told. That is the query a supervisor runs when asking why
    somebody could not see something, and it is the reason this endpoint exists.

    Ordered by ``sequence`` descending rather than by ``occurred_at``. The
    sequence is gapless and unique; two events written in the same millisecond
    would order arbitrarily by timestamp, and an audit listing that changes order
    between identical requests is one nobody can cite.

    Scoping is applied **in the query**. An event outside the caller's
    jurisdiction is never loaded, never counted in ``total`` and never reaches a
    log line. Events with no actor jurisdiction — system actions — are visible
    only to national roles, matching ``can_access_jurisdiction``: an unowned
    record is refused to everyone else rather than shown to everyone.
    """
    scoped = select(AuditEvent)
    counted = select(func.count()).select_from(AuditEvent)

    if investigator.role not in authz.NATIONAL_ROLES:
        scope = {str(j) for j in await jurisdiction_scope(session, investigator.jurisdiction_id)}
        scoped = scoped.where(AuditEvent.actor_jurisdiction.in_(scope))
        counted = counted.where(AuditEvent.actor_jurisdiction.in_(scope))

    if result is not None:
        scoped = scoped.where(AuditEvent.result == result)
        counted = counted.where(AuditEvent.result == result)

    total = await session.scalar(counted)
    rows = await session.execute(
        scoped.order_by(AuditEvent.sequence.desc()).limit(limit).offset(offset)
    )
    events = list(rows.scalars())

    chain = await _chain_status(session)

    # Reading the audit log is itself an audited operation. An audit trail that
    # does not record who read it has a hole in exactly the place a misuse would
    # be visible.
    await record(
        session,
        AuditRequest(
            action="audit.list",
            resource_type="audit_event",
            resource_id="*",
            result="allowed",
            correlation_id=context.get_correlation_id(),
            detail={
                "returned": len(events),
                "result_filter": result,
                "chain_verified": chain.verified,
            },
        ),
        _audit_actor(request, investigator),
    )

    return AuditListResponse(
        items=[_to_out(event) for event in events],
        total=int(total or 0),
        chain=chain,
    )
