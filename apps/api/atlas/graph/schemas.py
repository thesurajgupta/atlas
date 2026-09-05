"""Graph API models (master spec §14, §14.2).

These are a **projection** of the dataclasses in :mod:`atlas.graph.trail` and
:mod:`atlas.graph.artefacts`, not a second graph model. Every field below exists
on the domain object it mirrors; nothing is computed here, and nothing is added.

Two things are deliberately absent, and both absences are load-bearing:

* **No confidence, score or likelihood.** :class:`~atlas.graph.trail.TrailPath`
  has none — see its docstring for why — and a serialiser that invented one
  would put a claim the system cannot support onto an investigator's screen
  (CLAUDE.md rule 4).
* **No currency symbol, and no currency field on a hop.**
  :class:`~atlas.graph.trail.TrailHop` projects none.
  ``transaction_edge.currency`` exists on the row, but the trail CTE does not
  select it and the domain hop does not carry it, so stamping ``INR`` here would
  be this layer inventing a fact the layer below declined to state.

``observed_at`` is likewise absent from a hop, and that is not an oversight: it
bounds the traversal server-side — nothing observed after ``as_of`` is walked —
and is not re-litigated by a client. The bound the result was produced under is
returned once, on the response, rather than once per hop.

Amounts are ``Decimal`` and serialise as JSON **strings**. The column is
``NUMERIC(14, 2)``; rendering it as a JSON number would hand the client a float
and lose exact rupee arithmetic, which surfaces as sums along a path that no
longer add up. The web wire type (``apps/web/lib/graph/types.ts``) declares
``DecimalString`` for exactly this reason.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Literal, Self, cast

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from atlas.core.enums import CashOutChannel, EdgeType, NodeKind
from atlas.graph.artefacts import (
    DEFAULT_NEIGHBOUR_LIMIT,
    ArtefactNeighbourhood,
    DisclosedLink,
    RedactedLink,
)
from atlas.graph.trail import (
    DEFAULT_MAX_DEPTH,
    DEFAULT_MAX_HOP_GAP,
    DEFAULT_MAX_ROWS,
    TrailHop,
    TrailPath,
    TrailQuery,
)

#: The edge types a trail hop can carry — ``EdgeType`` narrowed to the ones
#: along which value actually moved.
#:
#: Every hop ``reconstruct_trail`` returns is one of these; the CTE filters on
#: ``EdgeType.moves_money`` and cannot emit anything else. Stating that in the
#: *schema* rather than only in the traversal is what makes the published
#: contract match the guarantee: with the full enum here, OpenAPI advertised
#: eleven possible values, and a generated client would have had to handle a
#: ``SHARES_DEVICE`` hop that cannot occur — an edge linking two accounts that
#: plausibly share an operator, which is strong intelligence and a terrible
#: trail hop.
#:
#: A narrowing of the shared vocabulary, deliberately, and not a second copy of
#: it: the members are drawn from ``EdgeType``, so there is still one place
#: where an edge type is defined. ``apps/web/lib/graph/types.ts`` expresses the
#: same subset the same way — ``Extract<EdgeType, 'TRANSFERRED_TO' | …>``.
#:
#: The membership is duplicated from ``EdgeType.moves_money`` because a
#: ``Literal`` cannot be computed. ``moves_money`` stays the single source of
#: truth, and a test asserts the two agree, so adding a third money-moving edge
#: type fails loudly here rather than silently omitting it from the contract.
MoneyEdgeType = Literal[EdgeType.TRANSFERRED_TO, EdgeType.WITHDREW_AT]


class TrailQueryParams(BaseModel):
    """Query parameters of a reconstruction — the HTTP face of ``TrailQuery``.

    ``as_of`` is **required and has no default**, matching the domain object. A
    default of "now" is how a point-in-time bound turns into a formality that
    every caller satisfies without meaning to, and the one caller that needed a
    historical bound silently gets live data.

    It is also ``AwareDatetime``: a naive timestamp is rejected rather than
    assumed to be UTC. ``2026-04-06T09:00`` denotes different instants in
    different places, and guessing which one produces a bound wrong by hours in a
    system whose entire subject is when something was knowable.

    Three deliberate narrowings relative to the domain object, each because this
    is a network-facing surface rather than an in-process call:

    * ``max_depth`` and ``max_rows`` may be **lowered** by a caller but not
      raised past the module's documented ceilings. Fan-out, not depth, is what
      makes this query expensive, and a caller must not be able to widen the
      bound the server chose for itself.
    * ``max_hop_gap`` has no unbounded form here. ``TrailQuery`` accepts ``None``
      for "follow a hop however long the money sat still"; over HTTP that is an
      unbounded search, so the window is widened by raising the number instead.
    """

    # Unknown query parameters are rejected rather than ignored. A caller sending
    # `max_hop_gap=3600` (the domain name) instead of `max_hop_gap_seconds` would
    # otherwise receive a silently *unfiltered* trail, with nothing to indicate
    # that the filter they asked for did nothing.
    model_config = ConfigDict(extra="forbid")

    as_of: AwareDatetime
    not_before: AwareDatetime | None = None
    max_depth: int = Field(default=DEFAULT_MAX_DEPTH, ge=1, le=DEFAULT_MAX_DEPTH)
    max_hop_gap_seconds: int = Field(default=int(DEFAULT_MAX_HOP_GAP.total_seconds()), gt=0)
    max_rows: int = Field(default=DEFAULT_MAX_ROWS, ge=1, le=DEFAULT_MAX_ROWS)
    min_amount: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)

    @model_validator(mode="after")
    def _window_must_be_ordered(self) -> Self:
        """``not_before`` after ``as_of`` selects an empty window.

        Rejected rather than answered with an empty result: an empty trail and an
        impossible query look identical on screen, and only one of them means
        "the money did not move".
        """
        if self.not_before is not None and self.not_before > self.as_of:
            raise ValueError("not_before must not be later than as_of")
        return self

    def to_domain(self, origin_entity_id: uuid.UUID) -> TrailQuery:
        """Bind these parameters to an origin, producing the domain query.

        The origin arrives as a path segment rather than a query parameter — it
        is what the resource *is*, not how it is filtered — so it is supplied
        here rather than being a field above.
        """
        return TrailQuery(
            origin_entity_id=origin_entity_id,
            as_of=self.as_of,
            not_before=self.not_before,
            max_depth=self.max_depth,
            max_hop_gap=timedelta(seconds=self.max_hop_gap_seconds),
            max_rows=self.max_rows,
            min_amount=self.min_amount,
        )


class TrailHopOut(BaseModel):
    """One edge on a reconstructed path. Mirrors ``TrailHop``.

    ``edge_id`` is carried so a hop on a canvas maps back to exactly one
    ``graph.transaction_edge`` row — without it an investigator can see an edge
    and cannot ask for its evidence.

    ``occurred_at`` is when the money moved, and hops arrive ordered by it. That
    ordering is what makes a path physically possible rather than merely
    connected, so a client must not re-sort them.
    """

    edge_id: uuid.UUID
    from_entity_id: uuid.UUID
    to_entity_id: uuid.UUID
    edge_type: MoneyEdgeType
    amount: Decimal
    occurred_at: datetime
    #: Set only on a ``WITHDREW_AT`` hop. A transfer between accounts has no
    #: cash-out channel, and defaulting one would invent a fact.
    channel: CashOutChannel | None
    rail: str | None
    depth: int

    @classmethod
    def from_domain(cls, hop: TrailHop) -> TrailHopOut:
        return cls(
            edge_id=hop.edge_id,
            from_entity_id=hop.from_entity_id,
            to_entity_id=hop.to_entity_id,
            # ``TrailHop.edge_type`` is the full ``EdgeType``; the traversal
            # guarantees the value is money-moving but the type does not say so.
            # The cast asserts nothing on its own — Pydantic re-checks the field
            # against ``MoneyEdgeType`` on construction, so a traversal that
            # ever returned a non-money hop would raise here rather than
            # serialise a value the contract forbids.
            edge_type=cast(MoneyEdgeType, hop.edge_type),
            amount=hop.amount,
            occurred_at=hop.occurred_at,
            channel=hop.channel,
            rail=hop.rail,
            depth=hop.depth,
        )


class TrailPathOut(BaseModel):
    """A reconstructed path, presented as a hypothesis with its evidence.

    ``truncated`` separates "the money stopped here" from "the search stopped
    here". Those two facts warrant opposite investigative responses and look
    identical on a canvas, so the flag has to reach the client.

    The remaining fields are ``TrailPath``'s derived properties, projected rather
    than recomputed by the client, so there is one definition of each. Durations
    are whole seconds: they are rendered as "3h 20m", and a fractional value
    would imply a precision the source rows do not have.
    """

    hops: list[TrailHopOut]
    truncated: bool
    reaches_cash_out: bool
    elapsed_seconds: int
    longest_dwell_seconds: int
    retained_fraction: Decimal

    @classmethod
    def from_domain(cls, path: TrailPath) -> TrailPathOut:
        return cls(
            hops=[TrailHopOut.from_domain(hop) for hop in path.hops],
            truncated=path.truncated,
            reaches_cash_out=path.reaches_cash_out,
            elapsed_seconds=int(path.elapsed.total_seconds()),
            longest_dwell_seconds=int(path.longest_dwell.total_seconds()),
            retained_fraction=path.retained_fraction,
        )


class TrailResponse(BaseModel):
    """The reconstruction, with the query it answers.

    The parameters are echoed because the result alone cannot state them: a
    complete trail and one cut off at ``max_depth`` are the same shape, and an
    empty result carries no origin at all. A client rendering "as of 14 Jan,
    depth 6" is then reporting what was asked rather than guessing from what came
    back.

    There is deliberately **no result-level ``truncated`` flag**. In this domain
    truncation is a property of a *path* — that path stopped because the search
    did — and hoisting the word to the response would give it a second meaning
    alongside ``max_rows``, which bounds the walk for a different reason and is
    not the same claim. See the router for what ``max_rows`` does and does not
    say.
    """

    origin_entity_id: uuid.UUID
    as_of: datetime
    max_depth: int
    paths: list[TrailPathOut]


class DisclosedLinkOut(BaseModel):
    """A link whose far end the viewer is authorized to open."""

    edge_type: EdgeType
    target_kind: NodeKind
    target_id: uuid.UUID
    target_jurisdiction_id: uuid.UUID | None
    basis: str
    observed_at: datetime

    @classmethod
    def from_domain(cls, link: DisclosedLink) -> DisclosedLinkOut:
        return cls(
            edge_type=link.edge_type,
            target_kind=link.target_kind,
            target_id=link.target_id,
            target_jurisdiction_id=link.target_jurisdiction_id,
            basis=link.basis,
            observed_at=link.observed_at,
        )


class RedactedLinkOut(BaseModel):
    """A link that exists, whose far end the viewer may not open.

    Carries no ``target_id`` and no ``basis``, and the omissions are the point:
    the id would let a viewer probe for it elsewhere in the API, and the basis is
    a fact *about the other case*. See ``RedactedLink``.
    """

    edge_type: EdgeType
    target_kind: NodeKind
    target_jurisdiction_id: uuid.UUID | None
    observed_at: datetime

    @classmethod
    def from_domain(cls, link: RedactedLink) -> RedactedLinkOut:
        return cls(
            edge_type=link.edge_type,
            target_kind=link.target_kind,
            target_jurisdiction_id=link.target_jurisdiction_id,
            observed_at=link.observed_at,
        )


class NeighbourhoodQueryParams(BaseModel):
    """Query parameters for a one-hop artefact traversal.

    ``as_of`` is required and timezone-aware for the same reason as on a trail:
    a link inferred yesterday must not appear in a reconstruction of what was
    known last week (§19.1).
    """

    model_config = ConfigDict(extra="forbid")

    as_of: AwareDatetime
    limit: int = Field(default=DEFAULT_NEIGHBOUR_LIMIT, ge=1, le=DEFAULT_NEIGHBOUR_LIMIT)


class NeighbourhoodResponse(BaseModel):
    """One hop out from an artefact, split by what the viewer may see.

    ``redacted`` is returned rather than dropped. A link the viewer may not open
    is still the thing that tells them to request a hand-off; removing it would
    make a jurisdiction boundary indistinguishable from an absence of evidence.
    """

    node_kind: NodeKind
    node_id: uuid.UUID
    as_of: datetime
    disclosed: list[DisclosedLinkOut]
    redacted: list[RedactedLinkOut]
    #: Whether anything here is worth a hand-off request (§28.4).
    reaches_other_jurisdictions: bool

    @classmethod
    def from_domain(
        cls,
        neighbourhood: ArtefactNeighbourhood,
        *,
        node_kind: NodeKind,
        node_id: uuid.UUID,
        as_of: datetime,
    ) -> NeighbourhoodResponse:
        return cls(
            node_kind=node_kind,
            node_id=node_id,
            as_of=as_of,
            disclosed=[DisclosedLinkOut.from_domain(link) for link in neighbourhood.disclosed],
            redacted=[RedactedLinkOut.from_domain(link) for link in neighbourhood.redacted],
            reaches_other_jurisdictions=neighbourhood.reaches_other_jurisdictions,
        )
