# ATLAS — Master Specification

**Predictive cash-out intelligence for cybercrime complaints**
Smart India Hackathon 2026 · Problem Statement **SIH26184**
Ministry of Home Affairs · Indian Cyber Crime Coordination Centre (I4C), CIS Division
Theme: Blockchain & Cybersecurity · Category: Software

Status: **authoritative**. Supersedes `docs/archive/original-brief.md`.
Official problem text: `docs/problem-statement/SIH26184-official.md` (verbatim — start there).
What already exists at I4C: `docs/problem-statement/incumbent-landscape.md` (read before pitching).

---

## 0. How to use this document

You are operating as the principal engineer on a system that is, by intent, government-grade. Read
§1–§3 before writing a line of code; they define what "correct" means here and they are the sections
that most projects on this problem statement will get wrong.

Three standing rules govern everything below.

**Rule 1 — The official text wins.** Where this spec and `SIH26184-official.md` disagree, the official
text wins and this spec is wrong and must be fixed. The predecessor document was written from a
paraphrase and silently lost three binding requirements. Never paraphrase the PS again.

**Rule 2 — Honest beats impressive.** A measured, modest number that is real is worth more than a
large number that is manufactured. Every metric this system reports must survive a hostile question
about how it was computed. §21 is not negotiable.

**Rule 3 — Make decisions, document them, move.** Where a choice is genuinely ambiguous and getting it
wrong would materially change the architecture, pick the least risky reversible option, write an ADR,
and continue. Do not stall on decisions that an ADR can carry.

---

## 1. Mission

### 1.1 The intelligence question

Everything in this system exists to answer one question defensibly:

> **Given only the information available right now, where is stolen money most likely to be taken out
> as cash next, within what time window, with what confidence, and on what evidence?**

And to answer, afterwards, the question that makes the first one trustworthy:

> **Was it right? By how much? How much warning did we actually give?**

### 1.2 The workflow

```
Cybercrime complaint (NCRP / 1930 / CFCFRMS)
        ↓
Normalisation into canonical schema
        ↓
Entity & transaction extraction
        ↓
Entity resolution → canonical entities + dynamic entity risk
        ↓
Money-flow reconstruction (the trail)
        ↓
Behavioural, temporal, graph and geospatial features (point-in-time correct)
        ↓
┌──────────────────┬───────────────────────┬──────────────────────┐
│ Tier 1           │ Tier 2                │ Tier 3               │
│ Zone risk        │ Case-conditioned      │ Mule account &       │
│ forecast         │ cash-out ranking      │ endpoint risk        │
└──────────────────┴───────────────────────┴──────────────────────┘
        ↓
Ranked candidates + probability + confidence + time window + explanation
        ↓
┌────────────────┬───────────────────┬────────────────────────────┐
│ GIS heatmap    │ Investigator case │ Outbound intelligence      │
│ + treemap      │ + typed action    │ → banks (CFCFRMS shape)    │
│                │ + grouping        │ → other jurisdictions      │
└────────────────┴───────────────────┴────────────────────────────┘
        ↓                                          │ certified, scoped, expiring
Outcome recorded / ground truth  ◄─────────────────┘
        ↓                          response: ACTED / ALREADY_ACTIONED /
        ↓                                    NOT_ACTED / FALSE_POSITIVE
Evaluation, calibration, drift, funnel conversion, investigative utility
        ↓
Outcome digest + typology advisory  ──► back to banks and jurisdictions
```

The loop at the bottom is the point. Intelligence that goes out and never comes back cannot be
evaluated, and a system that cannot be evaluated cannot be trusted (§21.4, §28.4).

### 1.3 What "success" means

Not a diagram. This:

> An investigator receives a cybercrime complaint, understands the money trail, receives a defensible
> prediction of likely cash-out locations, understands **why** those locations were predicted, acts on
> it, sends usable intelligence to the relevant bank and the relevant jurisdiction, and can later
> verify whether the prediction was correct.

Build for **correctness first, security second, explainability third, scalability fourth, polish last.**

---

## 2. Honest uncertainty — non-negotiable language rules

This system produces probabilistic intelligence to support human decisions. It is **not** an
autonomous law-enforcement decision maker, and it must never present itself as one.

**Required vocabulary:** predicted likelihood · confidence · ranked candidates · risk score ·
supporting evidence · contributing factors · evidence sufficiency · lead time.

**Forbidden, in code, UI, logs, docs and pitch:** "100% fraudster" · "guaranteed cash-out" ·
"certain criminal" · "AI proved the suspect" · "the system caught" · any phrasing that converts a
ranked candidate into an accusation about a person.

Three consequences that are easy to forget:

1. **Risk attaches to predicted activity, never to a place or a population.** A high-risk cell means
   *"fraud-linked cash-out is forecast here in this window under model M with evidence E"*. It does
   not mean the neighbourhood is criminal. §22.2 makes this testable, not just stated.
2. **A low-evidence prediction must not look like a high-evidence one.** Confidence and
   `evidence_sufficiency` are part of the payload and part of the UI, always (§16.2).
3. **The system never claims certainty it does not have** — including in the demo, especially in the
   demo, and above all when a judge is watching and a bolder claim would land better.

---

## 3. Non-goals — what ATLAS explicitly does not do

Stating this protects the project under questioning. Volunteer these boundaries before a judge finds
them.

ATLAS does **not**:

- identify, name, profile or score **individual citizens** as criminals;
- use protected or proxy-protected attributes — caste, religion, language, gender — as features (§22.2,
  enforced by test, not by promise);
- replace investigation, seizure, arrest or any judicial process;
- assert **legal** chain of custody. It provides tamper-**evident** audit and evidence integrity, which
  is a weaker and more honest claim (§32);
- connect to any real bank, NCRP, CFCFRMS or Samanvay system in this repository. All production
  connectors are ports with synthetic implementations (§10);
- claim any government certification, empanelment, accreditation or compliance it has not obtained;
- process real citizen PII, real transactions or real intelligence anywhere in this repository (§5);
- predict crimes that have not been reported. ATLAS forecasts the **cash-out leg of reported financial
  fraud**. It is not general predictive policing, and it must never be described as such.

---

## 4. Architectural principles

Security by design · privacy by design · zero trust · least privilege · defence in depth ·
explainable AI · human in the loop · evidence traceability · auditability · reproducibility ·
data minimisation · secure defaults · **fail closed on privileged operations** · explicit uncertainty ·
separation of duties · immutable and auditable security events · no unrestricted AI autonomy.

Two additions the predecessor lacked, both load-bearing here:

- **Point-in-time correctness.** Any system that predicts the future must be structurally incapable of
  reading it. This is an architectural property, not a code review item (§19).
- **Intervention awareness.** A deployed prediction changes the world it predicts. A system that
  ignores this degrades silently and confidently (§22.1).

### 4.1 Modular monolith — decided

One deployable API. Hard internal module boundaries. This resolves the predecessor's direct
contradiction, which forbade premature microservices in one section and then mandated twelve service
directories in the next.

- One Python package `atlas`, one module per bounded context.
- **One PostgreSQL schema per module.** Cross-module reads go through the owning module's service
  interface, never by reaching into another schema.
- The dependency graph is **enforced in CI** by `import-linter`, so boundaries are real rather than
  aspirational.
- Any module can later be lifted into its own service, because the seam already exists and is tested.

Modules: `ingest` · `complaints` · `entity` · `graph` · `features` · `predict` · `geo` · `cases` ·
`alerts` · `intel` · `audit` · `iam` · `core`.

`simulator` is a **separate top-level package**. Nothing in the serving path may import it (§19).

See `docs/adr/ADR-009-modular-monolith.md`.

---

## 5. Environments and the public-repository boundary

Three environments, and the boundary between them is a security control.

| | **A. Public repo / hackathon** | **B. Controlled staging** | **C. Government production** |
|---|---|---|---|
| Data | Synthetic only | Realistic synthetic | Authorised real sources |
| Identity | Built-in provider | Staging IdP | Government IdP (NIC SSO / departmental) |
| Secrets | `.env.example` only | Vault/KMS | Government-controlled HSM/KMS |
| Connectors | Synthetic implementations | Mock + contract tests | Approved connectors under legal authority |
| Notifications | Mock provider | Sandbox gateways | Government gateway |

**This repository contains only:** source, architecture, infrastructure definitions, synthetic
datasets, the synthetic-data generator, reproducible ML experiments, documentation, tests, security
controls, and mock connectors.

**This repository must never contain:** real financial data · real citizen PII · bank or government
credentials · production API keys · secrets · private certificates · real law-enforcement intelligence ·
real account numbers · real transaction histories.

Enforced, not merely asked for: `.gitignore`, `.env.example`, pre-commit hooks, `gitleaks` in CI on
**full history**, and `PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md` at the repository root stating what is
safe to publish, what stays private, and how production connectors are separated.

Real account numbers are never primary keys, anywhere, in any environment. Synthetic identifiers only.

---

## 6. Repository structure

```
/
├── apps/
│   ├── api/atlas/          # the modular monolith, one package per module
│   │   ├── core/           # config, errors, clock, correlation, base types
│   │   ├── iam/ ingest/ complaints/ entity/ graph/ features/
│   │   ├── predict/ geo/ cases/ alerts/ intel/ audit/
│   ├── web/                # Next.js investigator + admin interface
│   └── demo-console/       # the reproducible demo driver
├── simulator/              # NOT importable by the serving path
│   ├── generators/         # population, geography, endpoints, normal behaviour
│   ├── typologies/         # one generator per NCRP fraud category
│   ├── scenarios/          # composed, seeded, reproducible scenarios
│   ├── truth/              # hidden ground truth — isolated schema, isolated role
│   └── validation/         # realism gates
├── ml/
│   ├── datasets/ feature_engineering/ training/ models/ explainability/ experiments/
│   └── evaluation/harness/ # PAI, PEI, PEI*, Recall@K, calibration, lead time
├── data/{schemas,synthetic,seed}/
├── infra/{docker,observability,security,kubernetes}/
├── docs/
│   ├── problem-statement/  # official text, traceability, incumbent landscape
│   ├── adr/ architecture/ security/ ml/ data-governance/ api/ deployment/ demo/
│   └── archive/            # superseded documents, clearly marked
├── tests/{unit,integration,security,ml,leakage,fairness,performance,e2e}/
├── submission/             # SIH deck, demo run-sheet, pitch, judge Q&A
├── reports/                # generated evaluation reports, git-sha stamped
├── scripts/  .github/workflows/
├── docker-compose.yml  Makefile
├── README.md  SECURITY.md  CONTRIBUTING.md  CODEOWNERS  LICENSE
└── PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md
```

