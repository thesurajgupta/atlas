-- ATLAS extensions and schema layout (ADR-001, ADR-009).
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS h3;
CREATE EXTENSION IF NOT EXISTS h3_postgis CASCADE;
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pgcrypto;      -- audit hash chaining (ADR-007)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- One schema per module (ADR-009). Cross-schema reads are forbidden by convention
-- and enforced at the application layer by import-linter.
CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS ingest;
CREATE SCHEMA IF NOT EXISTS complaints;
CREATE SCHEMA IF NOT EXISTS entity;
CREATE SCHEMA IF NOT EXISTS graph;
CREATE SCHEMA IF NOT EXISTS features;
CREATE SCHEMA IF NOT EXISTS predict;
CREATE SCHEMA IF NOT EXISTS geo;
CREATE SCHEMA IF NOT EXISTS cases;
CREATE SCHEMA IF NOT EXISTS alerts;
CREATE SCHEMA IF NOT EXISTS intel;
CREATE SCHEMA IF NOT EXISTS audit;

-- Hidden ground truth (master spec §19.2). Deliberately NOT granted to the
-- application or feature roles. A migration test asserts the absence of that grant.
CREATE SCHEMA IF NOT EXISTS truth;
