"""`/auth/demo-login` must not exist outside development (spec §29, §35).

The endpoint computes a demo account's TOTP server-side so a code cannot expire
mid-typing during a demo. That is a convenience, and a convenience that touches
authentication is exactly the kind of thing that ships by accident — so the gate
is asserted here rather than trusted to a docstring.

What it must never become is an authentication bypass. The password is still
sent by the caller and still verified with argon2id; only the second factor is
supplied by the server. These tests pin both halves: the environment gate, and
the fact that a wrong password still fails.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator, Iterator
from types import SimpleNamespace

import atlas.iam.router as router_module
import pytest
import pytest_asyncio
from atlas.app import create_app
from atlas.core.config import Environment, get_settings
from atlas.core.enums import JurisdictionLevel, Role
from atlas.iam import mfa, passwords
from fastapi.testclient import TestClient
from sqlalchemy import text

PASSWORD = "a-sufficiently-long-test-password"


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app(), raise_server_exceptions=False) as c:
        yield c


@pytest_asyncio.fixture
async def demo_account(session) -> AsyncIterator[str]:  # type: ignore[no-untyped-def]
    """An account named like the seeded demo investigator, with a known password.

    Adopts the seeded row when there is one rather than inserting a second — the
    username is unique, and `scripts/seed_demo.py` has usually run on a developer
    machine. The original password hash is put back on teardown, so running the
    suite does not silently change the password the demo signs in with.
    """
    from atlas.iam.models import Investigator, Jurisdiction

    username = "demo.investigator"
    existing = (
        await session.execute(
            text("SELECT id, password_hash FROM iam.investigator WHERE username = :u"),
            {"u": username},
        )
    ).first()

    if existing is not None:
        account_id, original_hash = existing
        await session.execute(
            text("UPDATE iam.investigator SET password_hash = :ph WHERE id = :id"),
            {"ph": passwords.hash_password(PASSWORD), "id": account_id},
        )
        await session.commit()
        yield username
        await session.execute(
            text("UPDATE iam.investigator SET password_hash = :ph WHERE id = :id"),
            {"ph": original_hash, "id": account_id},
        )
        await session.commit()
        return

    code = f"TEST-DEMO-{uuid.uuid4().hex[:6]}"
    jurisdiction = Jurisdiction(
        code=code, name="Demo Test District", level=JurisdictionLevel.DISTRICT
    )
    session.add(jurisdiction)
    await session.flush()
    session.add(
        Investigator(
            username=username,
            display_name="Demo Investigator",
            password_hash=passwords.hash_password(PASSWORD),
            mfa_secret=mfa.generate_secret(),
            mfa_enrolled=True,
            role=Role.DISTRICT_INVESTIGATOR,
            jurisdiction_id=jurisdiction.id,
        )
    )
    await session.commit()
    yield username

    await session.execute(
        text("DELETE FROM iam.investigator WHERE username = :u"), {"u": username}
    )
    await session.execute(
        text("DELETE FROM iam.jurisdiction WHERE code = :c"), {"c": code}
    )
    await session.commit()


# --------------------------------------------------------------------------
# The gate
# --------------------------------------------------------------------------


@pytest.mark.parametrize("env", [Environment.STAGING, Environment.PRODUCTION])
def test_the_endpoint_does_not_exist_outside_development(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, env: Environment
) -> None:
    """404, not 403.

    A 403 would confirm the route exists, and the first thing worth knowing
    about a convenience endpoint in a deployed environment is nothing at all.

    The environment is swapped by patching what the router reads, not by setting
    ``ATLAS_ENV``. Going through the real ``Settings`` would trip a *different*
    control first — it refuses to construct outside development while
    ``jwt_secret`` and ``db_password`` are placeholders — and the request would
    then fail for a reason that has nothing to do with the gate under test.
    """
    real = get_settings()
    monkeypatch.setattr(
        router_module,
        "get_settings",
        lambda: SimpleNamespace(
            env=env, cors_allowed_origins=real.cors_allowed_origins
        ),
    )

    response = client.post(
        "/api/v1/auth/demo-login",
        json={"username": "demo.investigator", "password": PASSWORD},
    )

    assert response.status_code == 404
    assert "demo" not in response.text.lower()


def test_an_account_outside_the_allow_list_is_refused(client: TestClient) -> None:
    """The list is explicit, not a `demo.` prefix rule.

    A pattern is something an account satisfies by accident; an allow-list is
    not.
    """
    response = client.post(
        "/api/v1/auth/demo-login",
        json={"username": "demo.someone.else", "password": PASSWORD},
    )

    assert response.status_code == 404


# --------------------------------------------------------------------------
# Not a bypass
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_the_password_is_still_required(
    client: TestClient, demo_account: str
) -> None:
    """The half that stops this being an authentication bypass.

    Only the second factor is supplied by the server. If a wrong password ever
    succeeded here, the endpoint would be a way into any allow-listed account
    from anywhere the API is reachable.
    """
    response = client.post(
        "/api/v1/auth/demo-login",
        json={"username": demo_account, "password": "wrong-password"},
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_a_correct_password_issues_tokens_without_a_typed_code(
    client: TestClient, demo_account: str
) -> None:
    """The point of the endpoint: no TOTP in the request, and it still works."""
    response = client.post(
        "/api/v1/auth/demo-login",
        json={"username": demo_account, "password": PASSWORD},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["access_token"] and body["refresh_token"]


@pytest.mark.asyncio
async def test_the_login_is_audited_like_any_other(
    client: TestClient, demo_account: str, session
) -> None:  # type: ignore[no-untyped-def]
    """A convenience route must not be a hole in the audit trail.

    It reuses the ordinary login handler precisely so this cannot drift.
    """
    before = await session.scalar(
        text("SELECT count(*) FROM audit.audit_event WHERE action = 'auth.login'")
    )
    client.post(
        "/api/v1/auth/demo-login",
        json={"username": demo_account, "password": PASSWORD},
    )
    after = await session.scalar(
        text("SELECT count(*) FROM audit.audit_event WHERE action = 'auth.login'")
    )

    assert after > (before or 0)
