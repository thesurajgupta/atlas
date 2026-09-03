"""Authorization: roles, permissions and jurisdiction scope (master spec §29).

Two independent questions are answered here, and both must pass:

  1. **Does this role have this permission at all?** — RBAC.
  2. **Is this specific resource inside the caller's jurisdiction?** — ABAC.

A district investigator may hold `complaint:read` and still be denied a
particular complaint, because it belongs to another state. Conflating the two is
how a system ends up with a role that is national by accident.

Everything is deny-by-default. An unknown permission, an unknown role, or a
resource with no owning jurisdiction is refused rather than allowed.
"""

from __future__ import annotations

import uuid
from enum import StrEnum

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from atlas.core.enums import Role


class Permission(StrEnum):
    """What can be done. Named `resource:action` so the matrix stays readable."""

    COMPLAINT_READ = "complaint:read"
    COMPLAINT_CREATE = "complaint:create"
    CASE_READ = "case:read"
    CASE_WRITE = "case:write"
    CASE_ASSIGN = "case:assign"
    PREDICTION_READ = "prediction:read"
    PREDICTION_QUERY_BROAD = "prediction:query_broad"
    ALERT_READ = "alert:read"
    ALERT_ACKNOWLEDGE = "alert:acknowledge"
    INTEL_SEND = "intel:send"
    EVIDENCE_READ = "evidence:read"
    AUDIT_READ = "audit:read"
    MODEL_READ = "model:read"
    USER_MANAGE = "user:manage"
    BREAK_GLASS_GRANT = "break_glass:grant"


#: Role → permissions. Explicit rather than hierarchical: a table you can read
#: top to bottom is auditable, and "analyst inherits investigator" quietly grants
#: things nobody intended the day someone adds a permission to the base role.
ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.SUPER_ADMIN: frozenset(Permission),
    Role.NATIONAL_ANALYST: frozenset(
        {
            Permission.COMPLAINT_READ,
            Permission.CASE_READ,
            Permission.PREDICTION_READ,
            # Only national analysts may run broad, un-cased prediction queries.
            # Narrowing this is a control against threat T-01: enumerating which
            # areas are *not* being watched (master spec §35.1).
            Permission.PREDICTION_QUERY_BROAD,
            Permission.ALERT_READ,
            Permission.EVIDENCE_READ,
            Permission.MODEL_READ,
        }
    ),
    Role.STATE_ANALYST: frozenset(
        {
            Permission.COMPLAINT_READ,
            Permission.CASE_READ,
            Permission.CASE_ASSIGN,
            Permission.PREDICTION_READ,
            Permission.ALERT_READ,
            Permission.ALERT_ACKNOWLEDGE,
            Permission.EVIDENCE_READ,
            Permission.MODEL_READ,
        }
    ),
    Role.DISTRICT_INVESTIGATOR: frozenset(
        {
            Permission.COMPLAINT_READ,
            Permission.COMPLAINT_CREATE,
            Permission.CASE_READ,
            Permission.CASE_WRITE,
            Permission.PREDICTION_READ,
            Permission.ALERT_READ,
            Permission.ALERT_ACKNOWLEDGE,
            Permission.INTEL_SEND,
            Permission.EVIDENCE_READ,
        }
    ),
    # A bank partner sees only what is sent to it, through atlas.intel. It has no
    # complaint, case or prediction access at all — the outbound package is the
    # entire surface (master spec §28.1).
    Role.BANK_PARTNER: frozenset(),
    Role.AUDITOR: frozenset({Permission.AUDIT_READ, Permission.MODEL_READ}),
    Role.READ_ONLY_ANALYST: frozenset(
        {
            Permission.COMPLAINT_READ,
            Permission.CASE_READ,
            Permission.PREDICTION_READ,
            Permission.ALERT_READ,
        }
    ),
}


def has_permission(role: Role, permission: Permission) -> bool:
    """Deny-by-default: an unmapped role holds nothing."""
    return permission in ROLE_PERMISSIONS.get(role, frozenset())


# Roles whose remit is the whole country. Kept as data rather than a check on
# role name, so adding a role cannot silently make it national.
NATIONAL_ROLES: frozenset[Role] = frozenset({Role.SUPER_ADMIN, Role.NATIONAL_ANALYST})


async def jurisdiction_scope(session: AsyncSession, root_id: uuid.UUID) -> set[uuid.UUID]:
    """Every jurisdiction at or below ``root_id``.

    A district investigator's scope is their district plus the police stations
    under it. Computed with a recursive CTE so the depth of the tree does not
    matter and no application-side traversal is needed.
    """
    result = await session.execute(
        text(
            """
            WITH RECURSIVE descendants AS (
                SELECT id FROM iam.jurisdiction WHERE id = :root
                UNION ALL
                SELECT j.id FROM iam.jurisdiction j
                JOIN descendants d ON j.parent_id = d.id
            )
            SELECT id FROM descendants
            """
        ),
        {"root": root_id},
    )
    return {row[0] for row in result}


async def can_access_jurisdiction(
    session: AsyncSession,
    *,
    role: Role,
    actor_jurisdiction_id: uuid.UUID,
    resource_jurisdiction_id: uuid.UUID | None,
) -> bool:
    """Is the resource inside the caller's jurisdiction?

    A resource with no owning jurisdiction is denied to everyone except national
    roles. Unowned data is a data-quality bug, and the safe reading of a bug is
    "nobody may see this" rather than "everybody may".
    """
    if role in NATIONAL_ROLES:
        return True
    if resource_jurisdiction_id is None:
        return False
    if resource_jurisdiction_id == actor_jurisdiction_id:
        return True
    return resource_jurisdiction_id in await jurisdiction_scope(session, actor_jurisdiction_id)
