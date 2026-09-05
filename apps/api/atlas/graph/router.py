"""Graph endpoints — money trail and artefact neighbourhood (master spec §14, §14.1).

These expose :func:`atlas.graph.trail.reconstruct_trail` and
:func:`atlas.graph.artefacts.artefact_neighbourhood`. Neither is reimplemented
here: the reasoning that makes a money trail different from graph reachability
lives in ``trail.py``, and an endpoint that re-derived any part of it would be a
second copy of that reasoning to keep correct.

**What this layer is responsible for**

* Requiring a caller, and a role that may read investigative evidence.
* Requiring ``as_of``, timezone-aware, with no default — the parameter that
  makes the answer a reconstruction of a moment rather than of now.
* Projecting the domain objects onto the wire without adding to them.
* Recording that the read happened.

**What it must not do** is relax any of the three constraints in ``trail.py``'s
module docstring. Every one of them is enforced inside the CTE, which is why
this handler passes the query through rather than filtering the result: a
post-filter here would be a second, weaker copy of a bound that already holds.

Point-in-time correctness therefore arrives for free and stays that way — there
is no code path in this module that can return an edge with
``observed_at > as_of``, because there is no code path in this module that reads
an edge at all.

---

**A contract gap, recorded rather than papered over.**

Issue #62 specifies ``GET /api/v1/graph/trail/{case_id}`` and jurisdiction
authorization against that case: a case in another jurisdiction returns 404, not
403. That is the right rule and it is not implementable from this module today,
for two independent reasons:

1. **Nothing links a case to an origin entity.** ``cases.case_complaint_link``
   joins cases to complaints, and a complaint carries a beneficiary account as a
   *string*, not a resolved ``entity.canonical_entity`` id. A ``{case_id}`` in
   the path could not select an origin to walk from.
2. **``atlas.graph`` may not import ``atlas.cases``.** The layering contract
   (ADR-009, ``.importlinter``) places ``cases`` above ``graph``, so this module
   cannot read a case's ``owning_jurisdiction_id`` — and reading another
   module's schema directly to get it is exactly what that contract forbids.

Accepting a ``case_id`` we could neither resolve nor authorize against would be
worse than not accepting one: a path segment that looks like an access-control
boundary and is not. So the origin entity is the addressed resource, and
authorization here is **role-based only** — see :data:`CanReadGraph`.

That is a real narrowing of §29's intent and it is stated plainly rather than
implied. Closing it needs one of: an owning jurisdiction on
``entity.canonical_entity``, or a service interface on ``atlas.cases`` exposing
a case's jurisdiction to lower layers. Both are larger than this endpoint.

The neighbourhood endpoint has no such gap: ``artefact_link`` carries a
denormalised jurisdiction on both ends of every link precisely so the decision
can be made without reading the far row, and ``artefacts.py`` applies it.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from atlas.audit.service import Actor, AuditRequest, record
from atlas.core import context
from atlas.core.enums import NodeKind
from atlas.graph.artefacts import artefact_neighbourhood
from atlas.graph.schemas import (
    NeighbourhoodQueryParams,
    NeighbourhoodResponse,
    TrailPathOut,
    TrailQueryParams,
    TrailResponse,
)
from atlas.graph.trail import reconstruct_trail
from atlas.iam.authz import Permission
from atlas.iam.dependencies import CurrentInvestigator, SessionDep, require
from atlas.iam.models import Investigator

router = APIRouter(prefix="/api/v1/graph", tags=["graph"])

#: Reading a money trail is reading financial evidence, so it is gated on
#: ``evidence:read``.
#:
#: That is narrower than ``complaint:read`` on purpose. A trail is the movement
#: of money between resolved entities, and the roles holding it are the ones
#: with an investigative reason to follow money: national and state analysts and
#: district investigators. ``READ_ONLY_ANALYST`` and ``BANK_PARTNER`` do not hold
#: it and do not get one — a bank partner's entire surface is the outbound
#: package it is sent (§28.1), not the graph it was derived from.
_REQUIRED_PERMISSION = Permission.EVIDENCE_READ

_check_permission = require(_REQUIRED_PERMISSION)


def _audit_actor(request: Request, investigator: Investigator) -> Actor:
    return Actor(
        id=investigator.id,
        role=investigator.role.value,
        jurisdiction=str(investigator.jurisdiction_id),
        source_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:256] or None,
    )


async def audited_graph_reader(
    request: Request,
    session: SessionDep,
    investigator: CurrentInvestigator,
) -> Investigator:
    """Enforce ``evidence:read``, and record the refusal when it fails.

    The check itself is ``iam.dependencies.require`` — called, not reimplemented,
    so there is one definition of what the permission means and this only adds
    the record.

    **Why the record needs its own dependency.** A refused caller is told 404,
    which is a deliberate lie: a 403 would confirm the endpoint had something to
    withhold, and probing it would map what exists. The audit log is the only
    place the truth is written down, so a denial that is not recorded is a denial
    nobody can review — and a run of them, which is what someone probing the
    graph looks like from the inside, would be invisible. ``require`` raises from
    inside FastAPI's dependency solver, before any handler body runs, so a
    handler cannot record it; hence this wrapper rather than a ``try`` in each
    endpoint.

    The event is committed before the exception propagates. Without that it
    unwinds with the request's transaction, and the record of a refusal
    disappears exactly when it is needed — the same reason ``iam.router`` commits
    a failed login separately.
    """
    try:
        return await _check_permission(investigator)
    except Exception:
        await record(
            session,
            AuditRequest(
                action="graph.read",
                resource_type="graph",
                # The path, because the resource is whatever the caller asked
                # for and both endpoints share this dependency. Truncated to the
                # column width rather than risking a write failure that would
                # turn an audited denial into an unaudited 500.
                resource_id=request.url.path[:96],
                result="denied",
                correlation_id=context.get_correlation_id(),
                detail={
                    "reason": f"role lacks {_REQUIRED_PERMISSION.value}",
                    "role": investigator.role.value,
                },
            ),
            _audit_actor(request, investigator),
        )
        await session.commit()
        raise


CanReadGraph = Annotated[Investigator, Depends(audited_graph_reader)]

TrailParams = Annotated[TrailQueryParams, Query()]
NeighbourhoodParams = Annotated[NeighbourhoodQueryParams, Query()]


@router.get("/trail/{origin_entity_id}", response_model=TrailResponse)
async def get_trail(
    origin_entity_id: uuid.UUID,
    params: TrailParams,
    request: Request,
    session: SessionDep,
    investigator: CanReadGraph,
) -> TrailResponse:
    """Reconstruct the money trail forward from an entity, as of an instant.

    Every returned path satisfies the three constraints ``trail.py`` exists to
    hold: hops are non-decreasing in ``occurred_at``, no hop was observed after
    ``as_of``, and only value-moving edge types were followed. A caller cannot
    switch any of them off.

    An origin with no outbound money movement returns ``paths: []`` and **200,
    not 404**. "No money left this account before ``as_of``" is a finding; a 404
    would report it as "no such account", and an investigator would chase the
    wrong thing.

    ``max_rows`` bounds the walk inside the CTE, and what it means is narrower
    than it looks: it caps the rows the recursion may emit, not the paths
    returned, and hitting it is *not* reported as ``truncated``. That flag has
    one meaning in this domain — this path stopped at ``max_depth`` — and
    overloading it with a second would make an investigator's most consequential
    distinction ambiguous. The row cap exists so one popular cash-out endpoint
    cannot turn a depth-6 walk into a table scan; lowering it is a way to bound
    a query, not a way to page through one. There is no pagination here, and
    inventing one would mean inventing a stable ordering over paths that the
    domain does not define.
    """
    query = params.to_domain(origin_entity_id)
    paths = await reconstruct_trail(session, query)

    await record(
        session,
        AuditRequest(
            action="graph.trail.read",
            resource_type="entity",
            resource_id=str(origin_entity_id),
            result="allowed",
            correlation_id=context.get_correlation_id(),
            detail={
                "as_of": query.as_of.isoformat(),
                "max_depth": query.max_depth,
                "paths": len(paths),
                "reaches_cash_out": sum(1 for p in paths if p.reaches_cash_out),
                "break_glass": context.break_glass_used(),
            },
        ),
        _audit_actor(request, investigator),
    )

    return TrailResponse(
        origin_entity_id=origin_entity_id,
        as_of=query.as_of,
        max_depth=query.max_depth,
        paths=[TrailPathOut.from_domain(path) for path in paths],
    )


@router.get("/neighbourhood/{kind}/{node_id}", response_model=NeighbourhoodResponse)
async def get_neighbourhood(
    kind: NodeKind,
    node_id: uuid.UUID,
    params: NeighbourhoodParams,
    request: Request,
    session: SessionDep,
    investigator: CanReadGraph,
) -> NeighbourhoodResponse:
    """One hop out from an artefact, redacting what the caller may not open.

    Links to artefacts outside the caller's jurisdiction come back **redacted,
    not removed**: type, node kind and owning jurisdiction, with no id and no
    basis. That is enough to decide whether to request a hand-off and not enough
    to learn anything about the case itself — see ``artefacts.py``, which makes
    the decision from the jurisdiction denormalised on the link row rather than
    by reading the far row, because reading it is the thing being authorized.

    The audit record carries how many links were withheld. A redaction is a
    denial, and a denial nobody can count is one nobody can review.
    """
    neighbourhood = await artefact_neighbourhood(
        session,
        kind=kind,
        node_id=node_id,
        as_of=params.as_of,
        viewer_role=investigator.role,
        viewer_jurisdiction_id=investigator.jurisdiction_id,
        limit=params.limit,
    )

    await record(
        session,
        AuditRequest(
            action="graph.neighbourhood.read",
            resource_type="graph_node",
            resource_id=f"{kind.value}:{node_id}",
            result="allowed",
            correlation_id=context.get_correlation_id(),
            detail={
                "as_of": params.as_of.isoformat(),
                "disclosed": len(neighbourhood.disclosed),
                "redacted": len(neighbourhood.redacted),
                "break_glass": context.break_glass_used(),
            },
        ),
        _audit_actor(request, investigator),
    )

    return NeighbourhoodResponse.from_domain(
        neighbourhood, node_kind=kind, node_id=node_id, as_of=params.as_of
    )