---

## 7. Technology — decided and tiered

Every technology must have a documented architectural reason. Nothing is included because it sounds
impressive. Where the predecessor left a choice open ("Neo4j OR PostgreSQL"), this spec closes it.

### 7.1 Core — must run from `docker compose up` on a laptop, offline

| Layer | Choice | Reason |
|---|---|---|
| Database | **PostgreSQL 16 + PostGIS + h3-pg + TimescaleDB** | One store, transactionally consistent. PostGIS for geometry, H3 for the prediction lattice, Timescale for time-partitioned transactions and features. |
| Graph | **Recursive CTEs + materialised adjacency** in PostgreSQL | Money trails are 3–8 hops and bounded. ADR-002. |
| Cache / queue / rate limit | **Redis** (incl. Streams as the event bus) | ADR-003. |
| API | **FastAPI + Pydantic v2 + SQLAlchemy 2.0 (async) + Alembic** | Strong typing at the boundary; schema validation is a security control here, not a convenience. |
| Web | **Next.js + TypeScript + Tailwind** | |
| Map | **MapLibre GL + deck.gl** | deck.gl renders large H3 layers at interactive speed; MapLibre is open and self-hostable, which matters for an air-gapped deployment story. |
| Graph UI | **Cytoscape.js** | Typed nodes, labelled edges, incremental expansion and deterministic layouts — the exact requirements of §14.1–14.2. A general charting library cannot do labelled progressive graph expansion well. |
| Charts | **Apache ECharts**, including **treemap** | The map answers *where*; the treemap answers *how much, by jurisdiction* (§24). A choropleth hides small, high-volume districts, which is the failure mode that matters here. |
| ML | **scikit-learn, LightGBM/XGBoost, SHAP, lifelines** | Tabular + ranking + survival. Deep learning only if §20 proves it earns its place. |
| Model tracking | File-based registry with signed manifests | Sufficient, reproducible, no extra service. |

### 7.2 Optional compose profiles

OpenTelemetry + Prometheus + Grafana (`--profile observability`) · MinIO (`--profile storage`) ·
Keycloak (`--profile keycloak`) · Apache AGE (`--profile graph`).

The core demo must never depend on an optional profile.

### 7.3 Ports with documented adapters — designed, not built now

`EventBus` → Kafka/Redpanda · `IdentityProvider` → Keycloak / NIC SSO · `NotificationProvider` →
SMS / email / government gateway · `DataConnector` → NCRP / CFCFRMS / Samanvay · `SecretProvider` →
Vault / KMS / HSM · `ObjectStore` → S3.

### 7.4 Two decisions worth defending out loud

**No Neo4j.** (ADR-002) Trails are shallow and bounded; a second datastore would cost transactional
consistency with case data and add an operational failure mode, in exchange for traversal performance
we do not need at this scale. The `graph` module's interface is the seam if that ever changes.

**No Kafka.** (ADR-003) 8,000 complaints/day is ~0.1 events/sec mean. Even at 5× headroom with bursty
peaks this is comfortably within Redis Streams with consumer groups. Kafka is roughly three orders of
magnitude of over-provisioning, and it would not fit on the demo laptop. The `EventBus` port keeps the
migration honest and cheap. **Say this to judges rather than hiding it** — "we sized the transport to
the actual load and kept the seam" is a stronger answer than an unused Kafka container.

---

## 8. Domain model

Entities: `Complaint` `Case` `Victim` `Account` `FinancialInstitution` `Transaction` `TransactionChain`
`Entity` `MuleAccountAssessment` `CashOutEndpoint` `Merchant` `Wallet` `Device` `NetworkIndicator`
`GeographicZone` `H3Cell` `Jurisdiction` `RiskScore` `Prediction` `PredictionCandidate`
`TimeWindowForecast` `Alert` `Investigator` `Evidence` `EvidenceReference` `Intervention`
`InvestigationAction` `ModelVersion` `PredictionOutcome` `AuditEvent` `IntelligencePackage`
`CanonicalEntity` `EntityResolutionDecision` `EntityRiskScore` `BCAgent` `CaseGrouping`
`PackageCertification` `PackageResponse` `OutcomeDigest` `TypologyAdvisory` `FunnelEvent`.

Every sensitive entity carries: internal immutable identifier · created/updated timestamps ·
**`observed_at`** (when this fact became knowable — §19) · source and provenance metadata ·
classification (§30) · access policy · audit metadata.

### 8.1 `CashOutEndpoint` — the central object

The predecessor modelled the target as "an ATM". That is wrong for India in 2026 and it would make the
system look dated to exactly the people evaluating it. The prediction target is a **cash-out endpoint**,
which is any point where value leaves the traceable banking system:

| Channel | Notes |
|---|---|
| `ATM` | Classic. Still material — Nuh district alone saw ~₹18 cr moved across 1,400+ ATM IDs. |
| `AEPS_BC` | **Aadhaar-enabled Payment System via Business Correspondent / micro-ATM.** Now a dominant vector: RBI recorded a large spike in AePS fraud complaints with cumulative losses in the ₹1,000 cr+ range, driven by unregulated BC-outlet proliferation and biometric cloning. Modelling this is the single most India-specific thing in the system. |
| `BANK_BRANCH` | Counter withdrawal, cheque. |
| `POS_CASHBACK` | Merchant cash-back. |
| `MERCHANT_QR` | UPI-to-merchant, settled and withdrawn by a colluding merchant. |
| `PREPAID_GIFT` | Gift/prepaid card purchase and resale. |
| `CRYPTO_P2P` | P2P off-ramp. Endpoint is logical, not geographic — modelled explicitly so its lack of coordinates is a first-class fact rather than a null. |

Every endpoint carries: stable synthetic ID · channel · operator/FI · geometry (nullable, and nullable
*meaningfully*) · H3 cell at each resolution · operating hours · cash-limit profile · historical
fraud-linked utilisation.

**Consequence for the model:** channel is a first-class feature and a first-class filter. A digital
arrest scam and a UPI collect-request fraud cash out through different channels at different speeds,
and the system must be able to say so.

### 8.2 Jurisdiction

Federated by design, because the PS says "at the state and local levels, coordinated by I4C".
`Jurisdiction` is a tree: National → State → Range/Zone → District → Police Station. It drives
authorization (§29), routing (§28) and the disparity report (§22.2). A cell belongs to exactly one
police-station jurisdiction; an intelligence package is addressed to a jurisdiction node.

---

## 9. Fraud typologies

Generic "fraud" is not enough — the money-movement and cash-out signatures genuinely differ, and the
model exploits that difference. Model these NCRP-recognisable categories, each as its own generator
(§23) and each as a feature:

| Typology | Money movement | Typical cash-out signature |
|---|---|---|
| Digital arrest | Large single/few transfers under sustained coercion | Fast, high-value, often multi-city; RTGS/NEFT then rapid layering |
| Investment / trading scam | Repeated victim-initiated transfers over days–weeks | Slower, aggregation-first, higher-value endpoints |
| UPI collect-request / QR fraud | Many small transfers, high frequency | Fast, small, dispersed; merchant QR and AePS heavy |
| Customer-care impersonation | One-to-few, remote-access assisted | Fast, ATM/AePS, near the mule's home district |
| Loan-app extortion | Small repeated debits | Wallet/merchant heavy, dispersed |
| Job / task fraud | Small onboarding payments, many victims → few accounts | Strong fan-in, then structured withdrawal |
| Sextortion | Small, urgent, single | Wallet/UPI, fast |

Each typology defines: victim behaviour, layering depth, amount distribution, inter-hop delay
distribution, preferred channels, and geographic dispersion. These are **assumptions**, they are
documented as assumptions in `docs/ml/typology-assumptions.md`, and they are calibrated against
published aggregate statistics wherever such statistics exist — never invented and then presented as
fact.

---

## 10. Data ingestion

### 10.1 Connector architecture

```
DataConnector (port)
  ├── validate()      # schema + business rules, fail closed
  ├── ingest()        # pull/push, idempotent, resumable
  ├── normalize()     # → canonical schema
  ├── emit_events()   # onto the EventBus
  └── health_check()
```

Public implementations, synthetic only: `SyntheticComplaintConnector` ·
`SyntheticTransactionConnector` · `SyntheticEndpointRegistryConnector` · `SyntheticCaseConnector` ·
`SyntheticCFCFRMSConnector`.

Production connectors (NCRP, CFCFRMS, Samanvay) are **specified as contracts with contract tests, and
not implemented here**. The contract test is the deliverable; the integration is a deployment activity
under legal authority.

### 10.2 Mandatory pipeline

Every record, without exception:

1. schema validation → 2. normalisation → 3. data-quality checks → 4. deduplication (idempotency key)
→ 5. provenance tagging → 6. classification (§30) → 7. audit log → 8. `observed_at` stamping (§19).

Malformed data is rejected safely, counted, and surfaced on the data-quality dashboard. It is never
silently dropped and never partially applied. Ingestion is **idempotent by construction**: replaying
the same source event produces no duplicate state and no duplicate alert.

---

## 11. Complaint processing

Canonical complaint fields: complaint ID · reported-at and occurred-at timestamps · fraud category ·
reported amount · victim jurisdiction · beneficiary information where known · transaction references ·
account identifiers · narrative text where available · evidence metadata · **`observed_at`**.

Where narrative text exists, NLP may extract structured signals — under hard constraints:

- **An LLM is never the authoritative source of a financial fact.** Amounts, account numbers, IFSC
  codes, timestamps and identifiers come from structured fields, always.
- LLM/NLP output is probabilistic, schema-validated, traceable to the span it came from, and strictly
  secondary to structured data.
- Untrusted narrative text is isolated before it reaches any model (§34). A complaint narrative is an
  attacker-controlled string.

**Golden hour is a first-class concept.** Every complaint carries the elapsed time from estimated fraud
initiation to ingestion, because that number determines whether any prediction can still be actioned.
It is displayed, it is a feature, and it bounds the reported lead time (§21).

---

## 12. Transaction intelligence and the money trail

