# Data Flow & Transaction Graph Model

Closes part of issue #9. Two diagrams: the **end-to-end data flow** from ingestion to
outcome (master spec §10–§28), and the **transaction graph model** used for money-trail
reconstruction and link analysis (§12, §14).

---

## 1. End-to-end data flow

This is the `Prediction → Alert → Case → Intelligence Package → Outcome` funnel (§1.1
of the reference-systems study, landed in spec §21.3/§25.1 as `ML-FUNNEL-001`), shown
as a sequence across the ingestion pipeline, the three prediction tiers, and the
bidirectional outbound-intelligence protocol (ADR-014).

```mermaid
sequenceDiagram
    autonumber
    participant Src as Source system<br/>(NCRP / bank / citizen)
    participant Ing as ingest<br/>DataConnector
    participant Cpl as complaints
    participant Ent as entity
    participant Geo as geo
    participant Grf as graph
    participant Feat as features<br/>(point-in-time store)
    participant Pred as predict<br/>(Tier 1/2/3)
    participant Alr as alerts
    participant Case as cases
    participant Intel as intel
    participant Bank as Bank / CFCFRMS
    participant Aud as audit

    Src->>Ing: raw complaint / transaction record
    Ing->>Ing: 1 schema validation
    Ing->>Ing: 2 normalisation → canonical schema
    Ing->>Ing: 3 data-quality checks
    Ing->>Ing: 4 dedup (idempotency key)
    Ing->>Ing: 5 provenance tagging
    Ing->>Ing: 6 classification (§30)
    Ing-->>Aud: 7 audit log
    Ing->>Ing: 8 stamp observed_at (§19)
    Note over Ing: malformed data rejected safely,<br/>counted, never silently dropped

    Ing->>Cpl: normalised Complaint
    Cpl->>Ent: identifiers for resolution
    Ent->>Ent: block → match → cluster<br/>into CanonicalEntity
    Ent-->>Aud: EntityResolutionDecision recorded

    Cpl->>Grf: accounts, endpoints, transfers
    Grf->>Grf: build money-trail edges<br/>(time-respecting traversal)

    Ent->>Feat: entity risk, as-of observed_at
    Geo->>Feat: H3 cell features, endpoint history
    Grf->>Feat: graph features (degree, centrality, motifs)
    Note over Feat: as-of join only — a merge made<br/>today cannot leak into last week's read (§19.3)

    Feat->>Pred: point-in-time feature snapshot
    Pred->>Pred: Tier 1 zone forecast (always)
    Pred->>Pred: Tier 3 mule/endpoint risk (always)
    Pred->>Pred: Tier 2 case-conditioned ranking<br/>(recall ladder → LambdaMART → hazard window)
    Pred-->>Aud: prediction logged with model_version

    Pred->>Alr: candidates + evidence_sufficiency
    Alr->>Alr: threshold + network case grouping (§27.1)
    Alr-->>Aud: alert raised
    Alr->>Case: case opened / merged into grouping
    Case-->>Aud: case lifecycle events

    Case->>Intel: intervention decided → outbound package
    Intel->>Intel: attach certification block<br/>(officer, jurisdiction, legal basis, expiry)
    Intel->>Bank: certified, time-bounded package
    Intel-->>Aud: package issuance logged

    Bank-->>Intel: response — ACTED / ALREADY_ACTIONED /<br/>NOT_ACTED / FALSE_POSITIVE / OUT_OF_SCOPE
    Intel->>Case: outcome recorded (amount_recovered, lead time)
    Intel-->>Aud: response logged

    Case-->>Alr: outcome feeds funnel metrics
    Note over Alr,Intel: every hop measured —<br/>a prediction that never became an alert,<br/>an alert never opened, a case with no<br/>intervention are each a nameable failure
```

**Why `observed_at` gates every read into `features`**: this is the mechanism behind
leakage gate 1. A feature pipeline that joined on `created_at` (when a row happened to
be written) instead of `observed_at` (when the fact became knowable) would let a model
see the future during training — a bug that produces artificially high offline
accuracy and then fails in production, silently, because nothing about the code looks
wrong.

