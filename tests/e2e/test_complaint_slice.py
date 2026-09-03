"""The Phase 1 vertical slice (master spec §47).

Complaint in → stored → retrieved → authorized → audited, over real HTTP against
a real database. If this passes, the foundation genuinely works end to end —
which is a different claim from "each unit works".
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import timedelta

import pyotp
import pytest
from atlas.app import create_app
from atlas.core.clock import utc_now
from atlas.core.enums import JurisdictionLevel, Role
from atlas.iam import mfa, passwords
from atlas.iam.models import Investigator, Jurisdiction
from fastapi.testclient import TestClient
from sqlalchemy import text

PASSWORD = "a-sufficiently-long-test-password"


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app(), raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
async def two_districts(session):  # type: ignore[no-untyped-def]
    """Two officers in sibling districts. Neither may see the other's work."""
    suffix = uuid.uuid4().hex[:6]
    state = Jurisdiction(
        code=f"ST-{suffix}", name="State", level=JurisdictionLevel.STATE
    )
    session.add(state)
    await session.flush()

    made = []
    for tag in ("A", "B"):
        district = Jurisdiction(
            code=f"D{tag}-{suffix}",
            name=f"District {tag}",
            level=JurisdictionLevel.DISTRICT,
            parent_id=state.id,
        )
        session.add(district)
        await session.flush()
        secret = mfa.generate_secret()
        username = f"officer-{tag}-{suffix}"
        session.add(
            Investigator(
                username=username,
                display_name=f"Officer {tag}",
                password_hash=passwords.hash_password(PASSWORD),
                mfa_secret=secret,
                mfa_enrolled=True,
                role=Role.DISTRICT_INVESTIGATOR,
                jurisdiction_id=district.id,
            )
        )
        made.append((username, secret, district.id))
    await session.commit()

    yield made

    for username, _, _ in made:
        await session.execute(
            text("DELETE FROM iam.investigator WHERE username = :u"), {"u": username}
        )
    await session.execute(
        text("DELETE FROM complaints.complaint WHERE public_ref LIKE :p"),
        {"p": f"CMP-SYN-{suffix}%"},
    )
    await session.execute(
        text("DELETE FROM iam.jurisdiction WHERE code LIKE :p"), {"p": f"%-{suffix}"}
    )
    await session.commit()


def _login(client: TestClient, username: str, secret: str) -> dict[str, str]:
    r = client.post(
        "/api/v1/auth/login",
        json={
            "username": username,
            "password": PASSWORD,
            "totp_code": pyotp.TOTP(secret).now(),
        },
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.mark.asyncio
async def test_complaint_slice_end_to_end(
    client: TestClient, two_districts, session
) -> None:  # type: ignore[no-untyped-def]
    """The whole path, and the containment that makes it safe."""
    (user_a, secret_a, district_a), (user_b, secret_b, _) = two_districts
    auth_a = _login(client, user_a, secret_a)
    ref = f"CMP-SYN-{uuid.uuid4().hex[:6]}"

    # --- create ---------------------------------------------------------
    created = client.post(
        "/api/v1/complaints",
        headers=auth_a,
        json={
            "public_ref": ref,
            "reported_at": utc_now().isoformat(),
            "fraud_initiated_at": (utc_now() - timedelta(minutes=41)).isoformat(),
            "typology": "DIGITAL_ARREST",
            "reported_amount": "1240000.00",
            "victim_jurisdiction_id": str(district_a),
            "narrative": "Victim reports coercion over a video call.",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    complaint_id = body["id"]

    # Golden-hour position is computed, not stored — it is what tells an officer
    # whether any prediction on this case is still actionable.
    assert 40 <= body["golden_hour_minutes_elapsed"] <= 42
    # observed_at is server-set and must not equal the reported fraud time.
    assert body["observed_at"] != body["fraud_initiated_at"]
    assert body["is_synthetic"] is True

    # --- read back ------------------------------------------------------
    fetched = client.get(f"/api/v1/complaints/{complaint_id}", headers=auth_a)
    assert fetched.status_code == 200
    assert fetched.json()["public_ref"] == ref

    # --- containment: the sibling district must not see it ---------------
    auth_b = _login(client, user_b, secret_b)
    denied = client.get(f"/api/v1/complaints/{complaint_id}", headers=auth_b)
    assert denied.status_code == 404, "cross-jurisdiction read must 404, not 403"
    assert "jurisdiction" not in denied.text.lower(), "the 404 leaked why it was denied"

    # --- unauthenticated -------------------------------------------------
    assert client.get(f"/api/v1/complaints/{complaint_id}").status_code == 401

    # --- audited ---------------------------------------------------------
    events = await session.execute(
        text(
            "SELECT action, result FROM audit.audit_event "
            "WHERE resource_id = :ref ORDER BY sequence"
        ),
        {"ref": ref},
    )
    recorded = [(a, r) for a, r in events]
    assert ("complaint.create", "allowed") in recorded
    assert ("complaint.read", "allowed") in recorded
    # The denial is recorded too. A refusal nobody can see is not a control.
    assert ("complaint.read", "denied") in recorded


@pytest.mark.asyncio
async def test_duplicate_public_ref_is_rejected(
    client: TestClient, two_districts
) -> None:  # type: ignore[no-untyped-def]
    """Idempotency at the boundary — replaying a complaint must not duplicate it."""
    (user_a, secret_a, district_a), _ = two_districts
    auth = _login(client, user_a, secret_a)
    ref = f"CMP-SYN-{uuid.uuid4().hex[:6]}"
    payload = {
        "public_ref": ref,
        "reported_at": utc_now().isoformat(),
        "typology": "UPI_COLLECT_FRAUD",
        "reported_amount": "5000.00",
        "victim_jurisdiction_id": str(district_a),
    }
    assert (
        client.post("/api/v1/complaints", headers=auth, json=payload).status_code == 201
    )
    assert (
        client.post("/api/v1/complaints", headers=auth, json=payload).status_code == 422
    )


@pytest.mark.asyncio
async def test_cannot_file_a_complaint_in_another_jurisdiction(
    client: TestClient, two_districts
) -> None:  # type: ignore[no-untyped-def]
    """Write-side containment, not just read-side."""
    (user_a, secret_a, _), (_, _, district_b) = two_districts
    auth = _login(client, user_a, secret_a)
    r = client.post(
        "/api/v1/complaints",
        headers=auth,
        json={
            "public_ref": f"CMP-SYN-{uuid.uuid4().hex[:6]}",
            "reported_at": utc_now().isoformat(),
            "typology": "SEXTORTION",
            "reported_amount": "1000.00",
            "victim_jurisdiction_id": str(district_b),
        },
    )
    assert r.status_code == 404
