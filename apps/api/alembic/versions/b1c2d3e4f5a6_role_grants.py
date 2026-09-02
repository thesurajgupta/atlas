"""phase 1: role grants and the leakage boundary

Revision ID: b1c2d3e4f5a6
Revises: a436cdfe30cd
Create Date: 2026-09-02

Grants belong in a migration, not only in the Docker initdb script. The initdb
script runs once, on a fresh container; a teammate's existing Postgres, a CI
service or a staging database would otherwise get the tables without the
security posture — which fails silently and looks fine.

Three things are established here:

1. `atlas_app` can read and write the operational schemas.
2. `audit` is append-only for everyone: SELECT and INSERT, never UPDATE or DELETE.
3. `atlas_features` gets read-only access to what the feature pipeline needs, and
   nothing on `truth`.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "b1c2d3e4f5a6"
down_revision: str | None = "a436cdfe30cd"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Schemas the application reads and writes.
APP_SCHEMAS = (
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
)

# Schemas the feature pipeline may read. Deliberately excludes `iam` (credentials
# are not features) and `truth` (that is the whole point).
FEATURE_READ_SCHEMAS = ("complaints", "entity", "graph", "geo", "predict", "features")


def upgrade() -> None:
    for role in ("atlas_app", "atlas_features", "atlas_sim"):
        op.execute(
            f"DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='{role}') "
            f"THEN CREATE ROLE {role} LOGIN PASSWORD 'change-me-locally'; END IF; END $$;"
        )

    for schema in APP_SCHEMAS:
        op.execute(f"GRANT USAGE ON SCHEMA {schema} TO atlas_app")
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA {schema} TO atlas_app")
        op.execute(f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA {schema} TO atlas_app")
        op.execute(
            f"ALTER DEFAULT PRIVILEGES IN SCHEMA {schema} "
            f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO atlas_app"
        )

    # Audit: append-only. Granted separately and deliberately narrower.
    op.execute("GRANT USAGE ON SCHEMA audit TO atlas_app")
    op.execute("GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA audit TO atlas_app")
    op.execute("REVOKE UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA audit FROM atlas_app")
    op.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA audit GRANT SELECT, INSERT ON TABLES TO atlas_app")
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA audit "
        "REVOKE UPDATE, DELETE, TRUNCATE ON TABLES FROM atlas_app"
    )

    # Feature pipeline: read-only, and never `truth`.
    for schema in FEATURE_READ_SCHEMAS:
        op.execute(f"GRANT USAGE ON SCHEMA {schema} TO atlas_features")
        op.execute(f"GRANT SELECT ON ALL TABLES IN SCHEMA {schema} TO atlas_features")
        op.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA {schema} GRANT SELECT ON TABLES TO atlas_features")
    op.execute("GRANT INSERT, UPDATE ON ALL TABLES IN SCHEMA features TO atlas_features")

    # The load-bearing revoke. Leakage gate 2 (master spec §19.2).
    op.execute("REVOKE ALL ON SCHEMA truth FROM atlas_app, atlas_features, PUBLIC")
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA truth "
        "REVOKE ALL ON TABLES FROM atlas_app, atlas_features, PUBLIC"
    )
    op.execute("GRANT USAGE, CREATE ON SCHEMA truth TO atlas_sim")


def downgrade() -> None:
    for schema in (*APP_SCHEMAS, "audit"):
        op.execute(f"REVOKE ALL ON ALL TABLES IN SCHEMA {schema} FROM atlas_app")
        op.execute(f"REVOKE ALL ON SCHEMA {schema} FROM atlas_app")
    for schema in FEATURE_READ_SCHEMAS:
        op.execute(f"REVOKE ALL ON ALL TABLES IN SCHEMA {schema} FROM atlas_features")
        op.execute(f"REVOKE ALL ON SCHEMA {schema} FROM atlas_features")