**Why the funnel is drawn as one continuous flow**: §1.1 of the reference-systems
study (`docs/architecture/reference-systems-and-design.md`) makes conversion at every
hop — not model accuracy alone — the primary measured quantity. A prediction that never
becomes an alert, an alert never opened, and a case that produces no intervention are
three distinct, individually nameable failures, and this diagram is what "measured at
every hop" refers to concretely.

---

## 2. Transaction graph model

The money-trail graph (§12, §14). Built on recursive CTEs over PostgreSQL rather than
a separate graph database (ADR-002) — trails are 3–8 hops and bounded, so a second,
transactionally-inconsistent datastore is not worth the operational cost at this scale.

```mermaid
flowchart LR
    subgraph Financial["Financial nodes"]
        VIC["Victim<br/>(Account)"]
        A1["Account A"]
        A2["Account B<br/>(mule)"]
        A3["Account C<br/>(mule)"]
        MER["Merchant"]
        WAL["Wallet"]
        EP["CashOutEndpoint<br/>ATM / AEPS_BC / ..."]
        FI["FinancialInstitution"]
        ZONE["GeographicZone"]
    end

    subgraph Artefact["Investigative artefact nodes (§14.1 — the highest-leverage change)"]
        CPL["Complaint"]
        CS["Case"]
        AL["Alert"]
        PR["Prediction"]
        IV["Intervention"]
    end

    VIC -->|"TRANSFERRED_TO<br/>amount, ts, channel"| A1
    A1 -->|"TRANSFERRED_TO"| A2
    A2 -->|"TRANSFERRED_TO"| A3
    A3 -->|"WITHDREW_AT"| EP
    A2 -->|"TRANSFERRED_TO"| MER
    MER -->|"WITHDREW_AT"| EP
    A1 -.->|"SHARES_DEVICE"| A2
    A2 -.->|"SHARES_BENEFICIARY"| A3
    EP -->|"HOLDS"| FI
    EP -->|"located in"| ZONE
    A2 -.->|"OWNS"| WAL

    CPL -->|"SUBJECT_OF"| VIC
    CS -->|"RELATED_CASE"| CPL
    AL -->|"LINKED_ALERT"| CS
    PR -->|"PREDICTED_FOR"| EP
    IV -->|"ACTED_ON"| EP
    AL -.->|"LINKED_ALERT<br/>(another state, 4mo earlier)"| CS

    classDef money fill:#ecfeff,stroke:#0e7490,color:#083344;
    classDef mule fill:#fef3c7,stroke:#b45309,color:#78350f;
    classDef artefact fill:#f5f3ff,stroke:#6d28d9,color:#3b0764;

    class VIC,A1,MER,WAL,FI,ZONE money;
    class A2,A3,EP mule;
    class CPL,CS,AL,PR,IV artefact;
```

**Edge semantics that are load-bearing, not decorative:**

- **Edges are time-respecting.** A path may only be traversed forward in time —
  `A1 → A2` at 10:02 cannot connect to an `A2 → A3` edge at 09:58. The shortest
  *time-respecting* path is a different (and correct) question from the graph-theoretic
  shortest path.
- **Every edge carries amount · timestamp · type · source · destination · channel ·
  confidence · provenance.** An edge with no provenance cannot appear in an outbound
  intelligence package (ADR-014) or an evidence tab (§25).
- **Artefact nodes (`Complaint`, `Case`, `Alert`, `Prediction`, `Intervention`) are
  authorization-scoped like every other node** (§29). Traversing from your own
  complaint to a linked case in another jurisdiction returns the *existence* and *type*
  of the link — never that case's contents, which require separate authorization.
- **Artefact edges never feed prediction features.** A `Prediction` node linked to a
  `Case` is investigative context for a human. Letting it into the feature pipeline
  would let a model traverse to its own prior output and manufacture confidence from
  self-agreement — this is leakage gate 5, discovered specifically because artefact
  nodes were added (§8, "two leakage gates we did not expect").
- **No single edge or motif labels behaviour as criminal.** Structuring, fan-in/fan-out
  and rapid movement are also how legitimate businesses move cash; every suspicion
  surfaced to an investigator is a weighted combination with a stated contribution, not
  a single triggered rule.
