# Architecture Decision Records

One file per significant decision. Format: **Context · Decision · Alternatives considered ·
Consequences**. An ADR is immutable once accepted; to change a decision, write a new ADR that
supersedes it and update this index.

| ADR | Decision | Status |
|---|---|---|
| [001](ADR-001-postgresql-postgis-h3.md) | PostgreSQL + PostGIS + H3 as the single primary store | Accepted |
| [002](ADR-002-no-neo4j.md) | No Neo4j — recursive CTEs for bounded money trails | Accepted |
| [003](ADR-003-redis-streams-not-kafka.md) | Redis Streams, not Kafka, at this volume | Accepted |
| [004](ADR-004-three-tier-model-strategy.md) | Three-tier prediction stack | Accepted |
| [005](ADR-005-synthetic-data-strategy.md) | Synthetic data strategy and generator lineage | Accepted |
| [006](ADR-006-authentication.md) | Authentication and identity | Accepted |
| [007](ADR-007-audit-architecture.md) | Hash chain + externally signed checkpoints | Accepted |
| [008](ADR-008-ledger-vs-blockchain.md) | Ledger vs blockchain — what was rejected and why | Accepted |
| [009](ADR-009-modular-monolith.md) | Modular monolith with CI-enforced boundaries | Accepted |
| [010](ADR-010-public-repository-boundary.md) | Public repository security boundary | Accepted |
| [011](ADR-011-prediction-granularity.md) | Prediction granularity — H3 resolution by PAI sweep | Accepted (pending sweep) |
| [012](ADR-012-candidate-generation.md) | Candidate generation and negative sampling | Accepted |
| [013](ADR-013-entity-resolution.md) | Entity resolution as a first-class subsystem, with dynamic entity risk | Accepted |
| [014](ADR-014-outbound-intelligence-protocol.md) | Outbound intelligence: certification and bidirectional response | Accepted |
