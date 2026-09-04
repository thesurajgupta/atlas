"""The database-skip list covers every fixture that needs a database.

Not ceremony. ``DB_FIXTURES`` held only ``session`` until a run with Docker
stopped produced a wall of asyncpg tracebacks from the API tests — which take
``client``, not ``session``, and so were never skipped.

A half-working skip is worse than none: the tests it does skip make the run look
healthy, and the ones it misses read as broken code rather than a stopped
container. This test fails if a new database-backed fixture is added without
being listed.
"""

from __future__ import annotations

import ast
from pathlib import Path

from tests.conftest import DB_FIXTURES

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_session_and_client_are_both_listed() -> None:
    assert {"session", "client"} <= DB_FIXTURES


def test_every_fixture_that_builds_a_test_client_is_listed() -> None:
    """A ``TestClient`` drives the real app, which needs the real database.

    Finds the fixtures by parsing rather than trusting the list to stay current —
    the failure this guards against is somebody adding a third one.
    """
    client_fixtures: set[str] = set()
    for path in (REPO_ROOT / "tests").rglob("test_*.py"):
        if path == Path(__file__):
            continue  # this file names TestClient only to describe it
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                continue
            decorated = any("fixture" in ast.dump(d) for d in node.decorator_list)
            if decorated and "TestClient" in ast.dump(node):
                client_fixtures.add(node.name)

    assert client_fixtures, (
        "no TestClient fixtures found; this check would pass vacuously"
    )
    missing = client_fixtures - DB_FIXTURES
    assert not missing, (
        f"fixtures {sorted(missing)} build a TestClient against the real database "
        f"but are not in DB_FIXTURES, so their tests will not skip when PostgreSQL "
        f"is down — they will fail with asyncpg tracebacks that read like broken code"
    )
