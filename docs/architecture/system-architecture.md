# System Architecture

Closes part of issue #9 (`docs: architecture diagrams (Mermaid)`) and the diagram
requirement in master spec §44. Two diagrams: the **system architecture** (container
view of the modular monolith, ADR-009) and the **entity-relationship diagram** for the
core domain model (master spec §8, §13, §26, §32).

Scope note: this describes environment **A — public repo / hackathon** (master spec
§5). Identity, secrets and connectors are the synthetic/built-in variants; production
swaps them behind the same ports without changing this picture.

---

## 1. System architecture (container view)

ATLAS is a **modular monolith** (ADR-009): one deployable API, one PostgreSQL
instance, hard module boundaries enforced in CI by `import-linter`. This diagram shows
the modules inside `apps/api/atlas`, the one-schema-per-module rule, and the ports at
the edge that keep production connectors out of the public repository.

```mermaid
flowchart TB
    subgraph Client["Client layer"]
        WEB["apps/web<br/>Next.js investigator + admin UI<br/>MapLibre · deck.gl · Cytoscape.js · ECharts"]
        DEMO["apps/demo-console<br/>reproducible demo driver"]
        BANK["Bank / CFCFRMS<br/>outbound intelligence recipient"]
    end

    subgraph API["apps/api/atlas — modular monolith (FastAPI + Pydantic v2)"]
        direction TB
        IAM["iam<br/>auth · MFA · jurisdiction tree"]
        INGEST["ingest<br/>DataConnector port"]
        COMPLAINTS["complaints<br/>canonical complaint schema"]
        ENTITY["entity<br/>resolution + dynamic risk"]
        GRAPH["graph<br/>money trail · link analysis"]
        GEO["geo<br/>H3 lattice · endpoints · zones"]
        FEATURES["features<br/>point-in-time feature store"]
        PREDICT["predict<br/>Tier 1/2/3 models"]
        CASES["cases<br/>lifecycle · interventions"]
        ALERTS["alerts<br/>alert engine · case grouping"]
        INTEL["intel<br/>outbound package · certification"]
        AUDIT["audit<br/>hash-chained events"]
        CORE["core<br/>config · errors · clock · enums"]
    end

    subgraph Data["Data layer — one PostgreSQL 16 instance, one schema per module (ADR-001)"]
        PG[("PostgreSQL 16<br/>+ PostGIS + h3-pg + TimescaleDB")]
        REDIS[("Redis 7<br/>Streams event bus · cache · rate limits (ADR-003)")]
    end

    subgraph Ports["Ports — synthetic in this repo, real behind the same interface in prod (§5, §7.3)"]
        DP["DataConnector<br/>NCRP / CFCFRMS / Samanvay"]
        IDP["IdentityProvider<br/>Keycloak / NIC SSO"]
        NP["NotificationProvider<br/>SMS / email / gov gateway"]
        SP["SecretProvider<br/>Vault / KMS / HSM"]
    end

    subgraph Sim["simulator — separate top-level package, never imported by the serving path (§19)"]
        SIMGEN["generators · typologies · scenarios"]
        TRUTH[("truth schema<br/>isolated role, no serving-path grant")]
    end

    WEB -->|"HTTPS /api/v1/*"| API
    DEMO -->|"HTTPS /api/v1/*"| API
    API -->|"outbound package<br/>(certified, expiring)"| BANK
    BANK -->|"response channel<br/>ACTED/NOT_ACTED/..."| INTEL

    INGEST --> DP
    IAM --> IDP
    ALERTS --> NP
    CORE --> SP

    IAM --> PG
    COMPLAINTS --> PG
    ENTITY --> PG
    GRAPH --> PG
    GEO --> PG
    FEATURES --> PG
    CASES --> PG
    ALERTS --> PG
    INTEL --> PG
    AUDIT --> PG

    INGEST --> REDIS
    ALERTS --> REDIS
    PREDICT --> REDIS

    SIMGEN -->|"seeded scenarios"| TRUTH
    SIMGEN -.->|"NEVER imported"| API

    INGEST --> COMPLAINTS
    COMPLAINTS --> ENTITY
    ENTITY --> GRAPH
    ENTITY --> FEATURES
    GEO --> FEATURES
    GRAPH --> FEATURES
    FEATURES --> PREDICT
    PREDICT --> ALERTS
    ALERTS --> CASES
    CASES --> INTEL
    CASES --> AUDIT
    INTEL --> AUDIT
    IAM --> AUDIT

    classDef module fill:#eef2ff,stroke:#4338ca,color:#1e1b4b;
    classDef data fill:#ecfdf5,stroke:#047857,color:#064e3b;
    classDef port fill:#fff7ed,stroke:#c2410c,color:#7c2d12;
    classDef sim fill:#fef2f2,stroke:#b91c1c,color:#7f1d1d;
    classDef client fill:#f5f3ff,stroke:#6d28d9,color:#3b0764;

    class IAM,INGEST,COMPLAINTS,ENTITY,GRAPH,GEO,FEATURES,PREDICT,CASES,ALERTS,INTEL,AUDIT,CORE module;
    class PG,REDIS data;
    class DP,IDP,NP,SP port;
    class SIMGEN,TRUTH sim;
    class WEB,DEMO,BANK client;
```

