"""Alembic environment.

Imports every model module so ``--autogenerate`` sees the full metadata. A model
that is not imported here is invisible to migrations, which fails silently — the
table simply never gets created.
"""

from __future__ import annotations

import asyncio
from collections.abc import MutableMapping
from logging.config import fileConfig
from typing import Literal

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Imported for their side effect of registering tables on Base.metadata.
from atlas.audit import models as audit_models  # noqa: F401
from atlas.cases import models as cases_models  # noqa: F401
from atlas.complaints import models as complaints_models  # noqa: F401
from atlas.core.config import get_settings
from atlas.core.database import Base
from atlas.entity import models as entity_models  # noqa: F401
from atlas.features import models as features_models  # noqa: F401
from atlas.geo import models as geo_models  # noqa: F401
from atlas.graph import models as graph_models  # noqa: F401
from atlas.iam import models as iam_models  # noqa: F401

NameFilterType = Literal[
    "schema",
    "table",
    "column",
    "index",
    "unique_constraint",
    "foreign_key_constraint",
    "check_constraint",
]
NameFilterParentNames = Literal["schema_name", "table_name", "schema_qualified_table_name"]

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# One schema per module (ADR-009). `truth` is deliberately absent: it belongs to
# the simulator and the serving path has no grant on it (master spec §19.2).
SCHEMAS = (
    "core",
    "iam",
    "ingest",
    "complaints",
    "entity",
    "graph",
    "features",
    "predict",
    "geo",
    "cases",
    "alerts",
    "intel",
    "audit",
)


# Extensions install their own catalogs (PostGIS, TimescaleDB). Reflecting them
# produces migrations that try to recreate extension internals — which is both
# wrong and, in TimescaleDB's case, not even valid Python once autogenerate hits
# a table it cannot represent.
IGNORED_TABLES = frozenset({"spatial_ref_sys", "geometry_columns", "geography_columns"})


def include_name(
    name: str | None,
    type_: NameFilterType,
    parent_names: MutableMapping[NameFilterParentNames, str | None],
) -> bool:
    """Restrict autogenerate to ATLAS's own schemas.

    A whitelist, not a blacklist: any extension we add later brings its own
    catalog schemas, and we should not have to remember to exclude each one.
    """
    if type_ == "schema":
        return name in SCHEMAS
    return True


def include_object(
    obj: object, name: str | None, type_: str, reflected: bool, compare_to: object
) -> bool:
    """Drop extension bookkeeping tables that live inside our schemas."""
    return not (type_ == "table" and name in IGNORED_TABLES)


def ensure_schemas(connection: Connection) -> None:
    """Create the module schemas before any migration runs.

    Doing this here rather than only in the Docker initdb script means
    `alembic upgrade head` works against a bare database — a fresh CI service, a
    teammate's existing Postgres, a staging instance. It also has to happen
    before Alembic writes its own version table, which lives in `core`.

    Note `truth` is absent by design: it belongs to the simulator, and the
    serving path has no grant on it (master spec §19.2).
    """
    for schema in SCHEMAS:
        connection.exec_driver_sql(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')


def do_run_migrations(connection: Connection) -> None:
    ensure_schemas(connection)
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_schemas=True,
        include_name=include_name,
        include_object=include_object,
        compare_type=True,
        version_table_schema="core",
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = get_settings().database_url
    connectable = async_engine_from_config(section, prefix="sqlalchemy.", poolclass=pool.NullPool)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
        # SQLAlchemy 2.0 async connections do not autocommit. Without this the
        # migration appears to succeed, logs "Running upgrade", and silently
        # rolls back — leaving an empty database and a version table that never
        # advances.
        await connection.commit()
    await connectable.dispose()


def run_migrations_offline() -> None:
    context.configure(
        url=get_settings().database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        include_schemas=True,
        version_table_schema="core",
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_async_migrations())
