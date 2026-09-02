"""Shared test fixtures."""

from __future__ import annotations

import sys
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "apps" / "api"))

from atlas.core.config import get_settings


@pytest.fixture(scope="session")
def settings():  # type: ignore[no-untyped-def]
    return get_settings()


@pytest_asyncio.fixture
async def session(settings) -> AsyncIterator[AsyncSession]:  # type: ignore[no-untyped-def]
    """A rolled-back session, so tests never leave state behind."""
    engine = create_async_engine(settings.database_url, poolclass=None)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with factory() as s:
        yield s
        await s.rollback()
    await engine.dispose()
