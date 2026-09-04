"""Shared test fixtures."""

from __future__ import annotations

import os
import sys
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "apps" / "api"))
# simulator/ is a top-level package (deliberately outside apps/api — see
# simulator/__init__.py on why it must stay unimportable from atlas.* itself), so it needs
# its own sys.path entry to be importable from tests.
sys.path.insert(0, str(REPO_ROOT))

from atlas.core.config import get_settings


@pytest.fixture(scope="session")
def settings():  # type: ignore[no-untyped-def]
    return get_settings()


def _database_reachable() -> bool:
    """Is PostgreSQL up?

    Checked once per session with a plain TCP connect — far cheaper than letting
    asyncpg fail, and it produces a message a human can act on.
    """
    import socket

    cfg = get_settings()
    try:
        with socket.create_connection((cfg.db_host, cfg.db_port), timeout=1.5):
            return True
    except OSError:
        return False


#: Fixtures that cannot work without PostgreSQL.
#:
#: ``session`` was the only entry until a run with Docker stopped produced a wall
#: of asyncpg tracebacks from the API tests — which take ``client``, not
#: ``session``, and so were never skipped. The skip logic below existed
#: specifically to prevent that, and half-worked, which is worse than not
#: existing: it made the remaining failures look like broken code rather than a
#: stopped container.
DB_FIXTURES: frozenset[str] = frozenset({"session", "client"})

_DB_UP: bool | None = None


def pytest_collection_modifyitems(config, items) -> None:  # type: ignore[no-untyped-def]
    """Skip database tests cleanly when PostgreSQL is not running.

    Not everyone needs a database. The frontend work runs entirely on mock data,
    so requiring Docker there is friction for no benefit.

    Without this, a stopped database surfaces as a wall of asyncpg connection
    traces that read like broken code — people lose time debugging their own
    work before realising nothing was wrong with it.

    CI always has a database, so coverage there is unaffected: this only ever
    skips on a developer machine.
    """
    global _DB_UP
    needs_db = [i for i in items if DB_FIXTURES & set(getattr(i, "fixturenames", ()))]
    if not needs_db:
        return
    if _DB_UP is None:
        _DB_UP = _database_reachable()
    if _DB_UP:
        return

    # In CI a missing database is a broken pipeline, not a convenience. Skipping
    # there would let the leakage and audit gates vanish while the build stayed
    # green — the exact failure this project keeps finding. ATLAS_REQUIRE_DB=1
    # turns the skip into a hard failure.
    if os.environ.get("ATLAS_REQUIRE_DB") == "1":
        raise pytest.UsageError(
            f"ATLAS_REQUIRE_DB=1 but PostgreSQL is unreachable at "
            f"{get_settings().db_host}:{get_settings().db_port}. "
            f"{len(needs_db)} database tests would have been skipped, including the "
            f"leakage and audit gates. Refusing to report a green run."
        )

    skip = pytest.mark.skip(
        reason="PostgreSQL not reachable — run `make up` to include database tests"
    )
    for item in needs_db:
        item.add_marker(skip)


@pytest_asyncio.fixture
async def session(settings) -> AsyncIterator[AsyncSession]:  # type: ignore[no-untyped-def]
    """A rolled-back session, so tests never leave state behind."""
    engine = create_async_engine(settings.database_url, poolclass=None)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with factory() as s:
        yield s
        await s.rollback()
    await engine.dispose()