Nodes: accounts · wallets · entities · merchants · cash-out endpoints · financial institutions ·
geographic zones. Edges: transfers · withdrawals · deposits · merchant payments · wallet transfers ·
account relationships.

Every edge carries amount · timestamp · type · source · destination · location where legitimately
available · channel · confidence and provenance.

Supported analysis: money-flow reconstruction · multi-hop traversal · temporal ordering (an edge may
only be traversed forward in time) · velocity · amount splitting (structuring) · rapid movement ·
fan-in / fan-out · unusual geographic movement · repeated cash-out behaviour.

**No single feature ever labels behaviour as criminal.** Structuring is also how legitimate businesses
manage cash. Every suspicion is a weighted combination with a stated contribution (§20.2).

---

## 13. Entity intelligence

The predecessor treated entity resolution as plumbing — a helper that de-duplicates accounts on the
way to the graph. Studying mature financial-crime platforms makes clear that this is backwards:
**entity resolution is the backbone, and risk is a property of the resolved entity.** Everything
downstream — the money trail, the graph, all three prediction tiers, and every alert — is only as good
as the entities it is reasoning about. A system that cannot tell that two accounts belong to the same
actor cannot detect a mule network.

This section therefore describes a first-class subsystem (`atlas.entity`), not a utility.

### 13.1 Resolution

Resolve observed identifiers into stable **canonical entities**:

- **Blocking** — cheap candidate keys (normalised phone, device fingerprint, KYC district, IFSC +
  account suffix) to avoid all-pairs comparison at national scale.
- **Matching** — scored comparison over the blocked candidates, with a documented threshold.
- **Clustering** — transitive closure into a canonical entity, with **split/merge history**.

Two rules that are easy to get wrong and expensive to fix:

1. **Resolution decisions are versioned and reversible.** An entity merge is a hypothesis. When it is
   wrong it must be splittable without destroying the case, alert and audit records attached to it.
2. **Resolution is point-in-time correct.** A merge made today must not retroactively change what a
   prediction made last week could see (§19). Feature reads join against the entity graph *as it stood
   at `as_of`*, not as it stands now. This is a leakage vector that is very easy to miss, because the
   entity table looks like reference data rather than observation data. It is not.

### 13.2 Dynamic entity risk

**Every entity type carries a risk score, not just mule accounts.** This generalises what was
previously a single mule classifier:

| Entity | Risk question |
|---|---|
| `Account` | Is this behaving like a mule, before it is confirmed as one? |
| `CashOutEndpoint` | Is this ATM/BC/merchant recurring cash-out infrastructure? |
| `BCAgent` | Business-correspondent-specific: churn, unusual AePS volume, biometric-retry patterns |
| `Device` / `NetworkIndicator` | Shared across otherwise unlinked accounts? |
| `Beneficiary` | Appears across multiple unrelated complaints? |
| `Merchant` | Settlement pattern inconsistent with stated business? |

Each score is:

- **versioned with history**, so "when did this endpoint become risky?" is answerable — which is the
  question an investigator actually asks;
- **explained**, carrying its contributing factors like any other prediction (§20.2);
- **point-in-time queryable**, so a score can be reconstructed as of any past instant;
- **decayed**, so risk ages out rather than accumulating permanently. An entity that was risky in 2024
  and quiet since is not risky today, and a system that cannot forget will eventually flag everything.

Risk attaches to an entity's **observed behaviour**, never to who a person is (§3). No entity risk
score may be derived from a protected attribute or a proxy for one (§22.2).

### 13.3 Relationship to the prediction tiers

Entity risk **is** Tier 3 (§15.3). Promoting it here is not duplication — it says that Tier 3 is not a
bolt-on classifier but the shared substrate that Tiers 1 and 2 consume as features, and that the
outbound bank package (§28) is built from.

---

## 14. Graph intelligence

Features: degree · weighted degree · PageRank-style centrality · community detection ·
connected components · temporal paths · fan-in/fan-out ratios · shortest *time-respecting* money paths ·
suspicious cluster detection · repeated transaction motifs.

### 14.1 The graph contains investigative artefacts, not only financial objects

The predecessor's graph held accounts, wallets, merchants, endpoints and institutions — the money. That
is half a graph.

**`Complaint`, `Case`, `Alert`, `Prediction` and `Intervention` are also node types.** This is the
single highest-leverage change to the graph model, because it lets an investigator see that *this
complaint connects to a case opened in another state four months ago through a shared endpoint* —
which is precisely the cross-jurisdiction linkage the PS asks for, expressed as a traversal rather
than as a report.

Node types: `Account` `Wallet` `Entity` `Merchant` `CashOutEndpoint` `BCAgent` `FinancialInstitution`
`Device` `NetworkIndicator` `GeographicZone` — **plus** `Complaint` `Case` `Alert` `Prediction`
`Intervention`.

Edge types are **closed, documented and labelled** — `TRANSFERRED_TO` `WITHDREW_AT` `OWNS` `HOLDS`
`SUBJECT_OF` `LINKED_ALERT` `RELATED_CASE` `PREDICTED_FOR` `ACTED_ON` `SHARES_DEVICE`
`SHARES_BENEFICIARY`. An unlabelled edge is not an intelligence product; it is a picture of a
hairball.

Two constraints that keep this honest:

- **Artefact nodes are authorization-scoped like everything else.** Seeing that your complaint links
  to another case must not leak that case's contents across a jurisdiction boundary (§29). The
  traversal returns the *existence* of a link and its type; the contents require authorization.
- **Artefact edges never feed prediction features.** A `Prediction` node linked to a `Case` is
  investigative context. Allowing it into the feature pipeline would let the model read its own prior
  output and manufacture confidence (§19, §22.1).

### 14.2 Rendering


**Money Trail explorer** — the investigator-facing view:

```
Victim → Account A → Account B → Account C → Cash-out endpoint
```

The investigator can expand nodes, inspect transactions, filter by time/amount/entity/channel,
highlight candidate paths, and open supporting evidence. Every path shown carries its provenance and
its confidence. A reconstructed trail is a hypothesis with evidence attached, and the UI must say so.

**Progressive disclosure is mandatory.** The view opens at the case's own subgraph. Expansion is
explicit, per node, and capped. Colour encodes node type; saturation encodes risk; **never both on the
same channel**. A view that renders fifty thousand nodes has told the investigator nothing.

---

## 15. The predictive analytics engine — three tiers

This is the core of ATLAS and the section most likely to be got wrong.

The predecessor specified a single task: given a live case, rank candidate cash-out locations. That
task is real and valuable, but as the *only* task it fails, for a reason that does not show up until
real data arrives: **most complaints name a mule account the system has never seen.** A single-task
system cold-starts to nothing and produces a confident-looking prediction from no evidence — precisely
the failure §2 forbids.

So: three tiers, each independently evaluable, each honest about what it needs.

### 15.1 Tier 1 — Zone risk forecast

*Always available. Powers the heatmap. The honest backbone.*

- **Unit:** H3 cell. Resolution is **chosen empirically by sweeping the PAI curve** (§21), not asserted.
  Expect r7 (~5.2 km²) for operational tasking, r8 (~0.74 km²) for urban drill-down, r6 for state view.
  The choice is recorded in ADR-011 with the sweep that justified it.
- **Target:** `P(≥1 fraud-linked cash-out in cell c during [T, T+Δ])`, for Δ ∈ {6h, 24h, 72h}.
- **Model:** self-exciting point process (Hawkes) baseline → LightGBM over cell × time features.
  Fraud cash-out is strongly self-exciting — a burned endpoint gets reused, and the Nuh pattern is
  exactly this — so a Hawkes baseline is not a strawman, it is a genuinely strong competitor and must
  be beaten honestly.
- **No cold start.** Tier 1 answers even with zero case-specific evidence.

### 15.2 Tier 2 — Case-conditioned cash-out ranking

*The headline capability. Answers "which endpoint, when" for a live case.*

Two stages, because one stage cannot do both recall and precision:

1. **Recall — candidate generation** (§16). Produces a bounded candidate set with a stated
   `evidence_sufficiency` band.
2. **Precision — learning to rank.** LambdaMART over (case, candidate) features, producing a ranked
   list with calibrated scores.

Paired with a **discrete-time hazard model** producing the time window. This closes a real gap: the
predecessor's output schema contained `predicted_time_window` with no model behind it, which would have
forced the field to be fabricated — something the same document explicitly forbade. A predicted window
must come from a fitted survival model or it must not be emitted.

### 15.3 Tier 3 — Mule account and endpoint risk

*Preventive. Feeds Tiers 1 and 2. The output banks actually act on.*

- **Account mule-likelihood**: is this account behaving like a mule, before it is confirmed as one?
- **Endpoint cash-out-infrastructure score**: is this ATM/BC agent a recurring cash-out point? The Nuh
  pattern — a small number of endpoints absorbing disproportionate fraud volume — is learnable and is
  directly actionable by both LEAs and banks.

**Tier 3 is what closes the CFCFRMS requirement** (§28). "Prioritise these accounts for freeze" and
"watch these endpoints" are the outputs a bank can act on inside the golden hour.

### 15.4 How the tiers are reported

Separately. Always. **The three tiers are never averaged into one flattering number.** Tier 1 always
works; Tier 2 works when evidence supports it and says so when it does not; Tier 3 is the multiplier.

### 15.5 Prediction output schema

```jsonc
{
  "prediction_id": "...",
  "case_id": "...",
  "as_of": "2026-09-01T10:22:31Z",        // point-in-time boundary; nothing after this was read
  "tier": 2,
  "evidence_sufficiency": "MODERATE",      // STRONG | MODERATE | WEAK | INSUFFICIENT
  "candidates": [
    {
      "rank": 1,
      "endpoint_id": "EP-SYN-000142",
      "channel": "AEPS_BC",
      "h3_cell": "8761a2b3fffffff",
      "probability": 0.31,                 // calibrated; see §21
      "confidence": "MEDIUM",
      "predicted_window": {"start": "...", "end": "...", "hazard_model_version": "..."},
      "contributing_factors": [
        {"feature": "endpoint_prior_fraud_utilisation", "contribution": 0.14, "direction": "+"},
        {"feature": "hops_since_victim",               "contribution": 0.09, "direction": "+"}
      ]
    }
  ],
  "candidate_set_size": 214,
  "recall_stage_rungs_used": [1, 3],
  "model_version": "tier2-lambdamart-2026.09.01-a1b2c3d",
  "feature_snapshot_id": "..."
}
```

