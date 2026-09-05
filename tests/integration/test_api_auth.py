"""The auth API end to end (master spec §29, §35, §36).

Exercises the real app through a client, so middleware, dependencies, error
handling and audit emission are all in the path — not mocked around.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pyotp
import pytest
from atlas.app import create_app
from atlas.core.enums import JurisdictionLevel, Role
from atlas.iam import mfa, passwords
from fastapi.testclient import TestClient
from sqlalchemy import text

PASSWORD = "a-sufficiently-long-test-password"


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app(), raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
async def officer(session) -> tuple[str, str]:  # type: ignore[no-untyped-def]
    """A committed investigator. Returns (username, totp_secret).

    Committed rather than left in the fixture's transaction because the API runs
    in its own session and would not otherwise see the row.
    """
    from atlas.iam.models import Investigator, Jurisdiction

    code = f"TEST-{uuid.uuid4().hex[:8]}"
    jurisdiction = Jurisdiction(
        code=code, name="Test District", level=JurisdictionLevel.DISTRICT
    )
    session.add(jurisdiction)
    await session.flush()

    username = f"officer-{uuid.uuid4().hex[:8]}"
    secret = mfa.generate_secret()
    session.add(
        Investigator(
            username=username,
            display_name="Test Officer",
            password_hash=passwords.hash_password(PASSWORD),
            mfa_secret=secret,
            mfa_enrolled=True,
            role=Role.DISTRICT_INVESTIGATOR,
            jurisdiction_id=jurisdiction.id,
        )
    )
    await session.commit()
    yield username, secret

    await session.execute(
        text("DELETE FROM iam.investigator WHERE username = :u"), {"u": username}
    )
    await session.execute(
        text("DELETE FROM iam.jurisdiction WHERE code = :c"), {"c": code}
    )
    await session.commit()


# --------------------------------------------------------------------------
# Health and plumbing
# --------------------------------------------------------------------------


def test_health_is_reachable(client: TestClient) -> None:
    assert client.get("/health").status_code == 200


def test_every_response_carries_a_correlation_id(client: TestClient) -> None:
    """Without it, "it failed at 14:03" is not a traceable report."""
    assert client.get("/health").headers.get("X-Correlation-ID")


def test_inbound_correlation_id_is_reused(client: TestClient) -> None:
    """So a call spanning services stays stitched together."""
    supplied = "abc123def456"
    r = client.get("/health", headers={"X-Correlation-ID": supplied})
    assert r.headers["X-Correlation-ID"] == supplied


def test_malformed_inbound_correlation_id_is_replaced(client: TestClient) -> None:
    """The value reaches the logs, so it is never trusted as given."""
    r = client.get("/health", headers={"X-Correlation-ID": "not valid\nlog-injection"})
    assert r.headers["X-Correlation-ID"] != "not valid\nlog-injection"


# --------------------------------------------------------------------------
# Login
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_succeeds_with_password_and_totp(
    client: TestClient, officer
) -> None:  # type: ignore[no-untyped-def]
    username, secret = officer
    r = client.post(
        "/api/v1/auth/login",
        json={
            "username": username,
            "password": PASSWORD,
            "totp_code": pyotp.TOTP(secret).now(),
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["access_token"] and body["refresh_token"]
    assert body["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_without_totp_is_rejected(client: TestClient, officer) -> None:  # type: ignore[no-untyped-def]
    username, _ = officer
    r = client.post(
        "/api/v1/auth/login", json={"username": username, "password": PASSWORD}
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_wrong_password_is_rejected(client: TestClient, officer) -> None:  # type: ignore[no-untyped-def]
    username, secret = officer
    r = client.post(
        "/api/v1/auth/login",
        json={
            "username": username,
            "password": "wrong",
            "totp_code": pyotp.TOTP(secret).now(),
        },
    )
    assert r.status_code == 401


def test_unknown_user_returns_the_same_shape(client: TestClient) -> None:
    """A different status or message here would enumerate usernames."""
    r = client.post(
        "/api/v1/auth/login",
        json={"username": "no-such-officer", "password": "x", "totp_code": "123456"},
    )
    assert r.status_code == 401
    assert r.json()["error"] == "authentication_required"


def test_error_body_leaks_no_internals(client: TestClient) -> None:
    """No stack trace, no exception type, no SQL (master spec §36)."""
    r = client.post(
        "/api/v1/auth/login",
        json={"username": "nobody", "password": "x", "totp_code": "123456"},
    )
    body = r.text.lower()
    for leak in ("traceback", "sqlalchemy", "asyncpg", 'file "', "select "):
        assert leak not in body, f"response leaked {leak!r}"
    assert set(r.json()) == {"error", "message", "correlation_id"}


# --------------------------------------------------------------------------
# Protected endpoints
# --------------------------------------------------------------------------


def test_me_requires_a_token(client: TestClient) -> None:
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 401


def test_garbage_token_is_rejected(client: TestClient) -> None:
    r = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_me_returns_only_the_callers_own_record(
    client: TestClient, officer
) -> None:  # type: ignore[no-untyped-def]
    username, secret = officer
    token = client.post(
        "/api/v1/auth/login",
        json={
            "username": username,
            "password": PASSWORD,
            "totp_code": pyotp.TOTP(secret).now(),
        },
    ).json()["access_token"]

    r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["username"] == username
    # A profile must never carry credential material.
    assert "password_hash" not in r.json()
    assert "mfa_secret" not in r.json()


@pytest.mark.asyncio
async def test_refresh_token_is_not_accepted_as_an_access_token(
    client: TestClient, officer
) -> None:  # type: ignore[no-untyped-def]
    """Otherwise a long-lived credential becomes a permanent API key."""
    username, secret = officer
    refresh = client.post(
        "/api/v1/auth/login",
        json={
            "username": username,
            "password": PASSWORD,
            "totp_code": pyotp.TOTP(secret).now(),
        },
    ).json()["refresh_token"]

    r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {refresh}"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_logout_revokes_the_token_immediately(
    client: TestClient, officer
) -> None:  # type: ignore[no-untyped-def]
    """Short expiry shrinks the window; it does not remove the need to kill a session."""
    username, secret = officer
    token = client.post(
        "/api/v1/auth/login",
        json={
            "username": username,
            "password": PASSWORD,
            "totp_code": pyotp.TOTP(secret).now(),
        },
    ).json()["access_token"]
    auth = {"Authorization": f"Bearer {token}"}

    assert client.get("/api/v1/auth/me", headers=auth).status_code == 200
    assert client.post("/api/v1/auth/logout", headers=auth).status_code == 204
    assert client.get("/api/v1/auth/me", headers=auth).status_code == 401


@pytest.mark.asyncio
async def test_login_is_audited(client: TestClient, officer, session) -> None:  # type: ignore[no-untyped-def]
    """A successful login must leave a record."""
    username, secret = officer
    client.post(
        "/api/v1/auth/login",
        json={
            "username": username,
            "password": PASSWORD,
            "totp_code": pyotp.TOTP(secret).now(),
        },
    )
    result = await session.execute(
        text(
            "SELECT result, detail::text FROM audit.audit_event "
            "WHERE action = 'auth.login' AND detail->>'username' = :u "
            "ORDER BY sequence DESC LIMIT 1"
        ),
        {"u": username},
    )
    row = result.first()
    assert row is not None, "successful login produced no audit event"
    assert row[0] == "allowed"


@pytest.mark.asyncio
async def test_failed_login_is_audited_and_stores_no_password(
    client: TestClient, officer, session
) -> None:  # type: ignore[no-untyped-def]
    """A run of these is what credential stuffing looks like from the inside.

    The record must exist — and must not itself become the breach by storing the
    password that was tried.
    """
    username, _ = officer
    client.post(
        "/api/v1/auth/login",
        json={
            "username": username,
            "password": "wrong-password-attempt",
            "totp_code": "000000",
        },
    )
    result = await session.execute(
        text(
            "SELECT result, detail::text FROM audit.audit_event "
            "WHERE action = 'auth.login' AND detail->>'username' = :u "
            "ORDER BY sequence DESC LIMIT 1"
        ),
        {"u": username},
    )
    row = result.first()
    assert row is not None, "failed login produced no audit event"
    assert row[0] == "denied"
    assert "wrong-password-attempt" not in row[1]
