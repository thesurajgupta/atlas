"""Jurisdiction-scoped artefact traversal (master spec §14.1, §29).

Traceability: ``INT-GRAPH-002`` — artefact nodes and cross-jurisdiction linkage.

The behaviour under test is a compromise, and the tests exist to hold both ends
of it. A viewer who learns nothing about a link they cannot open gains nothing
from the link existing. A viewer who learns everything has a jurisdiction
boundary with a hole in it. What they get is existence, type, and who owns the
other end — enough to ask for a hand-off, not enough to skip asking.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from atlas.core.enums import EdgeType, JurisdictionLevel, NodeKind, Role
from atlas.graph.artefacts import RedactedLink, artefact_neighbourhood
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio

DAY0 = datetime(2026, 6, 1, 10, 0, tzinfo=UTC)
LATER = DAY0 + timedelta(days=90)


async def _jurisdiction(
    session: AsyncSession, level: JurisdictionLevel, parent: uuid.UUID | None = None
) -> uuid.UUID:
    jid = uuid.uuid4()
    await session.execute(
        text(
            "INSERT INTO iam.jurisdiction (id, code, name, level, parent_id) "
            "VALUES (:id, :code, :name, CAST(:lvl AS iam.jurisdiction_level), :parent)"
        ),
        {
            "id": jid,
            "code": f"T{uuid.uuid4().hex[:10]}",
            "name": f"Test {level.value}",
            "lvl": level.value,
            "parent": parent,
        },
    )
    return jid


async def _link(
    session: AsyncSession,
    *,
    source_kind: NodeKind,
    source_id: uuid.UUID,
    target_kind: NodeKind,
    target_id: uuid.UUID,
    edge_type: EdgeType,
    source_jurisdiction: uuid.UUID | None,
    target_jurisdiction: uuid.UUID | None,
    observed_at: datetime = DAY0,
    basis: str = "both reached the same BC agent within 90 minutes",
) -> None:
    await session.execute(
        text(
            "INSERT INTO graph.artefact_link "
            "(id, source_kind, source_id, target_kind, target_id, edge_type, "
            " source_jurisdiction_id, target_jurisdiction_id, basis, observed_at, "
            " source_system, source_record_id, classification, is_synthetic) "
            "VALUES (:id, CAST(:sk AS graph.node_kind), :sid, "
            " CAST(:tk AS graph.node_kind), :tid, CAST(:et AS graph.edge_type), "
            " :sj, :tj, :basis, :obs, 'test', :srec, 'SENSITIVE', true)"
        ),
        {
            "id": uuid.uuid4(),
            "sk": source_kind.value,
            "sid": source_id,
            "tk": target_kind.value,
            "tid": target_id,
            "et": edge_type.value,
            "sj": source_jurisdiction,
            "tj": target_jurisdiction,
            "basis": basis,
            "obs": observed_at,
            "srec": uuid.uuid4().hex,
        },
    )


async def test_a_link_to_another_state_is_visible_but_redacted(
    session: AsyncSession,
) -> None:
    """The behaviour the problem statement actually asks for.

    A Delhi investigator learns their complaint reaches a case in Maharashtra,
    and learns nothing about that case.
    """
    delhi = await _jurisdiction(session, JurisdictionLevel.DISTRICT)
    maharashtra = await _jurisdiction(session, JurisdictionLevel.DISTRICT)
    complaint_id, far_case_id = uuid.uuid4(), uuid.uuid4()
    await _link(
        session,
        source_kind=NodeKind.COMPLAINT,
        source_id=complaint_id,
        target_kind=NodeKind.CASE,
        target_id=far_case_id,
        edge_type=EdgeType.SHARES_BENEFICIARY,
        source_jurisdiction=delhi,
        target_jurisdiction=maharashtra,
    )

    view = await artefact_neighbourhood(
        session,
        kind=NodeKind.COMPLAINT,
        node_id=complaint_id,
        as_of=LATER,
        viewer_role=Role.DISTRICT_INVESTIGATOR,
        viewer_jurisdiction_id=delhi,
    )

    assert view.total == 1
    assert view.disclosed == ()
    assert view.reaches_other_jurisdictions is True

    (link,) = view.redacted
    assert link.edge_type is EdgeType.SHARES_BENEFICIARY
    assert link.target_kind is NodeKind.CASE
    assert link.target_jurisdiction_id == maharashtra, "they must know who to call"


async def test_a_redacted_link_carries_no_identifier_and_no_basis(
    session: AsyncSession,
) -> None:
    """Structural, not conditional.

    A redaction implemented as "return the row and hope the caller checks a
    flag" is one refactor away from disclosure. ``RedactedLink`` has no field
    for a target id or a basis, so there is nothing to leak by accident.
    """
    fields = set(RedactedLink.__dataclass_fields__)

    assert "target_id" not in fields
    assert "basis" not in fields
    assert fields == {
        "edge_type",
        "target_kind",
        "target_jurisdiction_id",
        "observed_at",
    }


async def test_a_link_inside_the_viewers_own_jurisdiction_is_disclosed(
    session: AsyncSession,
) -> None:
    delhi = await _jurisdiction(session, JurisdictionLevel.DISTRICT)
    complaint_id, case_id = uuid.uuid4(), uuid.uuid4()
    await _link(
        session,
        source_kind=NodeKind.COMPLAINT,
        source_id=complaint_id,
        target_kind=NodeKind.CASE,
        target_id=case_id,
        edge_type=EdgeType.SUBJECT_OF,
        source_jurisdiction=delhi,
        target_jurisdiction=delhi,
    )

    view = await artefact_neighbourhood(
        session,
        kind=NodeKind.COMPLAINT,
        node_id=complaint_id,
        as_of=LATER,
        viewer_role=Role.DISTRICT_INVESTIGATOR,
        viewer_jurisdiction_id=delhi,
    )

    (link,) = view.disclosed
    assert link.target_id == case_id
    assert link.basis
    assert view.reaches_other_jurisdictions is False, (
        "no hand-off needed for your own case"
    )


async def test_a_link_in_a_child_jurisdiction_is_disclosed(
    session: AsyncSession,
) -> None:
    """A district investigator owns the police stations beneath them."""
    district = await _jurisdiction(session, JurisdictionLevel.DISTRICT)
    station = await _jurisdiction(
        session, JurisdictionLevel.POLICE_STATION, parent=district
    )
    complaint_id, case_id = uuid.uuid4(), uuid.uuid4()
    await _link(
        session,
        source_kind=NodeKind.COMPLAINT,
        source_id=complaint_id,
        target_kind=NodeKind.CASE,
        target_id=case_id,
        edge_type=EdgeType.RELATED_CASE,
        source_jurisdiction=district,
        target_jurisdiction=station,
    )

    view = await artefact_neighbourhood(
        session,
        kind=NodeKind.COMPLAINT,
        node_id=complaint_id,
        as_of=LATER,
        viewer_role=Role.DISTRICT_INVESTIGATOR,
        viewer_jurisdiction_id=district,
    )

    assert len(view.disclosed) == 1
    assert view.redacted == ()


async def test_a_national_analyst_sees_every_link(session: AsyncSession) -> None:
    delhi = await _jurisdiction(session, JurisdictionLevel.DISTRICT)
    maharashtra = await _jurisdiction(session, JurisdictionLevel.DISTRICT)
    complaint_id = uuid.uuid4()
    await _link(
        session,
        source_kind=NodeKind.COMPLAINT,
        source_id=complaint_id,
        target_kind=NodeKind.CASE,
        target_id=uuid.uuid4(),
        edge_type=EdgeType.SHARES_BENEFICIARY,
        source_jurisdiction=delhi,
        target_jurisdiction=maharashtra,
    )

    view = await artefact_neighbourhood(
        session,
        kind=NodeKind.COMPLAINT,
        node_id=complaint_id,
        as_of=LATER,
        viewer_role=Role.NATIONAL_ANALYST,
        viewer_jurisdiction_id=delhi,
    )

    assert len(view.disclosed) == 1
    assert view.redacted == ()


async def test_the_backward_hop_authorizes_against_the_source_jurisdiction(
    session: AsyncSession,
) -> None:
    """Links are directed; a traversal is not.

    Storing only the target's jurisdiction made every backward link redact —
    including one from a case in the viewer's own district. Fail-closed, and
    wrong: the investigator would be told to request access to their own case.
    """
    delhi = await _jurisdiction(session, JurisdictionLevel.DISTRICT)
    case_id, complaint_id = uuid.uuid4(), uuid.uuid4()
    # Stored case -> complaint. The viewer is looking from the complaint.
    await _link(
        session,
        source_kind=NodeKind.CASE,
        source_id=case_id,
        target_kind=NodeKind.COMPLAINT,
        target_id=complaint_id,
        edge_type=EdgeType.SUBJECT_OF,
        source_jurisdiction=delhi,
        target_jurisdiction=delhi,
    )

    view = await artefact_neighbourhood(
        session,
        kind=NodeKind.COMPLAINT,
        node_id=complaint_id,
        as_of=LATER,
        viewer_role=Role.DISTRICT_INVESTIGATOR,
        viewer_jurisdiction_id=delhi,
    )

    assert len(view.disclosed) == 1, "a backward link from the viewer's own district"
    assert view.disclosed[0].target_id == case_id


async def test_an_unowned_link_is_redacted_from_a_district_investigator(
    session: AsyncSession,
) -> None:
    """A link with no owning jurisdiction is a data-quality bug.

    The safe reading of a bug is "nobody may see this", not "everybody may".
    """
    delhi = await _jurisdiction(session, JurisdictionLevel.DISTRICT)
    complaint_id = uuid.uuid4()
    await _link(
        session,
        source_kind=NodeKind.COMPLAINT,
        source_id=complaint_id,
        target_kind=NodeKind.ALERT,
        target_id=uuid.uuid4(),
        edge_type=EdgeType.LINKED_ALERT,
        source_jurisdiction=delhi,
        target_jurisdiction=None,
    )

    view = await artefact_neighbourhood(
        session,
        kind=NodeKind.COMPLAINT,
        node_id=complaint_id,
        as_of=LATER,
        viewer_role=Role.DISTRICT_INVESTIGATOR,
        viewer_jurisdiction_id=delhi,
    )

    assert len(view.redacted) == 1


async def test_a_link_inferred_later_is_invisible_to_an_earlier_as_of(
    session: AsyncSession,
) -> None:
    """The point-in-time bound applies to inferred links too.

    A shared-beneficiary link is a *conclusion*, and conclusions have an
    ``observed_at`` like everything else.
    """
    delhi = await _jurisdiction(session, JurisdictionLevel.DISTRICT)
    complaint_id = uuid.uuid4()
    await _link(
        session,
        source_kind=NodeKind.COMPLAINT,
        source_id=complaint_id,
        target_kind=NodeKind.CASE,
        target_id=uuid.uuid4(),
        edge_type=EdgeType.RELATED_CASE,
        source_jurisdiction=delhi,
        target_jurisdiction=delhi,
        observed_at=DAY0 + timedelta(days=30),
    )

    early = await artefact_neighbourhood(
        session,
        kind=NodeKind.COMPLAINT,
        node_id=complaint_id,
        as_of=DAY0 + timedelta(days=1),
        viewer_role=Role.DISTRICT_INVESTIGATOR,
        viewer_jurisdiction_id=delhi,
    )
    assert early.total == 0

    late = await artefact_neighbourhood(
        session,
        kind=NodeKind.COMPLAINT,
        node_id=complaint_id,
        as_of=LATER,
        viewer_role=Role.DISTRICT_INVESTIGATOR,
        viewer_jurisdiction_id=delhi,
    )
    assert late.total == 1, "the bound withheld it; the data was always there"


# --------------------------------------------------------------------------
# Referential integrity, which the database cannot enforce here
# --------------------------------------------------------------------------

# `graph` sits below `cases`, `alerts` and `predict` in the layering contract, so
# it cannot hold a foreign key into them. The integrity that a FK would have
# given is checked instead — and the kinds whose owning table does not exist yet
# are *reported as unchecked* rather than quietly passing, because a coverage
# gap that looks like a clean result is how this check would rot.
NODE_KIND_TABLES: dict[NodeKind, str] = {
    NodeKind.COMPLAINT: "complaints.complaint",
    NodeKind.CASE: "cases.case",
    NodeKind.INTERVENTION: "cases.intervention",
    NodeKind.ENTITY: "entity.canonical_entity",
    NodeKind.ACCOUNT: "entity.canonical_entity",
    NodeKind.CASH_OUT_ENDPOINT: "geo.cash_out_endpoint",
    NodeKind.GEOGRAPHIC_ZONE: "geo.geographic_zone",
}


async def test_no_artefact_link_points_at_a_row_that_does_not_exist(
    session: AsyncSession,
) -> None:
    unchecked: list[str] = []
    orphans: list[str] = []

    for kind in NodeKind:
        table = NODE_KIND_TABLES.get(kind)
        if table is None:
            unchecked.append(kind.value)
            continue

        exists = await session.execute(
            text("SELECT to_regclass(:t) IS NOT NULL"), {"t": table}
        )
        if not exists.scalar():
            unchecked.append(f"{kind.value} (table {table} not created yet)")
            continue

        for side in ("source", "target"):
            result = await session.execute(
                text(
                    f"SELECT count(*) FROM graph.artefact_link l "
                    f"WHERE l.{side}_kind = CAST(:k AS graph.node_kind) "
                    f"AND NOT EXISTS (SELECT 1 FROM {table} t WHERE t.id = l.{side}_id)"
                ),
                {"k": kind.value},
            )
            count = result.scalar_one()
            if count:
                orphans.append(
                    f"{count} link(s) with a dangling {side} of kind {kind.value}"
                )

    assert not orphans, "; ".join(orphans)

    # Not an assertion — a standing note in the test output, so the day an
    # alerts table lands, the gap in this check is visible rather than assumed
    # closed.
    if unchecked:
        print(
            f"\n  artefact-link integrity unchecked for: {', '.join(sorted(unchecked))}"
        )
