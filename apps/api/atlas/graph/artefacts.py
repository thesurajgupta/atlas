"""Artefact-node traversal, scoped by jurisdiction (master spec §14.1, §29).

The problem statement asks for cross-jurisdiction intelligence sharing. The
naive reading of that is a report somebody runs; the useful reading is that an
investigator opening their own complaint can *see* it reaches a case in another
state, and knows who to call.

Those two readings differ on one question: what does a viewer learn about a case
they are not authorized to read? Nothing is useless — the link may as well not
exist. Everything is a jurisdiction boundary with a hole in it.

What is returned instead is the **existence** of a link, its **type**, and the
**jurisdiction that owns the other end**. That is exactly enough to decide
whether to request a hand-off, and not enough to learn anything about the case
itself. The hand-off request (§28.4) is made against the link, not against a
case id the requester was never given.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from atlas.core.enums import EdgeType, NodeKind, Role
from atlas.iam.authz import can_access_jurisdiction


@dataclass(frozen=True)
class DisclosedLink:
    """A link whose far end the viewer is authorized to open."""

    edge_type: EdgeType
    target_kind: NodeKind
    target_id: uuid.UUID
    target_jurisdiction_id: uuid.UUID | None
    basis: str
    observed_at: datetime


@dataclass(frozen=True)
class RedactedLink:
    """A link that exists, whose far end the viewer may not open.

    Carries no ``target_id`` and no ``basis``, and the omissions are the point.

    The id would let a viewer probe for it elsewhere in the API, turning a
    deliberate disclosure into an identifier they can carry around. The basis
    reads like context — "both reached BC agent HR-0142 within 90 minutes" — but
    it is a fact *about the other case*, and stating it discloses the thing the
    boundary exists to withhold.

    ``edge_type`` survives redaction because it is what makes the link
    actionable: ``SHARES_BENEFICIARY`` and ``SHARES_DEVICE`` warrant different
    urgency, and neither identifies anybody.
    """

    edge_type: EdgeType
    target_kind: NodeKind
    target_jurisdiction_id: uuid.UUID | None
    observed_at: datetime


@dataclass(frozen=True)
class ArtefactNeighbourhood:
    """One hop out from an artefact, split by what the viewer may see."""

    disclosed: tuple[DisclosedLink, ...]
    redacted: tuple[RedactedLink, ...]

    @property
    def total(self) -> int:
        return len(self.disclosed) + len(self.redacted)

    @property
    def reaches_other_jurisdictions(self) -> bool:
        """Whether anything here is worth a hand-off request.

        Deliberately reads ``redacted`` only. A link the viewer can already open
        needs no hand-off, and counting it here would prompt requests for access
        somebody already has.
        """
        return len(self.redacted) > 0


# Single hop, both directions. Links are stored directed because the edge types
# are directional (a Prediction is PREDICTED_FOR a Case, not the reverse), but
# an investigator asking "what does this complaint touch" means both.
#
# ``observed_at <= :as_of`` for the same reason it bounds every other read: a
# link inferred yesterday must not appear in a reconstruction of what was known
# last week (spec §19.1).
_NEIGHBOURS_SQL = text(
    """
SELECT edge_type::text AS edge_type,
       target_kind::text AS target_kind,
       target_id,
       target_jurisdiction_id,
       basis,
       observed_at
FROM graph.artefact_link
WHERE source_kind = CAST(:kind AS graph.node_kind)
  AND source_id = :node_id
  AND observed_at <= :as_of

UNION ALL

SELECT edge_type::text,
       source_kind::text,
       source_id,
       source_jurisdiction_id,
       basis,
       observed_at
FROM graph.artefact_link
WHERE target_kind = CAST(:kind AS graph.node_kind)
  AND target_id = :node_id
  AND observed_at <= :as_of

ORDER BY observed_at DESC
LIMIT :limit
"""
)

DEFAULT_NEIGHBOUR_LIMIT = 200


async def artefact_neighbourhood(
    session: AsyncSession,
    *,
    kind: NodeKind,
    node_id: uuid.UUID,
    as_of: datetime,
    viewer_role: Role,
    viewer_jurisdiction_id: uuid.UUID,
    limit: int = DEFAULT_NEIGHBOUR_LIMIT,
) -> ArtefactNeighbourhood:
    """One hop out from an artefact, redacting what the viewer may not open.

    Authorization is decided from ``target_jurisdiction_id`` on the link row and
    never by reading the target. Reading it is the thing being authorized, so a
    check that has to fetch the row first has already lost.
    """
    result = await session.execute(
        _NEIGHBOURS_SQL,
        {"kind": kind.value, "node_id": node_id, "as_of": as_of, "limit": limit},
    )

    disclosed: list[DisclosedLink] = []
    redacted: list[RedactedLink] = []

    for row in result:
        m = row._mapping
        permitted = await can_access_jurisdiction(
            session,
            role=viewer_role,
            actor_jurisdiction_id=viewer_jurisdiction_id,
            resource_jurisdiction_id=m["target_jurisdiction_id"],
        )
        if permitted:
            disclosed.append(
                DisclosedLink(
                    edge_type=EdgeType(m["edge_type"]),
                    target_kind=NodeKind(m["target_kind"]),
                    target_id=m["target_id"],
                    target_jurisdiction_id=m["target_jurisdiction_id"],
                    basis=m["basis"],
                    observed_at=m["observed_at"],
                )
            )
        else:
            redacted.append(
                RedactedLink(
                    edge_type=EdgeType(m["edge_type"]),
                    target_kind=NodeKind(m["target_kind"]),
                    target_jurisdiction_id=m["target_jurisdiction_id"],
                    observed_at=m["observed_at"],
                )
            )

    return ArtefactNeighbourhood(disclosed=tuple(disclosed), redacted=tuple(redacted))
