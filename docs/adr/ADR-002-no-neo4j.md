# ADR-002 — No Neo4j; recursive CTEs for bounded money trails

**Status:** Accepted · **Date:** 2026-09-01

## Context

The predecessor brief left this open: *"Neo4j OR PostgreSQL graph-oriented modeling depending on
complexity. Use Neo4j if graph traversal is genuinely valuable."* A specification whose job is to decide
cannot leave the datastore undecided, so this ADR closes it.

The workload: reconstruct money trails from a victim account to cash-out endpoints, compute degree,
centrality, community membership and fan-in/fan-out, and traverse **time-respecting** paths only.

The decisive property is **depth**. Real layering chains in Indian cyber-fraud cases are typically 3–8
hops before cash-out, and are bounded in practice by the golden hour. This is not an unbounded
traversal problem.

## Decision

Use **PostgreSQL recursive CTEs over a materialised adjacency table**. No Neo4j.

- `graph.edge` materialised from transactions, indexed on `(src, ts)` and `(dst, ts)`.
- Recursive CTE with a hop limit and a monotonic-time predicate for trail reconstruction.
- Centrality and community detection computed **offline** into `graph.node_metrics`; these are
  features, not interactive queries, so they do not need a graph engine's online traversal speed.
- Apache AGE available behind an optional compose profile for exploratory work only. Nothing in the
  serving path may depend on it.

## Alternatives considered

- **Neo4j.** Rejected. Buys fast deep traversal we do not need; costs transactional consistency with
  case data, a second backup/restore story, a second security boundary to harden, a second container in
  the demo, and a sync pipeline that can silently drift. The performance advantage appears at depths
  and volumes this problem does not reach.
- **NetworkX in-process.** Rejected for serving — will not hold the full graph at target scale — but
  used in `ml/` for offline metric computation, where the working set is a subgraph.
- **Apache AGE as primary.** Rejected: less mature than either alternative, and inherits Postgres
  limits anyway.

## Consequences

- One store, one consistency model, one thing to secure.
- Deep or unbounded traversals would be slow. Accepted: they are out of scope, and the hop limit is
  explicit rather than accidental.
- `atlas.graph` exposes a narrow interface (`reconstruct_trail`, `neighbourhood`, `node_metrics`) so
  the storage engine can be swapped without touching callers. **This interface is the seam** — if
  traversal depth ever grows past what CTEs handle, the migration is confined to one module.

## Revisit trigger

Median trail depth exceeding ~12 hops, or p95 trail reconstruction latency exceeding 2s at target
scale, with query tuning exhausted.