`candidate_set_size` and `recall_stage_rungs_used` are **part of the contract**, not debug output. A
Recall@5 figure is meaningless without the size and construction of the set it ranked over (§16.3).

Do not output unsupported precision. `0.31` — not `0.3147`.

---

## 16. Candidate generation and cold start

The most common silent failure in ranking systems is an undisclosed candidate set. If the recall stage
quietly includes the true answer and excludes plausible competitors, Recall@K approaches 1.0 and means
nothing. This section is therefore a correctness requirement, not an optimisation.

### 16.1 Recall ladder

Union, deduplicate, cap, and **record which rungs contributed**:

| Rung | Source | Requires |
|---|---|---|
| 1 | Endpoints in the mule account's own historical activity footprint | Account seen before |
| 2 | Endpoints used by accounts in the same detected mule cluster/community | Cluster membership |
| 3 | Endpoints near the account's home branch / KYC district | KYC district only |
| 4 | Endpoints in the top-N cells from the Tier-1 forecast | Nothing case-specific |
| 5 | Endpoints matching the case's typology signature | Fraud category |

### 16.2 Cold-start ladder

An unseen account empties rungs 1 and 2. The system then falls back to 3, then 4+5, and **degrades its
own stated confidence accordingly**:

| Rungs available | `evidence_sufficiency` |
|---|---|
| 1 and 2 | `STRONG` |
| 1 or 2 | `MODERATE` |
| 3 only, or 4+5 | `WEAK` |
| none | `INSUFFICIENT` — **emit no ranked candidates**; return the Tier 1 forecast only |

A `WEAK` prediction **must not render identically** to a `STRONG` one. This is a UI requirement with a
test behind it (§25), because the failure mode it prevents — an investigator acting on a guess that
looked like evidence — is the one with real-world consequences.

### 16.3 Negative sampling

Hard negatives drawn from the same recall set, stratified by distance band, so the ranker learns to
discriminate between *plausible* alternatives rather than between the answer and random noise.
Documented in ADR-012 and tested: a test asserts the true endpoint is not preferentially placed in the
candidate set relative to negatives, and that recall-set construction never consults ground truth.

---

## 17. Label definition

The single most important line in any ML specification. The predecessor had none.

> A **positive** is a cash-withdrawal event — via `ATM`, `AEPS_BC`, `BANK_BRANCH`, `POS_CASHBACK`,
> `MERCHANT_QR`, `PREPAID_GIFT` or `CRYPTO_P2P` — executed from an account lying on a **confirmed fraud
> money-trail**, occurring **at or after fraud initiation** and **at or before account freeze**, and
> attributable to a **resolvable endpoint**.
>
> Every other withdrawal in the same window is a **negative**.

Exclusions are counted and published, never quietly dropped:

- unresolvable endpoint (channel has no geographic endpoint, e.g. most `CRYPTO_P2P`);
- post-freeze withdrawals (the intervention already happened — including these would inflate results);
- ambiguous attribution (funds commingled beyond separability).

`docs/ml/label-definition.md` carries the full definition, the exclusion counts per dataset version,
and any change history. **Changing the label definition invalidates every prior metric**, and the
evaluation report must refuse to compare across label versions.

---

## 18. Feature catalogue

Grouped, and every feature carries an `observed_at` (§19).

- **Temporal** — hour of day, day of week, time since previous transaction, transaction velocity, recent
  activity burst, time since complaint, **time since fraud initiation (golden-hour position)**.
- **Financial** — amount, amount ratio to victim loss, cumulative amount, hop count, transfer velocity,
  split/aggregation patterns, round-number ratio.
- **Behavioural** — historical cash-out channel preference, repeated-location behaviour, account
  activity profile, deviation from the account's own baseline.
- **Graph** — path length from victim, centrality, cluster membership, relationship strength, fan-in /
  fan-out ratio.
- **Geospatial** — distance from mule's KYC district, endpoint density in cell, historical fraud-linked
  utilisation of cell and endpoint, movement pattern, cross-state indicator.
- **Endpoint** — channel, operator, cash-limit profile, operating hours, prior fraud-linked utilisation,
  **BC-agent churn** (an AePS-specific signal with no ATM analogue).
- **Typology** — fraud category and its learned signature.

**Prohibited features, enforced by test (§22.2):** any protected attribute or close proxy — caste,
religion, language, gender — and any feature derived from them. A test enumerates the feature schema
and fails on the prohibited list. Not a policy statement; a failing build.

---

## 19. Leakage control

Five independent mechanisms, because any one of them can be defeated by an ordinary mistake.

Two of the five were added after the entity-resolution work (ADR-013) exposed leakage paths the
original three could not see. Both are worth understanding, because neither involves anyone breaking a
rule.

### 19.1 Point-in-time-correct feature store

Every feature row carries `observed_at`. Training sets are built by **as-of joins at the prediction
timestamp**. No feature whose `observed_at > as_of` may ever be read. This is the mechanism the
predecessor's "prevent data leakage" instruction lacked — an instruction is not a control.

### 19.2 Physical separation of ground truth

Ground truth lives in PostgreSQL schema `truth`, owned by a role that the serving and feature-pipeline
database users have **no grant on**. A migration test asserts the absence of that grant. Even a coding
error cannot read what the database will not serve.

### 19.3 Point-in-time entity resolution

**The entity table looks like reference data. It is observation data.**

An entity merge performed today, applied retroactively, lets a model "know" a linkage that was not
knowable at prediction time — inflating Tier 2 recall on exactly the mule networks that matter most.
No rule is broken when this happens: the feature pipeline reads its own entity table, exactly as
designed. Gates 19.1, 19.2 and 19.5 are all silent.

Feature reads therefore join against the entity graph **as it stood at `as_of`** (§13.1), never as it
stands now.

### 19.4 Artefact edges are excluded from features

The graph now contains `Prediction`, `Alert`, `Case` and `Intervention` nodes (§14.1). These are
investigative context for a human, and they must never enter a feature vector — a model that can
traverse to its own prior output will manufacture confidence from it, and the resulting self-agreement
looks exactly like skill.

Enforced by an allow-list: the feature pipeline may traverse financial edge types only. Artefact edge
types are rejected at the graph interface, not filtered downstream.

### 19.5 Three CI gates

| Gate | Mechanism |
|---|---|
| **Import isolation** | `import-linter`: nothing under `atlas.features` or `atlas.predict` may import `simulator.truth`, transitively. |
| **Temporal shuffle** | Shuffling all post-`as_of` data must not change any prediction, bit for bit. If it does, something read the future. |
| **Canary** | A synthetic feature planted only in ground truth. If it ever appears in a feature vector, CI fails loudly. |

**Every gate is itself tested by deliberately breaking it** (`tests/leakage/`). A safety control that
has never been observed to fire is not known to work — and on this project that rule has already earned
its keep twice: a secret-scan gate that passed a planted key, and a spec validator blind to an entire
class of broken reference.

---

## 20. Model strategy — baseline first

Phase 1 — heuristic and historical-frequency baselines.
Phase 2 — logistic regression / random forest.
Phase 3 — gradient boosting; LambdaMART for Tier 2 ranking.
Phase 4 — graph-enhanced features.
Phase 5 — GNN or deep learning **only if** evaluation demonstrates meaningful benefit over Phase 4 on a
temporally held-out set. Absence of benefit is a publishable result and must be recorded in the model
card, not buried.

### 20.1 The baseline is not a formality

The strong baseline is **historical frequency + recency**, plus Hawkes for Tier 1. It is genuinely hard
to beat on this problem. **The headline number is uplift over this baseline, never raw accuracy.** If a
model cannot beat it, ship the baseline and say so — a well-characterised baseline that works is worth
more than a complex model with an unverifiable advantage.

### 20.2 Explanations

SHAP contributions surfaced as ranked contributing factors, in investigator language:

> Prediction influenced by: recent rapid fund movement · this endpoint's prior fraud-linked utilisation ·
> geographic proximity to the mule account's KYC district · transaction velocity · similar historical
> cases in this typology.

An explanation is part of the output contract, not a nice-to-have. An investigator who cannot see why
cannot exercise judgement, and human-in-the-loop then becomes a slogan.

---

## 21. Evaluation contract

Mandatory. No arbitrary accuracy numbers, ever.

### 21.1 Metrics by tier

| Tier | Metrics |
|---|---|
| **1** | **PAI** (Prediction Accuracy Index), **PEI**, **PEI\***, hit rate at area %, surveillance-burden curve |
| **2** | Recall@{1,3,5,10}, MRR, NDCG@K, **hit-within-radius** (500 m / 2 km / 5 km), calibration (ECE + reliability diagram), **lead-time distribution** |
| **3** | **PR-AUC** (never ROC-AUC as a headline — the class imbalance is extreme and ROC-AUC will flatter it), precision at alert budget |

PAI and PEI are the standard indices in crime forecasting. Reporting Top-1 accuracy alone — as the
predecessor did — reads as unfamiliarity with the field to exactly the audience being pitched.

### 21.2 The operational metric

> **How much advance warning did the system actually provide before the real cash-out?**

Reported as a distribution, not a mean, and bounded by golden-hour position: warning that arrives after
the money is gone is zero warning regardless of rank.

### 21.3 The intelligence funnel — operational quality

Model metrics measure whether the ranking is good. They do not measure whether the system is *useful*,
and those are different questions. Mature financial-crime platforms lead with a funnel, and so do we:

```
Prediction ──► Alert ──► Case ──► Intervention ──► Outcome
           n%        n%       n%              n%
```

Each hop is measured, and each failure has a different cause and a different fix:

| Hop | Conversion measures | A low rate means |
|---|---|---|
| Prediction → Alert | Did the policy engine consider it actionable? | Thresholds miscalibrated, or predictions genuinely weak |
| Alert → Case | Did an investigator open it? | Alert fatigue, poor reasons, or wrong jurisdiction routing |
| Case → Intervention | Did anyone act? | Too late (golden hour missed), or intelligence not usable |
| Intervention → Outcome | Was the result recorded? | Feedback loop broken — and without it nothing can be learned |

**A prediction that ranks perfectly and produces no intervention has failed.** Reporting Recall@5
without the funnel describes a model, not a system.

Conversion is reported per jurisdiction and per typology, because a national average hides the case
where one state's alerts are never opened.

### 21.4 Investigative utility

