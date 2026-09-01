# ADR-009 — Modular monolith with CI-enforced boundaries

**Status:** Accepted · **Date:** 2026-09-01

## Context

The predecessor brief contradicted itself directly. §2: *"Prefer a modular architecture that can begin
as a well-structured modular monolith… Do NOT prematurely create dozens of microservices."* §3: a
mandated repository layout containing **twelve separate service directories**.

Following the layout would have produced twelve deploy units, twelve Dockerfiles, inter-service auth,
distributed tracing across every call, and distributed-transaction problems — for a system with one
team, one database and ~0.1 events/sec.

## Decision

**One deployable API. Hard internal module boundaries, enforced in CI.**

- One package `atlas`, one sub-package per bounded context: `core` `iam` `ingest` `complaints` `entity`
  `graph` `features` `predict` `geo` `cases` `alerts` `intel` `audit`.
- **One PostgreSQL schema per module.** Cross-module data access goes through the owning module's
  service interface — never by querying another module's schema.
- **`import-linter` in CI** enforces the dependency graph. Layered contract: `core` depends on nothing;
  domain modules may not import each other except through declared interfaces; `simulator` is
  importable by nothing in the serving path.
- Each module exposes an explicit `service.py` interface — the seam along which it could be extracted.

## Alternatives considered

- **Twelve microservices** (the brief's layout). Rejected: operational cost with no benefit at this
  scale and team size; would consume the build budget on infrastructure rather than on the prediction
  quality that the PS is actually about.
- **Unstructured monolith.** Rejected: boundaries that exist only in convention erode within weeks, and
  a six-person team working in parallel needs enforced interfaces to avoid blocking each other.
- **Modular monolith without CI enforcement.** Rejected: an unenforced rule is a comment.

## Consequences

- Fast local development; the whole system starts with one command.
- One scaling unit. Accepted: at 5× PS volume a single instance suffices, and horizontal replication
  behind a load balancer is available before decomposition is needed.
- **The extraction path is real and tested**, not aspirational: a module with its own schema and no
  cross-schema reads can be lifted out without touching callers.
- Developers will occasionally fight `import-linter`. That is the control working.