**Why a modular monolith and not microservices** (ADR-009): one deployable, one
transactionally-consistent store, module boundaries enforced by `import-linter` in CI
rather than by network hops. Any module can be lifted into its own service later
because the seam — a service interface, never a raw schema read — already exists and
is tested.

**Why the simulator is drawn outside the serving path**: `simulator/` is a separate
top-level Python package. Nothing under `apps/api/atlas` may import it. Its `truth`
schema carries no grant for any application role — this is leakage gate 2 (§19) and is
verified by a CI import-isolation test, not by convention.

---

## 2. Entity-relationship diagram

Drawn from the actual SQLAlchemy models in `apps/api/atlas/*/models.py`. One schema
per module (ADR-001, ADR-009); cross-schema reads go through the owning module's
service interface, never a direct join across schemas in application code — the lines
below show the *data* relationships, not permitted query paths.

```mermaid
erDiagram
    JURISDICTION ||--o{ JURISDICTION : "parent_id (tree)"
    JURISDICTION ||--o{ INVESTIGATOR : "assigned to"
    INVESTIGATOR ||--o{ REVOKED_TOKEN : "revokes"
    INVESTIGATOR ||--o{ BREAK_GLASS_GRANT : "requests"

    COMPLAINT }o--o{ CASE : "via CASE_COMPLAINT_LINK"
    CASE ||--o{ CASE_COMPLAINT_LINK : "covers"
    CASE ||--o{ INTERVENTION : "records"
    CASE }o--|| JURISDICTION : "owning_jurisdiction_id"

    CANONICAL_ENTITY ||--o{ ENTITY_RESOLUTION_DECISION : "merge/split history"
    CANONICAL_ENTITY ||--o{ ENTITY_RISK_SCORE : "versioned score"
    ENTITY_RESOLUTION_DECISION |o--o| ENTITY_RESOLUTION_DECISION : "reversed_by_id"

    CASH_OUT_ENDPOINT }o--o| GEOGRAPHIC_ZONE : "jurisdiction_id (logical)"
    GEOGRAPHIC_ZONE ||--o{ GEOGRAPHIC_ZONE : "parent_id (tree)"

    AUDIT_EVENT ||--o{ AUDIT_CHECKPOINT : "signed by"
    AUDIT_EVENT |o--o| AUDIT_EVENT : "previous_event_hash (chain)"
    CASE ||--o{ AUDIT_EVENT : "case_id"

    COMPLAINT {
        uuid id PK
        string public_ref UK
        enum typology
        numeric reported_amount
        datetime fraud_initiated_at
        datetime reported_at
        datetime observed_at "point-in-time boundary"
        uuid victim_jurisdiction_id FK
        string source_system
        enum classification
        bool is_synthetic
    }

    CASE {
        uuid id PK
        string public_ref UK
        enum status
        string title
        datetime opened_at
        datetime closed_at
        uuid assigned_to_id FK
        uuid owning_jurisdiction_id FK
        numeric amount_at_risk
        uuid grouping_id "network case grouping"
    }

    CASE_COMPLAINT_LINK {
        uuid id PK
        uuid case_id FK
        uuid complaint_id FK
        uuid owning_jurisdiction_id "per-complaint ownership"
    }

    INTERVENTION {
        uuid id PK
        uuid case_id FK
        enum intervention_type
        uuid performed_by_id FK
        datetime performed_at
        text reason "mandatory for NO_ACTION"
        jsonb prediction_snapshot "frozen at write time"
        string outcome
        numeric amount_recovered
    }

    CANONICAL_ENTITY {
        uuid id PK
        string public_ref UK
        string kind
        jsonb attributes
        datetime observed_at
    }

    ENTITY_RESOLUTION_DECISION {
        uuid id PK
        uuid canonical_entity_id FK
        string decision "merge/split"
        datetime decided_at "point-in-time correctness"
        string method
        float score
        uuid reversed_by_id FK
    }

    ENTITY_RISK_SCORE {
        uuid id PK
        uuid canonical_entity_id FK
        float score
        string model_version
        datetime valid_from
        jsonb contributing_factors "sentences, not raw coefficients"
    }

    CASH_OUT_ENDPOINT {
        uuid id PK
        string public_ref UK
        enum channel "ATM AEPS_BC BANK_BRANCH etc"
        string operator
        geometry geom "nullable meaningfully"
        string h3_r6
        string h3_r7
        string h3_r8
        uuid jurisdiction_id
        numeric cash_limit
    }

    GEOGRAPHIC_ZONE {
        uuid id PK
        string code UK
        string name
        string level
        geometry boundary
        uuid parent_id FK
    }

    JURISDICTION {
        uuid id PK
        string code UK
        string name
        enum level "NATIONAL..POLICE_STATION"
        uuid parent_id FK
    }

    INVESTIGATOR {
        uuid id PK
        string username UK
        string password_hash "argon2id, never recoverable"
        string mfa_secret "encrypted at rest"
        bool mfa_enrolled
        enum role
        uuid jurisdiction_id FK
        int failed_login_count
        datetime locked_until
    }

    REVOKED_TOKEN {
        uuid id PK
        string jti UK
        uuid investigator_id FK
        datetime expires_at
        string reason
    }

    BREAK_GLASS_GRANT {
        uuid id PK
        uuid investigator_id FK
        string justification
        uuid granted_by_id FK
        uuid notified_party_id FK
        datetime expires_at
        datetime revoked_at
    }

    AUDIT_EVENT {
        uuid id PK
        bigint sequence UK "gapless ordering"
        datetime occurred_at
        uuid actor_id
        string action
        string resource_type
        uuid case_id FK
        string result
        jsonb detail "never secrets or full PII"
        string previous_event_hash
        string event_hash
    }

    AUDIT_CHECKPOINT {
        uuid id PK
        bigint sequence UK
        string chain_head_hash
        string signature "signed outside the app DB"
        string key_id
        string algorithm
        uuid event_id FK
    }
```

**Notes that matter more than the boxes:**

- **`observed_at` vs `created_at`** (`ObservationBase` / `Observed` mixin): every
  observation-carrying table has both. `created_at` is when ATLAS wrote the row;
  `observed_at` is when the fact became knowable. Feature reads join as-of
  `observed_at`, never `created_at` — this is leakage gate 1 (§19.1).
- **`CanonicalEntity` is not a foreign key target from `Complaint`/`Case` directly in
  this phase** — Phase 1 (this migration) ships identity, audit and the entity/geo
  reference tables; the complaint↔entity and case↔entity linking tables land in Phase 4
  (entity resolution + money trail, §47) and are intentionally absent here so the
  diagram matches what exists, not what is planned.
- **`AuditEvent.previous_event_hash`** is a logical chain reference (hash, not a
  SQLAlchemy FK) by design — the chain must survive even if the referenced row were
  ever inaccessible, which is the opposite property a normal FK gives you.
- **Real account numbers are never a primary key**, anywhere — `public_ref` fields are
  synthetic, mutable business references; `id` is always an internal UUID (§5, §8).
