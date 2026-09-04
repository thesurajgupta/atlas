"""Authorization: roles, jurisdiction scope, break-glass (master spec §29).

Two questions must both pass before access is granted: does the role hold the
permission, and is the resource inside the caller's jurisdiction. These tests
target the seam between them, because that is where an over-broad role hides.
"""

from __future__ import annotations

import uuid

import pytest
from atlas.core.enums import JurisdictionLevel, Role
from atlas.core.errors import ValidationError
from atlas.iam import authz, breakglass
from atlas.iam.authz import Permission
from atlas.iam.models import Investigator, Jurisdiction
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.security


# --------------------------------------------------------------------------
# RBAC — deny by default
# --------------------------------------------------------------------------


def test_unmapped_permission_is_denied() -> None:
    """A bank partner has no investigative access at all."""
    assert authz.has_permission(Role.BANK_PARTNER, Permission.COMPLAINT_READ) is False
    assert authz.has_permission(Role.BANK_PARTNER, Permission.CASE_READ) is False
    assert authz.has_permission(Role.BANK_PARTNER, Permission.PREDICTION_READ) is False


def test_auditor_cannot_read_operational_data() -> None:
    """An auditor reads the audit trail, not the cases in it."""
    assert authz.has_permission(Role.AUDITOR, Permission.AUDIT_READ) is True
    assert authz.has_permission(Role.AUDITOR, Permission.COMPLAINT_READ) is False
    assert authz.has_permission(Role.AUDITOR, Permission.CASE_WRITE) is False


def test_read_only_analyst_cannot_write() -> None:
    assert authz.has_permission(Role.READ_ONLY_ANALYST, Permission.CASE_READ) is True
    assert authz.has_permission(Role.READ_ONLY_ANALYST, Permission.CASE_WRITE) is False
    assert (
        authz.has_permission(Role.READ_ONLY_ANALYST, Permission.COMPLAINT_CREATE)
        is False
    )


def test_broad_prediction_queries_are_restricted_to_national_roles() -> None:
    """Threat T-01: enumerating which areas are *not* watched (spec §35.1).

    A district investigator can predict for their own case. Sweeping the whole
    risk surface without a case is a different capability and is not theirs.
    """
    assert (
        authz.has_permission(Role.NATIONAL_ANALYST, Permission.PREDICTION_QUERY_BROAD)
        is True
    )
    for role in (
        Role.DISTRICT_INVESTIGATOR,
        Role.STATE_ANALYST,
        Role.READ_ONLY_ANALYST,
    ):
        assert authz.has_permission(role, Permission.PREDICTION_QUERY_BROAD) is False


def test_only_super_admin_manages_users() -> None:
    for role in Role:
        expected = role is Role.SUPER_ADMIN
        assert authz.has_permission(role, Permission.USER_MANAGE) is expected


def test_every_role_is_mapped() -> None:
    """An unmapped role silently holds nothing — correct, but easy to miss."""
    for role in Role:
        assert role in authz.ROLE_PERMISSIONS, f"{role} has no permission entry"


# --------------------------------------------------------------------------
# ABAC — jurisdiction scope
# --------------------------------------------------------------------------


@pytest.fixture
async def tree(session: AsyncSession):  # type: ignore[no-untyped-def]
    """State → two districts → one police station under the first district."""
    suffix = uuid.uuid4().hex[:6]
    state = Jurisdiction(
        code=f"ST-{suffix}", name="State", level=JurisdictionLevel.STATE
    )
    session.add(state)
    await session.flush()

    d1 = Jurisdiction(
        code=f"D1-{suffix}",
        name="District One",
        level=JurisdictionLevel.DISTRICT,
        parent_id=state.id,
    )
    d2 = Jurisdiction(
        code=f"D2-{suffix}",
        name="District Two",
        level=JurisdictionLevel.DISTRICT,
        parent_id=state.id,
    )
    session.add_all([d1, d2])
    await session.flush()

    ps = Jurisdiction(
        code=f"PS-{suffix}",
        name="Station",
        level=JurisdictionLevel.POLICE_STATION,
        parent_id=d1.id,
    )
    session.add(ps)
    await session.flush()
    return state, d1, d2, ps


async def test_scope_includes_descendants(session: AsyncSession, tree) -> None:  # type: ignore[no-untyped-def]
    state, d1, d2, ps = tree
    assert await authz.jurisdiction_scope(session, d1.id) == {d1.id, ps.id}
    assert await authz.jurisdiction_scope(session, state.id) == {
        state.id,
        d1.id,
        d2.id,
        ps.id,
    }


async def test_district_can_access_its_own_station(session: AsyncSession, tree) -> None:  # type: ignore[no-untyped-def]
    _, d1, _, ps = tree
    assert (
        await authz.can_access_jurisdiction(
            session,
            role=Role.DISTRICT_INVESTIGATOR,
            actor_jurisdiction_id=d1.id,
            resource_jurisdiction_id=ps.id,
        )
        is True
    )