The public justification for national financial-intelligence programmes is stated in utility terms,
not model terms — what share of investigations the data contributed to, how often it is queried. Nobody
quotes an AUC. We therefore report, alongside the tier metrics:

- **share of cases where ATLAS intelligence was cited** in the action taken;
- **time-to-fund-block** — from complaint receipt to the bank marking a lien;
- **recovery rate** and recovered amount;
- **analyst-hours per case**, against a pre-ATLAS baseline where one can be established.

Time-to-fund-block and recovery rate are not optional extras: the PS names them directly ("enabling
faster fund blocking and increasing the chances of recovery"), which makes them acceptance criteria
(§50), not nice-to-haves.

**Honesty constraint.** On synthetic data these are *simulated* outcomes, and every report must label
them as such. A simulated recovery rate is evidence that the measurement pipeline works, not evidence
that the system recovers money. Never present the two as the same claim.

### 21.5 The alert-budget frame

Metrics are reported against what an LEA can actually action. If a district team can act on 50 alerts a
day, precision@50 is the number that matters, and a model with better AUC but worse precision@50 is the
worse model. Report the operating point, not just the curve.

### 21.6 Splitting

**Temporal splits only**, time-ordered with an explicit gap between train, validation and test. Random
splits on time-series data leak the future and are forbidden. Every report documents training period,
validation period, test period, feature-availability timestamp, prediction timestamp and outcome
timestamp.

### 21.7 Reporting rules

- Confidence intervals on every headline number (bootstrap).
- Uplift over baseline is the headline; raw accuracy never is.
- Metrics stamped with git SHA, dataset version, label-definition version and model version.
- `make eval` regenerates `reports/evaluation-<git-sha>.md` deterministically. Same SHA ⇒ same numbers.
- **Never display a metric the harness did not produce.** No slide may contain a hand-typed number.

---

## 22. Feedback loops, fairness and drift

### 22.1 The feedback loop

This is the canonical failure of predictive systems in policing, and the strongest attack available to
a sharp judge. Deploy to predicted cells → detect more there → retrain on detection-biased data →
converge on your own prior. The system becomes confidently self-referential.

Controls:

- **Permanently held-out control cells** that never receive predicted interventions, used to detect
  intervention-induced drift. Selected once, randomised, documented, never changed to improve a number.
- **Intervention-aware evaluation**: outcomes are recorded with the intervention that preceded them, so
  detection uplift and true incidence are not conflated.
- **Propensity correction** in retraining, weighting by the probability that a cell was surveilled.
- Documented in `docs/ml/feedback-loop.md`.

### 22.2 Fairness

- No protected attribute or close proxy in any feature vector, enforced by a failing test (§18).
- **District-level disparity report** published with every evaluation: does the system concentrate
  attention in a way unexplained by reported-fraud incidence? This is published even when unflattering.
- Geographic risk language audited (§2): risk attaches to predicted activity, never to a place or a
  population.

### 22.3 Drift monitoring

Prediction drift · feature drift · data quality · performance · calibration · false-positive and
false-negative rates · prediction coverage · distribution shift. The model registry tracks model
version, training dataset version, feature version, training timestamp, evaluation metrics and approval
status. **No silent model replacement** — promotion is an explicit, audited, human action.

---

## 23. Synthetic financial-crime simulator

No dataset is supplied with SIH26184. The simulator is therefore not a convenience — it is the
foundation of every number this project reports, and its credibility is the project's credibility.

### 23.1 What it generates

**Normal population** — salary credits, bills, shopping, transfers, ordinary withdrawals; realistic
diurnal and weekly rhythms; realistic geography.

**Fraud scenarios** — one generator per typology (§9), each producing victim compromise, mule
recruitment, layering, splitting, aggregation, wallet/merchant movement and cash-out through the
channel mix appropriate to that typology.

**Scale** — thousands of accounts, hundreds of thousands of transactions, multiple states and districts,
realistic endpoint density (ATM, AePS/BC, branch, merchant), realistic timestamps and distributions.

Agent-based and behavioural, following the approach established by AMLSim and IBM/ETH's AMLworld.
**Not random rows in a spreadsheet.** Lineage and rationale in ADR-005.

### 23.2 Hidden ground truth

For every fraud scenario the simulator knows: the actual fraud path, the actual cash-out endpoint, the
actual cash-out timestamp.

**The prediction system must never receive this.** Enforced physically and in CI (§19), not by
convention. This is what makes the demo an honest test rather than a performance.

### 23.3 Realism validation — the gate

Synthetic data that is not credible produces metrics that are not credible. `simulator/validation/`
must pass before any dataset version is usable:

- amount distributions vs published aggregate statistics; **Benford's law** conformance on amounts;
- inter-arrival time distributions vs plausible transaction rhythms;
- account degree distribution is heavy-tailed, not uniform;
- geographic distribution consistent with population and endpoint density;
- **separability sanity gate**: no single feature may separate synthetic-fraud from synthetic-normal
  above a threshold. If one does, the simulator has embedded the answer and every downstream metric is
  worthless. This is the most important gate in the file.

`docs/ml/simulator-limitations.md` states plainly what the simulator does *not* capture. Volunteer
these limits to judges; they are the difference between a defensible result and an overclaim.

---

## 24. GIS risk engine

PostGIS + H3. Supports endpoint points, administrative boundaries, jurisdictions, risk cells, predicted
hotspots, historical hotspots, transaction paths and geographic filters.

The heatmap supports, per the PS's "drill-down filters by time, location, and crime category":
current risk · predicted risk · time window (6h/24h/72h) · crime category · channel · state · district ·
city · cell · confidence · historical comparison · **control cells excluded from tasking** (§22.1).

Rendering: deck.gl H3 layers over MapLibre, resolution switching by zoom.

**A companion treemap, not only a map.** The map answers *where*; a jurisdiction treemap answers *how
much*. A choropleth makes a small, dense, high-volume district visually negligible next to a large
quiet one — which is precisely the district an officer most needs to see. The two views are linked:
selecting a jurisdiction in one filters the other.

Three rules:

- **A cell is never coloured by crime rate.** It is coloured by *predicted fraud-linked cash-out
  activity under model M in window W with evidence E*, and the legend says exactly that.
- **Uncertainty is rendered, not hidden.** A low-confidence cell is visually distinct from a
  high-confidence one. A map that renders a guess and a finding identically is a defect (§25.3).
- **Control cells are never tasked.** The held-out cells that detect intervention-induced drift
  (§22.1) are excluded from tasking views and labelled where an analyst could otherwise mistake their
  absence for low risk.

---

## 25. Investigator interface

Views: Command Overview · Active Cases · Risk Heatmap · Prediction Feed · Money Trail Explorer ·
Case Intelligence · Alerts · Evidence · Model Performance · Audit Log · **Bank Intelligence Outbox** ·
**Jurisdiction Hand-offs**.

### 25.1 Command Overview — the funnel leads

The primary KPI row is the **intelligence funnel** (§21.3), not a model metric:

```
Predictions ──► Alerts ──► Cases opened ──► Interventions ──► Outcomes
            n%         n%              n%                 n%
```

A dashboard whose headline is "model accuracy 0.87" tells an officer nothing they can act on. A
dashboard whose headline is "318 alerts, 96 opened, 61 acted on, 44 outcomes recorded" tells them where
the system is failing today.

Below it: amount at risk · **median lead time** · cases inside golden hour · predicted hotspots ·
**pending grouping proposals** (§27.1) · open high-severity alerts · recent interventions · model
health · data freshness.

Two complementary geographic views, because they answer different questions: **the map answers
*where*, the treemap answers *how much, by jurisdiction*.**

### 25.2 Consistent work-item anatomy

Every case, alert and prediction carries the same tabs, in the same order, always:

**Summary · Money Trail · Graph · Prediction & Why · Evidence · Audit**

**Audit is a permanent, co-equal tab, not a settings screen.** Making it always-present is a statement
about what the product is for: investigative actions are reviewable by default.

A **pinned fact-strip** sits above the tabs and never scrolls away:

```
Case ID · Typology · Complaint time · Amount at risk · GOLDEN-HOUR POSITION
Predicted window · Top candidate · Evidence sufficiency · Model version
```

Golden-hour position belongs in that strip because it is the fact that determines whether anything
else on the screen still matters.

### 25.3 Rendering uncertainty — a hard requirement

**An investigator must be unable to mistake a weak prediction for a strong one** (§16.2). This is
enforced by a UI test asserting that `evidence_sufficiency` changes the *rendering*, not merely a
tooltip:

| Band | Rendering |
|---|---|
| `STRONG` | Full ranked list, solid confidence bars, map cells at full opacity |
| `MODERATE` | Ranked list, hatched confidence bars |
| `WEAK` | Ranked list dimmed, banner naming the missing evidence, map cells outlined not filled |
| `INSUFFICIENT` | **No ranked list.** Tier 1 zone forecast only, with an explicit explanation |

The failure this prevents — an investigator deploying a team on a guess that looked like a finding — is
the one with real-world consequences, which is why it is a test and not a guideline.

### 25.4 Explanations are sentences, not coefficients

Contributing factors render as sentences containing **a quantity and a window**: *"₹8.2 lakh moved
through 4 accounts in 22 minutes"*, not *"velocity_score: 0.82"*. SHAP values are translated before
display and never shown raw to an investigator.

### 25.5 Visual language

Professional, information-dense, restrained, accessible, fast. Colour is **semantic and scarce** —
severity and risk only, never decoration. Type is small and tabular; digits use tabular figures. No
excessive animation, no gaming aesthetics, no fake-hacker visuals, no neon, no generic chatbot UI.

Prioritise map, timeline, graph, evidence, risk, confidence, action.

**An investigator must understand a case within seconds.** Every visualisation must support a real
operational decision; decorative charts are removed.

---

## 26. Case management and typed interventions

Investigators can create/open a case · assign · view the complaint · inspect the transaction graph ·
view predictions · acknowledge alerts · add notes · attach evidence metadata · **record a typed
intervention** · record outcome · close.

Lifecycle:

```
NEW → TRIAGED → INVESTIGATING → ACTION_RECOMMENDED → ACTIONED → OUTCOME_RECORDED → CLOSED
```

**Typed interventions** — because the PS names them, and because outcome analysis is impossible against
free text:

| Type | From the PS |
|---|---|
| `DEPLOY_TEAM` | "deploying special teams" |
| `ALERT_LOCAL_BANK` | "alerting local banks" |
| `ALERT_ATM_OPERATOR` | "alerting... ATMs in high-risk areas" |
| `REQUEST_FUND_BLOCK` | CFCFRMS fund blocking |
| `REQUEST_CCTV` | Samanvay-style evidence request |
| `JURISDICTION_HANDOFF` | cross-jurisdiction sharing |
| `NO_ACTION` | recorded explicitly, with reason — a null result is data |

Every intervention records what was predicted, what was done, when, by whom, and what happened. This
closes the loop for §22.1 and is the only way lead time and recovery can be measured at all.

### 26.1 Grouped cases

A case may be created from a **grouping proposal** (§27.1) covering complaints across several
jurisdictions. Grouped cases carry two properties ordinary cases do not:

- **Multiple owning jurisdictions.** Ownership is per-complaint, not per-case; authorization is
  evaluated per-complaint (§29). A district investigator in a grouped case sees their own complaints in
  full and the others only as linkage.
- **Reversibility.** Split restores the original cases with their history intact (§13.1).

### 26.2 The recommended next step

Storing a case is not enough; the system proposes what to do with it. Each open case surfaces a ranked
**typed** next action with the reason it is recommended — derived from evidence sufficiency, golden-hour
position, predicted window and jurisdiction.

The investigator overrides freely, and **the override is recorded with its reason**. Overrides are the
highest-quality label the system ever receives: they are an expert stating that the model was wrong
about something specific. They feed the alert policy, not the prediction models directly (§22.1).

Every action is audited (§32).

---

## 27. Alert engine

Policy-based. Conditions combine prediction probability · confidence · **evidence sufficiency** ·
amount threshold · lead time · geographic risk · case severity · model agreement · historical
recurrence · **golden-hour position**.

Severity: `LOW` `MEDIUM` `HIGH` `CRITICAL`.

Channels, per the PS ("SMS, email, API, or dashboard triggers"): dashboard · internal API · signed
webhook · email/SMS adapters as **mock implementations by default**.

```
NotificationProvider
  ├── MockProvider              # default everywhere in this repo
  ├── EmailProvider
  ├── SMSProvider
  └── GovernmentGatewayProvider
```

**No real external notification is ever sent by default.** Production providers require explicit
configuration and fail closed if partially configured.

**Alert-flooding is a threat, not an inconvenience** (§35). The engine enforces per-jurisdiction alert
budgets, deduplication, suppression windows and escalation rather than repetition. An operator who
learns to ignore the system has been harmed by it.

### 27.1 Network case grouping

Deduplication removes *identical* alerts. It does nothing about the harder problem: **one mule network
generates dozens of distinct, individually-valid complaints across several states.** Forty separate
alerts describing one operation is technically correct and operationally useless — it is exactly how
alert fatigue is manufactured.

The engine therefore proposes **groupings**, not just alerts. A grouping is offered when complaints
share:

- a detected mule cluster or a common intermediary account;
- a cash-out endpoint or a tight cluster of endpoints;
- a typology signature plus a temporal window;
- a device, beneficiary or network indicator (§13.2).

**Every grouping states its reason quantitatively.** Not "related activity" but:

> *14 complaints across 3 states route to 2 AePS endpoints within 6 hours; shared intermediary
> account SYN-ACC-004182.*

A number, a threshold, a window. This is what lets an investigator judge the proposal in seconds
rather than trusting it.

Rules that make grouping safe:

- **A grouping is a proposal, never automatic.** A human accepts, rejects or edits it, and the decision
  is audited. Auto-merging cases across jurisdictions would silently reassign investigative ownership.
- **Merging preserves each complaint's jurisdictional ownership and its victim's identity.** A grouped
  case has multiple owning jurisdictions, not one; §29 authorization still applies per-complaint.
- **Groupings are splittable** (§13.1). Grouping is a hypothesis, and wrong hypotheses must be
  reversible without destroying case history.
- **Rejected groupings are training signal**, recorded with the reason.

---

## 28. Outbound intelligence — CFCFRMS and cross-jurisdiction

**This section exists because the predecessor omitted it entirely, and it is a stated PS requirement.**
The PS says the intelligence "would also help banks and financial institutions (FIs) through the
Citizen Financial Cyber Fraud Reporting and Management System, enabling faster fund blocking and
increasing the chances of recovery", and requires "real-time actionable intelligence sharing across
jurisdictions".

`atlas.intel` produces **IntelligencePackage** objects — the system's outward-facing product.

### 28.1 Bank / FI package (CFCFRMS-shaped)

Contains: prioritised accounts for freeze or lien-marking with reason and confidence · endpoint watch
list · predicted window · case reference · **data minimised to what the recipient is entitled to see**
(a bank receives its own accounts, not another bank's).

Measured by the outcome the PS actually names: **time-to-fund-block** and **recovery rate**. These are
reported in the evaluation harness alongside the model metrics, because they are the metrics the
sponsor cares about.

### 28.2 Cross-jurisdiction hand-off

When predicted cash-out falls outside the originating jurisdiction, a package is routed to the
receiving jurisdiction with case context, prediction, evidence references and a receipt. Note the
distinction the predecessor inverted: jurisdiction-aware access control is a **restriction**;
cross-jurisdiction hand-off is a **requirement**. Both exist, and they are not the same mechanism.

### 28.3 The certification block — every package, no exceptions

Mature national financial-intelligence systems do not let an investigator simply message a bank. The
request is **certified** by the requesting authority, **scoped** to a stated purpose, and **audited**
end to end. Certification is what makes the request lawful; scoping is what keeps it proportionate.

ATLAS adopts the same shape. Every `IntelligencePackage` carries a certification block, and the
outbound path **rejects any package without a complete one**:

```jsonc
"certification": {
  "requesting_officer_id": "...",
  "requesting_jurisdiction": "...",     // node in the jurisdiction tree (§8.2)
  "legal_basis": "...",                 // cited instrument (§40)
  "case_reference": "CASE-2026-0914",
  "purpose": "...",                     // free text, mandatory, audited
  "scope": {                            // what the recipient may act on
    "accounts": ["..."], "endpoints": ["..."], "window": {"start": "...", "end": "..."}
  },
  "issued_at": "...",
  "expires_at": "...",                  // packages age out; no standing authority
  "signature": "..."                    // detached, over the canonical serialisation
}
```

Three consequences worth stating plainly:

- **Expiry is mandatory.** A package confers time-bounded authority to act on specific accounts, never
  standing access. An expired package is refused by the recipient adapter, not merely marked stale.
- **Scope is enforced, not advisory.** A bank receives only its own accounts (§28.1); a jurisdiction
  receives only what its authority covers.
- **This turns "we sent an alert to a bank" into a defensible legal artefact.** It is the difference
  between a prototype and something an authority could actually operate, and it is the detail a
  sponsoring department notices first.

### 28.4 Bidirectional intelligence — the response channel

**This is the change that makes the ecosystem improve rather than merely function.**

The predecessor's outbound design was one-way: ATLAS → bank. Under that design a bank never learns
which of our notices led to a recovery, ATLAS never learns which notices were actionable, and both
sides optimise blind. Public-private financial-intelligence partnerships work precisely because
feedback flows back to the filer.

Every package therefore carries a **response channel**, and a response is expected:

| Response | Meaning | What it teaches us |
|---|---|---|
| `ACTED` | Lien marked / account frozen / endpoint watched | The prediction was actionable **and** timely |
| `ALREADY_ACTIONED` | Recipient had already acted | We were correct but **late** — a lead-time failure, not a ranking failure |
| `NOT_ACTED` | Received, no action taken, reason given | Usually operational, not model error — capture the reason |
| `FALSE_POSITIVE` | Recipient judges it wrong | Direct negative label |
| `OUT_OF_SCOPE` | Not this recipient's account/jurisdiction | Routing error — ours to fix |

The distinction between `ACTED` and `ALREADY_ACTIONED` is the most valuable signal in the system: it
separates *being wrong* from *being slow*, and those have completely different fixes. A model metric
alone can never distinguish them.

Responses are the ground truth for §21.4, and they are **the only honest source of recovery-rate data**
in a production deployment.

### 28.5 Outcome digest and typology advisory

Two scheduled products complete the loop:

- **Outcome digest** — periodic, per-recipient: what we sent you, what you reported back, what the
  aggregate outcome was. Recipients learn which of our intelligence was worth acting on, and we learn
  whether they agree with us.
- **Typology advisory** — red-flag indicators derived from our own corpus, so recipients can detect
  patterns themselves rather than waiting for us. *"AePS cash-out through BC agents in district X shows
  a new pattern: N agents, ₹Y, Z-hour window."*

**Advisories are human-reviewed before publication, without exception.** An automatically published
advisory naming a district is a serious action with real consequences for real places (§2, §3). The
review step is a control, not a bottleneck to optimise away.

This is what the PS means by "enhancing coordination between law enforcement and financial entities"
— coordination is bidirectional or it is just notification.

### 28.6 Transport security

Signed webhooks (detached signature over a canonical serialisation) · replay protection (nonce +
timestamp window) · mutual authentication · delivery receipts · full audit · **idempotent delivery** ·
schema-versioned payloads. A pull API with the same authorization model for recipients who cannot
accept webhooks.

---

## 29. Security architecture

Security is a first-class subsystem and is built **from the first vertical slice**, not retrofitted.
The predecessor placed hardening at phase 9 of 13 on a cybersecurity-themed problem statement;
retrofitted authorization is how systems end up with IDOR everywhere.

**Authentication** — OIDC/OAuth2 compatible · short-lived access tokens · secure refresh rotation with
reuse detection · MFA (TOTP) · argon2id password hashing · JTI revocation list.

**Authorization** — RBAC plus ABAC where appropriate. Roles: `SUPER_ADMIN` `NATIONAL_ANALYST`
`STATE_ANALYST` `DISTRICT_INVESTIGATOR` `BANK_PARTNER` `AUDITOR` `READ_ONLY_ANALYST`.

`BANK_PARTNER` is a **real role with a real surface** (§28.1) — the predecessor defined it and gave it
nothing to do.

Enforced: least privilege · resource-level authorization · jurisdiction-aware access · case-level
authorization · **deny by default**.

**Frontend authorization is never trusted.** Every sensitive decision is enforced server-side, and a
security test suite attempts each bypass.

**Break-glass access** — time-boxed, requires written justification, notifies a second party, is
prominently audited, and expires automatically. Emergencies are real; unlogged emergencies are not.

---

## 30. Data protection

Classification: `PUBLIC` `INTERNAL` `SENSITIVE` `HIGHLY_SENSITIVE` `RESTRICTED`.

Sensitive fields support encryption at rest and in transit · masking · tokenisation/pseudonymisation ·
access logging.

**Never logged:** passwords · tokens · secrets · full financial credentials · unnecessary PII.

Field-level masking, e.g. an account rendered `XXXXXXXX9012` rather than `123456789012` — same length,
last four visible. (The predecessor's own example was internally inconsistent, showing a 10-character
mask for a 12-digit number; masks preserve length or they leak length.)

---

## 31. Zero trust

Assume the network is hostile · user identity is continuously verified · service identity is verified ·
internal traffic is not automatically trusted.

mTLS-ready architecture · service identity · network segmentation · API authentication · authorization
at every boundary · no implicit trust from network position.

---

## 32. Audit and evidence integrity

Every sensitive operation produces an audit event:

`event_id` · `timestamp` · `actor` · `role` · `action` · `resource` · `case_id` ·
`source_ip`/device metadata where appropriate · `result` · `correlation_id` · `previous_event_hash` ·
`event_hash`.

### 32.1 Tamper-evidence done properly

Hash chaining alone is **not** tamper-evidence: an administrator with database write access can
recompute the entire chain. The predecessor correctly warned against overclaiming here but never
specified the fix.

The fix, in three parts:

1. **Append-only store** — no `UPDATE`/`DELETE` grant on the audit schema for any application role;
   enforced by database privilege and asserted by a migration test.
2. **Hash chaining** — each event binds its predecessor.
3. **Periodic signed checkpoints** — at a fixed interval the chain head is signed by a key held
   **outside the application database**, and checkpoints are written to append-only storage. Rewriting
   history now requires forging a signature, not just a database write.

`make verify-audit-chain` recomputes the chain and verifies every checkpoint signature.

**The honest claim:** ATLAS provides *tamper-evident* audit and evidence integrity. It does **not**
provide legal chain of custody, and no document, slide or answer may say that it does.

### 32.2 Evidence

Metadata · provenance · source · timestamps · content hash · version · full access history. Evidence
content itself is out of scope for this repository; ATLAS handles references and integrity, not
custody of material.

---

## 33. Ledger — the blockchain question, answered

The theme is "Blockchain & Cybersecurity". The problem statement is predictive analytics. Both facts
are true and the honest resolution is §32: **an append-only, hash-chained, externally-signed audit and
evidence-integrity layer.**

That is a real cryptographic integrity mechanism providing a property the system genuinely needs, and
it is the right answer to give when asked.

Explicitly rejected, with reasons, in ADR-008:

- **No public blockchain.** Sensitive investigative data must never touch one, and hashes on a public
  chain buy timestamping at the cost of a permanent, unrevocable public artefact and an external
  dependency in an air-gapped context.
- **No permissioned ledger for its own sake.** A private chain among parties who already trust a
  central coordinator (I4C) is a distributed database with worse latency. If a genuine multi-party
  trust boundary emerges — banks and LEAs disputing what was shared and when — that is the moment to
  revisit, and ADR-008 records the trigger condition.

Say this plainly to judges. "We implemented cryptographic integrity where it was needed and declined
to add a blockchain where it was not, and here is the ADR" is a stronger answer than a chain nobody
can justify under a follow-up question.

---

## 34. AI security

Where LLMs are used at all — case summarisation, explanation phrasing, natural-language query — they
operate under hard constraints:

- **LLM output never directly executes a privileged action.** Ever.
- All structured output is schema-validated before use.
- Untrusted text (complaint narratives are attacker-controlled) is isolated and never treated as
  instructions.
- Prompt-injection defences, sensitive-data-leakage prevention, output schemas, full auditability.
- No hidden system information is exposed.
- **Authoritative values always come from structured backend systems**, never from a language model.

The ranking and forecasting models are **not** LLMs, and the system must never be described as
"powered by AI" in a way that implies otherwise.

---

## 35. Threat model

STRIDE where useful. For every high-risk threat: attack surface · impact · likelihood · mitigation ·
residual risk. Full model in `docs/security/threat-model.md`.

### 35.1 The threat specific to this system

**T-01 — Prediction-API abuse to locate unwatched endpoints.**

A corrupt insider, or an attacker with a compromised analyst account, queries the heatmap not to find
where enforcement will be, but to find where it will **not** be — the cold cells — and cashes out
there. The system inverts into a crime-enabling tool, and it does so while functioning exactly as
designed.

This threat appears in none of the predecessor's seventeen listed threats, and it is the one that
matters most here, because the harm is caused by *correct* operation.

Mitigations:

- **Query budgets per role and per analyst**, enforced server-side, with hard caps.
- **Coarsened responses by role** — broad exploratory queries return cell-level aggregates; endpoint-level
  detail requires an open case with a jurisdictional nexus.
- **Negative-space queries are restricted.** "Show me lowest-risk cells" is a privileged operation, not
  a filter toggle.
- **Per-analyst query-pattern anomaly detection**: unusual breadth, off-hours sweeps, repeated
  low-risk-region queries, or querying outside assigned jurisdiction raise a security event.
- Full audit of every prediction query, including the ones that returned nothing.

### 35.2 The rest

Stolen investigator credentials · privilege escalation · **insider misuse** (paired with detection in
§35.1, not merely listed) · API abuse · unauthorised data access · data exfiltration · malicious data
ingestion · **model poisoning via crafted complaints** · training-data poisoning · data leakage ·
adversarial manipulation of features · **model inversion / membership inference on the prediction API** ·
alert flooding · denial of service · supply-chain attack · dependency compromise · compromised service
account · audit-log tampering · **ground-truth exfiltration from the simulator** (a demo-integrity
threat as much as a security one).

---

## 36. API security

Versioned APIs: `/api/v1/{auth,complaints,cases,transactions,entities,graph,predictions,hotspots,alerts,evidence,intel,audit,models}`.

Request validation · response schemas · pagination · rate limiting · authorization · idempotency keys
on all mutating endpoints · correlation IDs · secure error responses · OpenAPI documentation generated
from code.

**Internal stack traces are never exposed to clients.** Errors are structured, correlation-stamped and
opaque; detail goes to the log, not the response.

---

## 37. Resilience

Health, readiness and liveness checks · retries with exponential backoff and jitter · circuit breakers ·
idempotent event handling · dead-letter queues · graceful degradation · connection pooling · backup
strategy · disaster-recovery documentation.

**Prediction failure must never take down the investigator platform.** If ML is unavailable:

- the dashboard remains available;
- existing predictions remain viewable, clearly marked with their `as_of`;
- the system displays model availability status prominently and honestly;
- case work, evidence and audit continue unaffected.

Verified by a chaos test that kills the prediction module and asserts the platform stays usable (§41).

---

## 38. Performance

The PS states ~8,000 complaints/day and explicitly that volume "has increased manifold... and this will
continue to rise". **Target 5× — 40,000/day sustained** — and document the scaling path beyond it.

Define and measure: API latency (p50/p95/p99) · ingestion throughput · prediction latency · GIS query
latency · dashboard load · concurrent investigators.

No meaningless "millions TPS" claims. Load-test scenarios are built on stated assumptions, and
`docs/deployment/performance.md` records baseline capacity, scaling strategy, known bottlenecks and
caching strategy.

---

## 39. Observability

**Metrics** — request latency, error rate, ingestion rate, queue lag, prediction latency, model
confidence distribution, alert generation rate, database performance, **evidence-sufficiency
distribution** (a sudden shift means the data changed).

**Logs** — structured JSON, correlation IDs, no sensitive values, ≥180-day retention (§40).

**Tracing** — OpenTelemetry across ingest → feature → predict → alert.

**Dashboards** — application health · data pipeline health · ML health · infrastructure health ·
security events.

---

## 40. Data governance and legal context

`docs/data-governance/` covers classification · ownership · retention · minimisation · provenance ·
access control · deletion and anonymisation · synthetic vs production data · model training lineage.

**This repository uses synthetic data exclusively. State this prominently in the README.**

Production deployment is a controlled activity under applicable Indian law. The instruments that apply
— named, because a government-facing submission that knows them is judged differently from one that
does not:

- **Digital Personal Data Protection Act, 2023** and the DPDP Rules, including the exemptions available
  for law-enforcement and legal-proceeding processing. An exemption is a defined scope, not a blanket
  waiver, and the design assumes the narrow reading.
- **CERT-In Directions (2022)** — incident reporting within 6 hours, log retention commonly implemented
  at ≥180 days. Both are design inputs (§39), not afterthoughts.
- **Bharatiya Nagarik Suraksha Sanhita, 2023** — the lawful basis for obtaining banking and
  transaction data. ATLAS consumes data lawfully obtained by the deploying authority; it does not
  itself acquire data.
- **IT Act, 2000** and rules made under it.
- **RBI / NPCI** circulars governing bank and payment-system data handling.

**No unsupported claim of certification, empanelment or compliance.** ATLAS is designed to *support*
compliance; it does not assert it.

---

## 41. Testing

**Unit** — domain logic, feature engineering, risk calculation, hash chaining.
**Integration** — API/database, event pipeline, ML service, graph traversal, outbound intel delivery.
**Security** — auth bypass, IDOR, privilege escalation, injection, rate limits, malformed payloads,
jurisdiction boundary crossing, break-glass expiry, **query-budget enforcement (§35.1)**.
**Leakage** — the five gates of §19, each verified by deliberately breaking it.
**Fairness** — prohibited-feature enumeration, disparity reporting.
**ML** — reproducibility, feature validation, baseline comparison, calibration.
**E2E** — complaint → graph → prediction → hotspot → alert → intervention → outcome.
**Performance** — ingestion load, concurrent investigators, prediction load, GIS queries.
**Chaos** — prediction module killed; platform must survive (§37).

---

## 42. CI/CD

On pull request: formatting · lint · type checks · **import-linter module boundaries** · unit tests ·
integration tests · leakage gates · dependency vulnerability scan · secret scan (full history) · SAST ·
container scan · SBOM generation.

On main: build · test · container build · security scan.

**No automatic production deployment.** Production requires explicit human approval, and the pipeline
enforces it.

---

## 43. Demonstration

A dedicated Demo Console telling one complete, honest story, reproducible with **one command**:

```
make demo
```

```
1  A victim reports a cyber fraud (synthetic).
2  ATLAS normalises it and reconstructs the available money trail.
3  Suspicious movement is identified, with contributing factors shown.
4  Tier 1 produces the zone forecast; Tier 2 ranks candidate endpoints;
   Tier 3 flags mule accounts and the endpoints worth watching.
5  Output: ranked candidates, probability, confidence, evidence sufficiency,
   time window, supporting factors.
6  The GIS dashboard highlights the predicted cells.
7  The investigator receives an alert; a bank package and a jurisdiction
   hand-off are produced.
8  The simulator's hidden ground truth is revealed — for the first time.
9  Prediction is compared against actual cash-out.
10 Report: Top-1, Top-3, hit-within-radius, PAI, lead time, calibration,
   uplift over baseline, model version, and the explanation.
```

### 43.1 The demo must not cheat

The simulator's actual cash-out location and time are never exposed to the prediction path before
prediction time (§19, §23.2).

Forbidden, absolutely: hardcoding the answer · leaking ground truth into features · silently selecting
the nearest endpoint · manufacturing accuracy · modifying predictions after the outcome · displaying
fabricated metrics · re-running until a good seed appears and shipping that seed.

The demo runs on a **fixed, committed seed chosen before results were known**, and `make demo` on a
clean clone reproduces identical numbers offline.

**If the prediction misses, the demo shows the miss.** A system that is honest about a miss and shows
its lead-time distribution is more convincing than one that has never been observed to fail — and
under judge questioning it is the only defensible position.

---

## 44. Documentation

`README.md` · `SECURITY.md` · `CONTRIBUTING.md` · `CODEOWNERS` ·
`PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md` · `docs/NON-GOALS.md`

`docs/architecture/{system-architecture,data-flow,deployment}.md` ·
`docs/security/{security-architecture,threat-model,incident-response}.md` ·
`docs/ml/{model-card,evaluation,label-definition,data-leakage-prevention,feedback-loop,typology-assumptions,simulator-limitations}.md` ·
`docs/data-governance/{data-classification,data-lineage,legal-context}.md` ·
`docs/api/api-reference.md` · `docs/deployment/{production-hardening,performance}.md` ·
`docs/demo/{demo-script,judge-questions}.md` ·
`docs/problem-statement/{SIH26184-official,requirements-traceability,incumbent-landscape}.md`

Diagrams in Mermaid: architecture · sequence · ER · transaction graph model · ML pipeline · threat
model · deployment.

`submission/` holds the SIH deck, the demo run-sheet, the pitch narrative and prepared judge answers.

---

## 45. Architecture Decision Records

| ADR | Decision |
|---|---|
| 001 | PostgreSQL + PostGIS + H3 as the single primary store |
| 002 | No Neo4j — recursive CTEs for bounded money trails |
| 003 | Redis Streams, not Kafka, at this volume |
| 004 | Three-tier model strategy |
| 005 | Synthetic data strategy and AMLSim/AMLworld lineage |
| 006 | Authentication and identity |
| 007 | Audit architecture — hash chain + externally signed checkpoints |
| 008 | Ledger vs blockchain — what was rejected and the trigger to revisit |
| 009 | Modular monolith with CI-enforced boundaries |
| 010 | Public repository security boundary |
| 011 | Prediction granularity — H3 resolution chosen by PAI sweep |
| 012 | Candidate generation and negative sampling |
| 013 | Entity resolution and dynamic entity risk |
| 014 | Outbound intelligence protocol — certification and bidirectional response |

Every ADR states context · decision · alternatives considered · consequences.

---

## 46. Code quality

Strong typing · clear module boundaries · dependency inversion at the ports · SOLID where it earns its
place · meaningful naming · no giant files · no magic constants · configuration via environment ·
structured errors · no dead code · no placeholder architecture.

Do not over-engineer. Prefer simple, correct implementations over elaborate abstractions. An
abstraction with one implementation and no second use case in sight is a liability.

---

## 47. Implementation phases

Build in vertical slices. Each slice runs. Never generate thousands of lines of unverified code.

| Phase | Goal |
|---|---|
| 0 | Spec, ADRs, repo skeleton, compose, CI, secret scanning, `make verify` |
| 1 | Domain model, migrations, **auth + audit chain from the first slice**, one E2E vertical slice |
| 2 | Simulator v1 — population, geography, endpoints (ATM + AePS/BC + merchant), typologies, isolated truth |
| 3 | Ingestion connectors, normalisation, dedup, provenance, DQ gates |
| 4 | **Entity resolution + dynamic entity risk**; transaction graph and money-trail reconstruction **including artefact nodes** |
| 5 | Point-in-time feature store + all five leakage gates live |
| 6 | Baselines + evaluation harness (PAI, PEI, lead time, **funnel conversion, investigative utility**) |
| 7 | Tier 1 forecast + Tier 3 mule/endpoint scoring |
| 8 | Tier 2 ranker + hazard model + SHAP + calibration |
| 9 | GIS heatmap, drill-down, money-trail explorer |
| 10 | Case management, lifecycle, typed interventions, evidence |
| 11 | Alert engine + **network case grouping** + `atlas.intel`: CFCFRMS package, **certification block**, jurisdiction hand-off, **response channel**, outcome digest |
| 12 | Security hardening, threat model, insider controls, query budgets |
| 13 | Observability, resilience, load test at 5× |
| 14 | Demo console, reproducible demo, submission artefacts |
| 15 | Documentation, model card, traceability matrix, final review |

After every phase: run tests · verify architecture · update docs · confirm no secrets · reach a
commit-ready state.

---

## 48. Working rules

Operate as the principal engineer. Make technically defensible decisions rather than asking for
obvious ones. Where a requirement is genuinely ambiguous **and** choosing wrongly would materially
change the architecture, document the assumption, choose the least risky reversible option, and
continue.

Before implementing: inspect · plan · write the ADR · create structure · stand up the dev environment ·
implement incrementally.

After implementing: run tests · run static analysis · run security checks · run the demo · inspect
failures · fix them · update docs.

**Report outcomes faithfully.** If a test fails, say so and show the output. If a metric is
disappointing, publish it. If a phase is incomplete, name what is missing. The single fastest way to
lose this problem statement is a number nobody can reproduce.

---

## 49. Acceptance criteria

Measured, not asserted. The system is complete when:

| # | Criterion |
|---|---|
| 1 | A synthetic complaint enters the system, is normalised, stored, authorised and audited. |
| 2 | The complaint links to synthetic transactions and a money trail is reconstructed for every seeded fraud case. |
| 3 | Suspicious behavioural patterns are identified with stated contributing factors. |
| 4 | Tier 1 beats the frequency+recency baseline on **PAI** by a documented margin on a temporally held-out period. |
| 5 | Tier 2 reports **Recall@5** and median **lead time** with confidence intervals on unseen data. |
| 6 | Calibration **ECE < 0.10** with a published reliability diagram — or the field is renamed from "probability" to "score". |
| 7 | Tier 3 reports **PR-AUC** and precision at a stated alert budget. |
| 8 | Predictions carry probability, confidence, evidence sufficiency, time window and explanation. |
| 9 | GIS displays predicted hotspots with uncertainty visibly rendered. |
| 10 | Investigators open a case, inspect the trail, and record a **typed** intervention and outcome. |
| 11 | Alerts generate under policy, with budgets and deduplication enforced. |
| 12 | A CFCFRMS-shaped bank package and a cross-jurisdiction hand-off are produced and delivered over a signed, replay-protected channel. |
| 13 | Hidden ground truth validates predictions, and **all five leakage gates pass and are proven to fail correctly when deliberately broken**. |
| 14 | Simulator realism validation passes, including the separability sanity gate. |
| 15 | Sustained ingest at **40,000 complaints/day** within documented latency targets. |
| 16 | Killing the prediction module leaves the platform usable, with degraded state visible in the UI. |
| 17 | Authentication, authorization, jurisdiction scoping and break-glass all work and resist the security test suite. |
| 18 | Audit chain verifies, checkpoint signatures verify, and the audit schema rejects `UPDATE`/`DELETE`. |
| 19 | Fairness audit passes: no protected attribute in any feature vector; district disparity published. |
| 20 | Observability available; CI security checks green; **zero secrets in full repository history**. |
| 21 | Every clause of the official PS maps to a module and a passing test in the traceability matrix. |
| 22 | `make demo` reproduces identical numbers from a clean clone, offline. |
| 23 | **Funnel conversion** is reported at all four hops, per jurisdiction and per typology (§21.3). |
| 24 | **Time-to-fund-block** and **recovery rate** are reported, and labelled as simulated where they are (§21.4). |
| 25 | Entity resolution is point-in-time correct: a merge made today does not change what last week's prediction could see (§13.1). |
| 26 | Entity risk scores are versioned, explained, decayed, and reconstructible as of any past instant (§13.2). |
| 27 | The graph contains `Complaint`/`Case`/`Alert`/`Prediction`/`Intervention` nodes, and a test proves **artefact edges never reach the feature pipeline** (§14.1). |
| 28 | A grouping proposal states a quantitative reason, requires human acceptance, and is splittable without losing case history (§27.1). |
| 29 | **No intelligence package leaves without a complete certification block**; expired packages are refused by the recipient adapter (§28.3). |
| 30 | The response channel distinguishes `ACTED` from `ALREADY_ACTIONED`, and lead-time failures are reported separately from ranking failures (§28.4). |
| 31 | A typology advisory cannot be published without recorded human review (§28.5). |
| 32 | `evidence_sufficiency` provably changes UI rendering, not merely a tooltip (§25.3). |

---

## 50. The principle that outranks the rest

Do not optimise for how impressive the architecture diagram looks. Optimise for this:

> Can an investigator receive a cybercrime complaint, understand the money trail, receive a defensible
> prediction of likely cash-out locations, understand **why** those locations were predicted, act on
> the intelligence, get it to the right bank and the right jurisdiction in time to matter, and later
> verify whether the prediction was correct?

If yes, ATLAS solves the actual problem.

Correctness first. Security second. Explainability third. Scalability fourth. Polish last.

And when a number looks too good, assume it is wrong and go and find out why. On this problem
statement, the most valuable engineering instinct is suspicion of your own results.
