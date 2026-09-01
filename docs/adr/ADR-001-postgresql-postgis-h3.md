# ADR-001 — PostgreSQL + PostGIS + H3 as the single primary store

**Status:** Accepted · **Date:** 2026-09-01

## Context

ATLAS must hold relational case data, time-series transactions, geospatial endpoints and boundaries, a
transaction graph, and a point-in-time feature store — and must run offline from `docker compose up` on
a laptop for the demo.

The obvious alternative is a polyglot stack: relational store + graph DB + time-series DB + geospatial
service. Each additional datastore adds an operational failure mode, a consistency boundary, and a
container the demo cannot afford to lose.

## Decision

**One PostgreSQL 16 instance**, with:

- **PostGIS** — geometry, distance, spatial joins, administrative boundaries.
- **h3-pg** — the H3 hexagonal lattice used as the prediction unit (spec §15.1). H3 gives equal-area
  cells with clean parent/child aggregation, which PostGIS grids do not.
- **TimescaleDB** — hypertables for transactions and feature rows, both of which are append-heavy and
  always queried by time range.
- **Schema-per-module** — the module boundary is also a database boundary (ADR-009).

Cross-cutting: all timestamps `TIMESTAMPTZ`, stored UTC, presented IST.

## Alternatives considered

- **Polyglot persistence.** Rejected: consistency between case data and graph data matters more here
  than per-store performance, and every extra store is a demo failure mode.
- **PostGIS grid instead of H3.** Rejected: variable-area cells make PAI (an area-normalised metric)
  awkward to compute and to defend.
- **SQLite for the demo.** Rejected: no PostGIS/H3 parity, so the demo would not exercise the real
  query paths.

## Consequences

- Single backup, restore and migration story.
- Transactional consistency across case, graph and prediction data.
- PostgreSQL becomes a scaling bottleneck before anything else. Accepted: at 5× the PS volume this is
  comfortably within a single well-indexed instance, and read replicas are the documented next step.
- Requires a Postgres image with three extensions; pinned in `infra/docker`.

## Build note (added during Phase 0)

No public image carries PostGIS, H3 and TimescaleDB together, so `infra/docker/postgres/Dockerfile`
builds one on `postgis/postgis:16-3.4`.

Two things learned while making it work, recorded so nobody rediscovers them:

- **h3-pg is pinned by commit SHA, not tag.** Tags can be moved, and reproducibility is an acceptance
  criterion (spec §49, criterion 22). Pinned at `04227cb…` = h3-pg 4.2.3.
- **Link-time optimisation must be disabled** when compiling h3-pg on this base image. The base is
  Debian bullseye with gcc-10, where a parallel LTO link of `postgresql_h3_shared` fails with
  `lto-wrapper: fatal error`. Built with `-DCMAKE_INTERPROCEDURAL_OPTIMIZATION=OFF -DCMAKE_C_FLAGS=-fno-lto`.
  The performance cost is irrelevant here — H3 index operations are not the bottleneck.
