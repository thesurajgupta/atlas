-- Role separation enforcing the leakage boundary (master spec §19.2).
--
-- atlas_app      : the serving path. No access to `truth`.
-- atlas_features : the feature pipeline. No access to `truth`.
-- atlas_sim      : the simulator. The ONLY role that may touch `truth`.
--
-- Passwords here are development-only placeholders, overridden by env elsewhere.
-- Never put a real credential in this file.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'atlas_app') THEN
    CREATE ROLE atlas_app LOGIN PASSWORD 'change-me-locally';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'atlas_features') THEN
    CREATE ROLE atlas_features LOGIN PASSWORD 'change-me-locally';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'atlas_sim') THEN
    CREATE ROLE atlas_sim LOGIN PASSWORD 'change-me-locally';
  END IF;
END $$;

GRANT USAGE ON SCHEMA iam, ingest, complaints, entity, graph, features,
                      predict, geo, cases, alerts, intel, audit
  TO atlas_app;

GRANT USAGE ON SCHEMA features, graph, entity, complaints, predict, geo
  TO atlas_features;

GRANT USAGE ON SCHEMA truth TO atlas_sim;

-- The load-bearing lines: revoke `truth` from everything that predicts.
REVOKE ALL ON SCHEMA truth FROM atlas_app, atlas_features, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA truth
  REVOKE ALL ON TABLES FROM atlas_app, atlas_features, PUBLIC;

-- Audit is append-only (ADR-007): no UPDATE, no DELETE, for anyone.
ALTER DEFAULT PRIVILEGES IN SCHEMA audit
  GRANT SELECT, INSERT ON TABLES TO atlas_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit
  REVOKE UPDATE, DELETE, TRUNCATE ON TABLES FROM atlas_app, atlas_features, PUBLIC;