async def test_district_cannot_access_a_sibling_district(
    session: AsyncSession, tree
) -> None:  # type: ignore[no-untyped-def]
    """The core containment property."""
    _, d1, d2, _ = tree
    assert (
        await authz.can_access_jurisdiction(
            session,
            role=Role.DISTRICT_INVESTIGATOR,
            actor_jurisdiction_id=d1.id,
            resource_jurisdiction_id=d2.id,
        )
        is False
    )


async def test_district_cannot_access_its_own_parent(
    session: AsyncSession, tree
) -> None:  # type: ignore[no-untyped-def]
    """Scope goes down the tree, never up."""
    state, d1, _, _ = tree
    assert (
        await authz.can_access_jurisdiction(
            session,
            role=Role.DISTRICT_INVESTIGATOR,
            actor_jurisdiction_id=d1.id,
            resource_jurisdiction_id=state.id,
        )
        is False
    )


async def test_national_role_reaches_everything(session: AsyncSession, tree) -> None:  # type: ignore[no-untyped-def]
    _, _, d2, ps = tree
    for target in (d2.id, ps.id):
        assert (
            await authz.can_access_jurisdiction(
                session,
                role=Role.NATIONAL_ANALYST,
                actor_jurisdiction_id=uuid.uuid4(),
                resource_jurisdiction_id=target,
            )
            is True
        )


async def test_unowned_resource_is_denied_to_non_national_roles(
    session: AsyncSession, tree
) -> None:  # type: ignore[no-untyped-def]
    """A resource with no jurisdiction is a data-quality bug.

    The safe reading of a bug is "nobody may see this", not "everybody may".
    """
    _, d1, _, _ = tree
    assert (
        await authz.can_access_jurisdiction(
            session,
            role=Role.DISTRICT_INVESTIGATOR,
            actor_jurisdiction_id=d1.id,
            resource_jurisdiction_id=None,
        )
        is False
    )


# --------------------------------------------------------------------------
# Break-glass
# --------------------------------------------------------------------------


async def _investigator(
    session: AsyncSession, jurisdiction_id: uuid.UUID
) -> Investigator:
    inv = Investigator(
        username=f"u-{uuid.uuid4().hex[:8]}",
        display_name="Officer",
        password_hash="x",
        role=Role.DISTRICT_INVESTIGATOR,
        jurisdiction_id=jurisdiction_id,
    )
    session.add(inv)
    await session.flush()
    return inv


async def test_break_glass_requires_a_real_justification(
    session: AsyncSession, tree
) -> None:  # type: ignore[no-untyped-def]
    """ "urgent" is not a reason. The field is read during review."""
    _, d1, _, _ = tree
    inv = await _investigator(session, d1.id)
    approver = await _investigator(session, d1.id)
    with pytest.raises(ValidationError, match="at least"):
        await breakglass.grant(
            session,
            investigator_id=inv.id,
            justification="urgent",
            granted_by_id=approver.id,
        )


async def test_break_glass_cannot_be_self_granted(session: AsyncSession, tree) -> None:  # type: ignore[no-untyped-def]
    """Otherwise it is not an escalation path, it is a self-service backdoor."""
    _, d1, _, _ = tree
    inv = await _investigator(session, d1.id)
    with pytest.raises(ValidationError, match="self-granted"):
        await breakglass.grant(
            session,
            investigator_id=inv.id,
            justification="Cross-state pursuit, ref FIR 2026/0042, approved by SP",
            granted_by_id=inv.id,
        )


async def test_break_glass_grant_is_active_then_revocable(
    session: AsyncSession, tree
) -> None:  # type: ignore[no-untyped-def]
    _, d1, _, _ = tree
    inv = await _investigator(session, d1.id)
    approver = await _investigator(session, d1.id)

    assert await breakglass.active_grant(session, inv.id) is None

    granted = await breakglass.grant(
        session,
        investigator_id=inv.id,
        justification="Cross-state pursuit, ref FIR 2026/0042, approved by SP",
        granted_by_id=approver.id,
        notified_party_id=approver.id,
    )
    assert await breakglass.active_grant(session, inv.id) is not None

    await breakglass.revoke(session, granted.id)
    assert await breakglass.active_grant(session, inv.id) is None


async def test_break_glass_records_who_approved_and_who_was_notified(
    session: AsyncSession, tree
) -> None:  # type: ignore[no-untyped-def]
    """An emergency nobody was told about is indistinguishable from misuse."""
    _, d1, _, _ = tree
    inv = await _investigator(session, d1.id)
    approver = await _investigator(session, d1.id)
    granted = await breakglass.grant(
        session,
        investigator_id=inv.id,
        justification="Cross-state pursuit, ref FIR 2026/0042, approved by SP",
        granted_by_id=approver.id,
        notified_party_id=approver.id,
    )
    assert granted.granted_by_id == approver.id
    assert granted.notified_party_id == approver.id
    assert granted.expires_at is not None
