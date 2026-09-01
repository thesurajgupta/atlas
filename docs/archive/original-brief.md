---
status: SUPERSEDED
superseded_by: docs/ATLAS_MASTER_SPEC.md
archived_on: 2026-09-01
---

> **This document is archived and no longer authoritative.**
>
> It was the original project brief for this effort, written under the working name "TRACE X".
> It has been superseded by `docs/ATLAS_MASTER_SPEC.md`.
>
> It is retained because most of its engineering judgement was sound and is carried forward
> verbatim into the master spec — in particular its rules on honest uncertainty language, its ban on
> using an LLM as an authoritative source of financial fact, its "demo must not cheat" constraints,
> its refusal to characterise geography as inherently criminal, and its resistance to gratuitous
> blockchain.
>
> It was replaced because it was written from a *paraphrase* of problem statement SIH26184 rather
> than the official text, and the paraphrase dropped binding requirements (CFCFRMS integration,
> cross-jurisdiction intelligence sharing, banks/FIs as first-class consumers). It also contained a
> direct self-contradiction on service decomposition, specified an ML target that cannot be
> evaluated honestly, and had no defence against prediction-driven feedback loops.
>
> The full audit is in `docs/problem-statement/requirements-traceability.md`.
> The official problem statement text is in `docs/problem-statement/SIH26184-official.md`.

---

You are the Principal Software Architect, Staff Security Engineer, ML Systems Architect,
Data Engineer, and DevSecOps lead for a high-assurance Indian government cybercrime
intelligence platform.

PROJECT:
TRACE X
Smart India Hackathon 2026
Problem Statement: SIH26184

OFFICIAL PROBLEM CONTEXT:
SIH26184 asks for a Predictive Analytics Framework for Cybercrime Complaints to forecast
likely cash withdrawal locations in advance and generate actionable intelligence for
timely, proactive cybercrime intervention.

The target ecosystem involves:
- National cybercrime complaint data
- Law Enforcement Agencies (LEAs)
- I4C/coordinating authorities
- Banks and Financial Institutions
- ATM/cash withdrawal locations
- Transaction/fund-flow information
- Geospatial intelligence
- Historical cybercrime patterns
- Real-time alerts and investigation workflows

Required functional areas include:
1. Predictive Analytics Engine
2. Risk Heatmap / GIS Dashboard
3. Secure Law Enforcement Interface
4. Alert & Notification System

IMPORTANT PRODUCT POSITIONING:
This is NOT a toy application.
Do NOT design it like a college CRUD project.
Do NOT build a fake dashboard with superficial AI labels.

Design TRACE X as a serious, security-first, government-grade intelligence platform
that could conceptually evolve into a production deployment.

However, distinguish clearly between:
A. Hackathon/Public Repository Environment
B. Controlled Staging Environment
C. Government Production Environment

The public repository must contain ONLY:
- source code
- architecture
- infrastructure definitions
- synthetic datasets
- synthetic-data generator
- reproducible ML experiments
- documentation
- tests
- security controls
- mock connectors

Never commit:
- real financial data
- real citizen PII
- bank credentials
- government credentials
- production API keys
- secrets
- private certificates
- real law-enforcement intelligence
- real account numbers
- real transaction histories

==================================================
1. PRIMARY OBJECTIVE
==================================================

Build a platform that performs the following conceptual workflow:

Cybercrime Complaint
        ↓
Complaint Normalization
        ↓
Entity & Transaction Extraction
        ↓
Financial/Money-Flow Reconstruction
        ↓
Suspicious Behaviour Analysis
        ↓
Temporal + Behavioural + Geospatial Features
        ↓
Predictive Analytics
        ↓
Likely Cash-Out Location Ranking
        ↓
Risk Score + Confidence + Explanation
        ↓
GIS Risk Heatmap
        ↓
Investigator Intelligence Case
        ↓
Actionable Alert
        ↓
Outcome / Ground Truth
        ↓
Model Evaluation + Feedback

The key intelligence question is:

"Given the information currently available, which cash withdrawal location(s)
are most likely to be used next, within what time window, and why?"

The system must NEVER claim certainty where only probabilistic prediction exists.

Use terminology such as:
- predicted likelihood
- confidence
- ranked candidates
- risk score
- supporting evidence
- contributing factors

Avoid:
- "100% fraudster"
- "guaranteed cash-out"
- "certain criminal"
- "AI proved the suspect"

The platform is an intelligence-support system, not an autonomous law-enforcement
decision maker.

==================================================
2. ARCHITECTURAL PRINCIPLES
==================================================

Follow these principles:

- Security by design
- Privacy by design
- Zero Trust
- Least privilege
- Defense in depth
- Explainable AI
- Human-in-the-loop
- Evidence traceability
- Auditability
- Reproducibility
- Data minimization
- Secure defaults
- Fail closed for privileged operations
- Explicit uncertainty
- Separation of duties
- Immutable/auditable security events
- No single source of truth assumptions
- No unrestricted AI autonomy

The architecture should be modular and production-oriented.

Prefer a modular architecture that can begin as a well-structured modular monolith
for the hackathon and evolve into independently scalable services.

Do NOT prematurely create dozens of microservices.

Use clear bounded contexts and service boundaries.

==================================================
3. REPOSITORY STRUCTURE
==================================================

Create a professional monorepo.

Suggested structure:

/
├── apps/
│   ├── investigator-web/
│   ├── admin-web/
│   └── demo-console/
│
├── services/
│   ├── api-gateway/
│   ├── complaint-service/
│   ├── transaction-service/
│   ├── entity-resolution-service/
│   ├── graph-intelligence-service/
│   ├── feature-service/
│   ├── prediction-service/
│   ├── geospatial-service/
│   ├── alert-service/
│   ├── case-management-service/
│   ├── audit-service/
│   └── notification-service/
│
├── ml/
│   ├── datasets/
│   ├── feature-engineering/
│   ├── training/
│   ├── evaluation/
│   ├── models/
│   ├── explainability/
│   └── experiments/
│
├── simulator/
│   ├── generators/
│   ├── scenarios/
│   ├── ground-truth/
│   └── validation/
│
├── data/
│   ├── schemas/
│   ├── synthetic/
│   └── seed/
│
├── packages/
│   ├── domain-models/
│   ├── shared-types/
│   ├── security/
│   ├── observability/
│   ├── validation/
│   └── config/
│
├── infra/
│   ├── docker/
│   ├── kubernetes/
│   ├── terraform/
│   ├── observability/
│   └── security/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── security/
│   ├── ml/
│   ├── data-governance/
│   ├── threat-model/
│   ├── deployment/
│   └── demo/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── security/
│   ├── ml/
│   ├── performance/
│   └── end-to-end/
│
├── .github/
│   └── workflows/
│
├── docker-compose.yml
├── README.md
├── SECURITY.md
├── CONTRIBUTING.md
├── CODEOWNERS
├── LICENSE
└── Makefile

Adapt the structure where technically justified.

==================================================
4. TECHNOLOGY DIRECTION
==================================================

Choose mature open-source technologies.

Recommended stack:

Frontend:
- Next.js / React
- TypeScript
- Tailwind or equivalent design system
- MapLibre GL / OpenLayers for GIS visualization
- Apache ECharts / equivalent for analytics

Backend:
- Python
- FastAPI
- Pydantic
- SQLAlchemy
- async processing where appropriate

Primary database:
- PostgreSQL
- PostGIS

Graph intelligence:
- Neo4j OR PostgreSQL graph-oriented modeling depending on complexity.
Use Neo4j if graph traversal is genuinely valuable.

Cache:
- Redis

Event streaming:
- Kafka-compatible system for production architecture
- Redpanda may be used locally for developer simplicity

Object storage:
- S3-compatible object storage
- MinIO for local development

ML:
- Python
- scikit-learn
- XGBoost/LightGBM where appropriate
- PyTorch only where deep learning is justified
- MLflow for experiment/model tracking

Model serving:
- FastAPI initially
- design interface compatible with dedicated model serving later

Identity:
- OIDC/OAuth2 compatible identity provider
- Keycloak may be used locally

Secrets:
- environment variables only for local development
- Vault/KMS/HSM-compatible architecture for production

Observability:
- OpenTelemetry
- Prometheus
- Grafana
- centralized structured logging

Deployment:
- Docker
- Kubernetes-ready
- Helm if useful
- Terraform for infrastructure abstraction

CI/CD:
- GitHub Actions
- linting
- unit tests
- integration tests
- dependency scanning
- secret scanning
- SAST
- container scanning
- SBOM generation

Do not introduce a technology merely because it sounds impressive.
Every major technology must have a documented architectural reason.

==================================================
5. DOMAIN MODEL
==================================================

Define strong domain entities.

At minimum:

Complaint
Case
Victim
Account
FinancialInstitution
Transaction
TransactionChain
Entity
MuleAccount
ATM
CashOutLocation
Merchant
Wallet
Device
IP/NetworkIndicator where legally appropriate
GeographicZone
RiskScore
Prediction
PredictionCandidate
Alert
Investigator
Evidence
EvidenceReference
InvestigationAction
ModelVersion
PredictionOutcome
AuditEvent

Every sensitive entity must have:
- internal immutable identifier
- timestamps
- source/provenance metadata
- classification
- access policy
- audit metadata

Never use real account numbers as primary identifiers.

For demonstrations, generate synthetic identifiers.

==================================================
6. DATA INGESTION LAYER
==================================================

Create a connector architecture.

Production conceptual sources may include:
- cybercrime complaint systems
- authorized banking/FI systems
- transaction feeds
- ATM/location registries
- GIS data
- historical incident databases

But the public implementation must use:
- SyntheticComplaintConnector
- SyntheticTransactionConnector
- SyntheticATMConnector
- SyntheticCaseConnector

Define a common interface:

DataConnector
  ├── validate()
  ├── ingest()
  ├── normalize()
  ├── emit_events()
  └── health_check()

All incoming data must pass through:
1. schema validation
2. normalization
3. data-quality checks
4. deduplication
5. provenance tagging
6. classification
7. audit logging

Reject malformed data safely.

==================================================
7. COMPLAINT PROCESSING
==================================================

Build a complaint ingestion pipeline.

Input:

- complaint ID
- timestamp
- fraud category
- reported amount
- victim region
- known beneficiary information
- available transaction references
- available account identifiers
- complaint narrative where available
- supporting evidence metadata

The system should normalize complaints into a canonical schema.

Where narrative text exists, NLP may extract structured signals.

Do not use an LLM as the authoritative source for financial facts.

LLM/NLP output must always be:
- probabilistic
- schema validated
- traceable
- secondary to authoritative structured data

==================================================
8. TRANSACTION INTELLIGENCE
==================================================

Build a transaction graph.

Nodes:
- accounts
- wallets
- entities
- merchants
- ATMs
- financial institutions
- geographic zones

Edges:
- transfers
- withdrawals
- deposits
- merchant payments
- wallet transfers
- account relationships

Each edge should include:
- amount
- timestamp
- transaction type
- source
- destination
- location if legitimately available
- confidence/provenance

Support:

- money-flow reconstruction
- multi-hop traversal
- temporal ordering
- suspicious velocity detection
- amount splitting
- rapid movement
- fan-in/fan-out behaviour
- unusual geographic movement
- repeated cash-out behaviour

Do not label behaviour as criminal solely from one feature.

==================================================
9. GRAPH INTELLIGENCE
==================================================

Implement graph analytics for investigative assistance.

Useful features:

- degree
- weighted degree
- PageRank-like centrality
- community detection
- connected components
- temporal paths
- fan-in/fan-out
- shortest relevant money paths
- suspicious cluster detection
- repeated transaction motifs

Build a "Money Trail" visualization.

Example:

Victim
  ↓
Account A
  ↓
Account B
  ↓
Account C
  ↓
ATM / Cash-Out Location

The UI should allow investigators to:
- expand nodes
- inspect transaction details
- filter by time
- filter by amount
- filter by entity
- highlight suspicious paths
- view supporting evidence

==================================================
10. PREDICTIVE ANALYTICS ENGINE
==================================================

This is the core of TRACE X.

Do NOT simply use an LLM to "predict the ATM".

Build a real predictive pipeline.

Problem formulation:

Given observed transaction/case data up to time T,
rank candidate cash-out locations for a future window [T, T + Δ].

Candidate locations:
- ATM
- branch cash withdrawal point
- authorized cash-out endpoint
- other supported withdrawal locations

Build features from:

Temporal:
- hour
- day
- time since previous transaction
- transaction velocity
- recent activity

Financial:
- amount
- amount ratio
- cumulative amount
- number of hops
- transfer velocity
- split/aggregation patterns

Behavioural:
- historical cash-out preference
- repeated location behaviour
- account activity profile
- unusual activity score

Graph:
- path length
- node centrality
- cluster membership
- relationship strength

Geospatial:
- distance
- movement patterns
- region
- historical hotspot intensity
- candidate density

Historical:
- previous incidents
- historical cash-out patterns
- temporal recurrence

Do NOT use protected/sensitive attributes unless explicitly justified,
lawful, necessary, and approved.

==================================================
11. MODEL STRATEGY
==================================================

Implement a baseline-first approach.

Phase 1:
- heuristic baseline
- historical frequency baseline

Phase 2:
- Logistic Regression / Random Forest / Gradient Boosting

Phase 3:
- XGBoost/LightGBM ranking/classification

Phase 4:
- graph-enhanced features

Only introduce GNNs/deep learning if evaluation demonstrates meaningful benefit.

The system should output:

Prediction:
{
  candidate_location_id,
  predicted_time_window,
  probability,
  rank,
  confidence,
  contributing_features,
  model_version
}

Do not output unsupported precision.

Example:

Top predicted locations:

1. ATM-ZONE-014
   Probability: 0.81
   Confidence: High

2. ATM-ZONE-027
   Probability: 0.11
   Confidence: Medium

3. ATM-ZONE-031
   Probability: 0.08
   Confidence: Medium

Add explanations:

"Prediction influenced by:
- recent rapid fund movement
- historical cash-out pattern
- geographic proximity
- transaction velocity
- similar historical cases"

==================================================
12. MODEL EVALUATION
==================================================

This is mandatory.

Do not show arbitrary accuracy numbers.

Create proper evaluation.

Metrics:

- Top-1 accuracy
- Top-3 recall
- Top-K recall
- Precision@K
- Recall@K
- MAP@K / NDCG@K where appropriate
- calibration
- false positive rate
- false negative rate
- lead time before actual withdrawal

Most important operational metric:

"How much advance warning did the system provide before the actual
cash-out event?"

Create temporal train/validation/test splits.

Never randomly split time-series data in a way that leaks future information.

Document:
- training period
- validation period
- test period
- feature availability timestamp
- prediction timestamp
- outcome timestamp

Prevent data leakage.

==================================================
13. SYNTHETIC FINANCIAL-CRIME SIMULATOR
==================================================

This is extremely important for the public/hackathon implementation.

Build a realistic simulator.

It should generate:

Normal users:
- salary
- bills
- shopping
- normal transfers
- normal withdrawals

Fraud scenarios:
- victim account compromise
- mule account
- rapid transfer
- multi-hop movement
- amount splitting
- aggregation
- wallet movement
- merchant movement
- cash-out behaviour

Generate:
- thousands of accounts
- tens/hundreds of thousands of transactions
- multiple geographic zones
- ATM locations
- realistic timestamps
- realistic distributions

Create explicit hidden ground truth:

For each synthetic fraud scenario:
- actual fraud path
- actual cash-out location
- actual cash-out timestamp

The prediction system MUST NOT receive the hidden ground truth.

This enables an honest demonstration:

Observed data
      ↓
TRACE X prediction
      ↓
Top-K predicted cash-out locations
      ↓
Reveal hidden ground truth
      ↓
Evaluate prediction
      ↓
Show lead time and metrics

This is the core demo validation mechanism.

Do not generate simplistic random Excel rows.

Use probabilistic behavioural generators and scenario templates.

==================================================
14. GIS RISK ENGINE
==================================================

Use PostGIS.

Support:
- ATM points
- administrative boundaries
- risk zones
- predicted hotspots
- historical hotspots
- transaction paths
- geographic filters

Risk heatmap must support:

- current risk
- predicted risk
- time window
- crime category
- state
- district
- city
- zone
- confidence
- historical comparison

Do not imply that a geographic area is inherently criminal.

Risk must refer to predicted transaction/cash-out activity under the
defined model and evidence.

==================================================
15. INVESTIGATOR DASHBOARD
==================================================

Create a professional intelligence dashboard.

Main views:

1. Command Overview
2. Active Cases
3. Risk Heatmap
4. Prediction Feed
5. Money Trail Explorer
6. Case Intelligence
7. Alerts
8. Evidence
9. Model Performance
10. Audit Logs

Main dashboard should show:

- active cases
- high-priority alerts
- predicted hotspots
- amount at risk
- prediction lead time
- recent interventions
- model health
- data freshness

Avoid decorative charts.

Every visualization must support a real operational decision.

==================================================
16. CASE MANAGEMENT
==================================================

Investigators should be able to:

- create/open case
- assign case
- view complaint
- inspect transaction graph
- view predictions
- acknowledge alerts
- add notes
- attach evidence metadata
- record actions
- record outcome
- close case

Every action must be audited.

Implement case lifecycle:

NEW
→ TRIAGED
→ INVESTIGATING
→ ACTION_RECOMMENDED
→ ACTIONED
→ OUTCOME_RECORDED
→ CLOSED

==================================================
17. ALERT ENGINE
==================================================

Implement policy-based alerting.

Alert conditions can combine:

- prediction probability
- confidence
- amount threshold
- lead time
- geographic risk
- case severity
- model agreement
- historical recurrence

Alert severity:

LOW
MEDIUM
HIGH
CRITICAL

Channels:
- dashboard
- internal API
- email/SMS adapters as mock implementations

Do not send real external notifications by default.

Build NotificationProvider interface:

NotificationProvider
  ├── MockProvider
  ├── EmailProvider
  ├── SMSProvider
  └── GovernmentGatewayProvider

Production providers must require explicit configuration.

==================================================
18. SECURITY ARCHITECTURE
==================================================

Treat security as a first-class subsystem.

Implement:

Authentication:
- OIDC/OAuth2
- short-lived access tokens
- refresh-token security
- MFA-ready design

Authorization:
- RBAC
- ABAC where appropriate

Roles example:

SUPER_ADMIN
NATIONAL_ANALYST
STATE_ANALYST
DISTRICT_INVESTIGATOR
BANK_PARTNER
AUDITOR
READ_ONLY_ANALYST

Enforce:
- least privilege
- resource-level authorization
- jurisdiction-aware access
- case-level authorization where appropriate

Do NOT trust frontend authorization.

Every sensitive authorization decision must be enforced server-side.

==================================================
19. DATA PROTECTION
==================================================

Classify data:

PUBLIC
INTERNAL
SENSITIVE
HIGHLY_SENSITIVE
RESTRICTED

Sensitive fields must support:
- encryption at rest
- encryption in transit
- masking
- tokenization/pseudonymization
- access logging

Never log:
- passwords
- tokens
- secrets
- full financial credentials
- unnecessary PII

Implement field-level masking where appropriate.

Example:

Account:
XXXXXX7812

not:

123456789012

==================================================
20. ZERO TRUST
==================================================

Design around Zero Trust principles.

Assume:
- network is hostile
- user identity must be continuously verified
- service identity must be verified
- internal traffic is not automatically trusted

Use:
- mTLS-ready architecture
- service identity
- network segmentation
- API authentication
- authorization at every boundary

==================================================
21. AUDIT & EVIDENCE
==================================================

Every sensitive operation should produce an audit event.

Audit fields:

- event_id
- timestamp
- actor
- role
- action
- resource
- case_id
- source_ip/device metadata where appropriate
- result
- correlation_id
- previous_event_hash
- event_hash

Build tamper-evident audit chaining.

Do NOT claim this is a legal blockchain chain-of-custody mechanism unless
the implementation actually provides the necessary guarantees.

For evidence:
- preserve metadata
- provenance
- source
- timestamps
- hash
- version
- access history

==================================================
22. BLOCKCHAIN / LEDGER USE
==================================================

Do not add blockchain just because the PS theme mentions Blockchain &
Cybersecurity.

The core PS is predictive analytics.

If a ledger is useful, use it specifically for:
- tamper-evident audit records
- evidence integrity
- integrity verification

Do NOT put sensitive transaction data directly on a public blockchain.

Prefer:
- append-only audit store
- hash chaining
- private/permissioned ledger only if genuinely justified

Document the tradeoff.

==================================================
23. AI SECURITY
==================================================

If LLMs are used anywhere:

- never allow LLM output to directly execute privileged actions
- validate all structured output
- protect against prompt injection
- isolate untrusted text
- prevent sensitive-data leakage
- apply output schemas
- maintain auditability
- do not expose hidden system information

LLMs can assist investigators with:
- case summarization
- explanation generation
- natural-language querying

but authoritative values must come from structured backend systems.

==================================================
24. THREAT MODEL
==================================================

Create a complete threat model.

Include threats such as:

- stolen investigator credentials
- privilege escalation
- insider misuse
- API abuse
- unauthorized data access
- data exfiltration
- malicious data ingestion
- model poisoning
- training-data poisoning
- data leakage
- adversarial manipulation
- alert flooding
- denial of service
- supply-chain attacks
- dependency compromise
- compromised service account
- audit-log tampering

Use STRIDE where useful.

For every high-risk threat define:
- attack surface
- impact
- likelihood
- mitigation
- residual risk

==================================================
25. API SECURITY
==================================================

Build versioned APIs.

Example:

/api/v1/auth
/api/v1/complaints
/api/v1/cases
/api/v1/transactions
/api/v1/entities
/api/v1/graph
/api/v1/predictions
/api/v1/hotspots
/api/v1/alerts
/api/v1/evidence
/api/v1/audit
/api/v1/models

Implement:

- request validation
- response schemas
- pagination
- rate limiting
- authorization
- idempotency where needed
- correlation IDs
- secure error responses
- OpenAPI documentation

Never expose internal stack traces to clients.

==================================================
26. RESILIENCE
==================================================

The platform must degrade gracefully.

Implement:

- health checks
- readiness checks
- liveness checks
- retries with exponential backoff
- circuit breakers where appropriate
- idempotent event handling
- dead-letter queues
- graceful degradation
- database connection pooling
- backup strategy
- disaster-recovery documentation

Prediction service failure must NOT crash the entire investigator platform.

If ML is unavailable:
- dashboard remains available
- existing predictions remain viewable
- system clearly indicates model availability status

==================================================
27. PERFORMANCE
==================================================

Design for scale.

The PS context references approximately 8,000 complaints/day.

Architecture should support significantly more than that through horizontal scaling.

Define targets for:
- API latency
- ingestion throughput
- prediction latency
- GIS query latency
- dashboard loading
- concurrent investigators

Do not invent meaningless "millions TPS" claims.

Create load-test scenarios based on realistic assumptions.

Document:
- baseline capacity
- scaling strategy
- bottlenecks
- caching strategy

==================================================
28. OBSERVABILITY
==================================================

Implement:

Metrics:
- request latency
- error rate
- ingestion rate
- queue lag
- prediction latency
- model confidence distribution
- alert generation rate
- database performance

Logs:
- structured JSON
- correlation IDs
- no sensitive values

Tracing:
- OpenTelemetry

Dashboards:
- application health
- data pipeline health
- ML health
- infrastructure health
- security events

==================================================
29. ML MONITORING
==================================================

Monitor:

- prediction drift
- feature drift
- data quality
- model performance
- calibration
- false-positive rate
- false-negative rate
- prediction coverage
- distribution changes

Model registry must track:
- model version
- training dataset version
- feature version
- training timestamp
- evaluation metrics
- approval status

No silent model replacement.

==================================================
30. DATA GOVERNANCE
==================================================

Create documentation covering:

- data classification
- data ownership
- data retention
- data minimization
- provenance
- access control
- deletion/anonymization strategy
- synthetic vs production data
- model training data lineage

For the public project:
explicitly state that synthetic data is used.

Production integration must be designed as a controlled deployment
with authorized data sources and applicable Indian legal/regulatory requirements.

Do not make unsupported claims of government certification/compliance.

==================================================
31. DEVELOPMENT ENVIRONMENTS
==================================================

Create three profiles:

development
staging
production

Development:
- synthetic data
- local Docker
- mock identity
- mock notifications

Staging:
- isolated environment
- realistic synthetic datasets
- security testing
- load testing

Production:
- private network
- government-controlled identity
- government-controlled secrets
- approved data connectors
- hardened infrastructure
- monitoring
- backups
- disaster recovery

The public repository must NEVER contain production credentials.

==================================================
32. CI/CD
==================================================

Create GitHub Actions workflows.

On pull request:

- formatting
- lint
- type checks
- unit tests
- integration tests
- dependency vulnerability scan
- secret scan
- SAST
- container scan
- SBOM generation

On main branch:
- build
- test
- container build
- security scan

Do not automatically deploy to production.

Production deployment must require explicit approval.

==================================================
33. TESTING
==================================================

Build serious tests.

Unit:
- domain logic
- feature engineering
- risk calculations

Integration:
- API/database
- event pipeline
- ML service
- graph service

Security:
- auth bypass
- IDOR
- privilege escalation
- injection
- rate limits
- malformed payloads

ML:
- leakage tests
- feature validation
- reproducibility
- baseline comparison

E2E:
Complaint
→ transaction graph
→ prediction
→ hotspot
→ alert
→ investigator action
→ outcome

Performance:
- ingestion load
- concurrent investigators
- prediction load
- GIS queries

==================================================
34. DEMONSTRATION MODE
==================================================

Create a dedicated Demo Console.

The demo must tell one complete story.

Example:

SCENARIO:
A victim reports a cyber fraud.

STEP 1
Complaint arrives.

STEP 2
TRACE X reconstructs the available money trail.

STEP 3
System identifies suspicious movement.

STEP 4
Prediction engine evaluates candidate cash-out locations.

STEP 5
System produces:

Top predicted location
Probability
Confidence
Time window
Supporting factors

STEP 6
GIS dashboard highlights the predicted hotspot.

STEP 7
Investigator receives alert.

STEP 8
Hidden simulator ground truth is revealed.

STEP 9
System compares prediction vs actual cash-out.

STEP 10
Show:
- Top-1 result
- Top-3 result
- lead time
- confidence
- model version
- explanation

This must be reproducible with one command.

Example:

make demo

or:

./scripts/run-demo.sh

==================================================
35. DEMO MUST NOT CHEAT
==================================================

The simulator's actual cash-out location must never be exposed to the
prediction service before prediction time.

Do not:
- hardcode the answer
- leak ground truth into features
- select the nearest ATM automatically
- manufacture fake accuracy
- modify predictions after the outcome
- display fabricated model metrics

Include automated tests that verify the prediction pipeline cannot access
hidden ground truth.

==================================================
36. USER EXPERIENCE
==================================================

The UI should feel like a serious intelligence platform.

Visual language:
- professional
- information-dense
- restrained
- accessible
- fast

Avoid:
- excessive animations
- gaming aesthetics
- fake hacker visuals
- unnecessary neon
- generic AI chatbot UI

Prioritize:
- map
- timeline
- transaction graph
- evidence
- risk
- confidence
- action

An investigator should understand a case within seconds.

==================================================
37. DOCUMENTATION
==================================================

Generate:

README.md

docs/architecture/system-architecture.md
docs/architecture/data-flow.md
docs/architecture/deployment.md

docs/security/security-architecture.md
docs/security/threat-model.md
docs/security/incident-response.md

docs/ml/model-card.md
docs/ml/evaluation.md
docs/ml/data-leakage-prevention.md

docs/data-governance/data-classification.md
docs/data-governance/data-lineage.md

docs/api/api-reference.md

docs/demo/demo-script.md

docs/demo/judge-questions.md

docs/deployment/production-hardening.md

Also generate:
- architecture diagrams
- sequence diagrams
- ER diagram
- transaction graph model
- ML pipeline diagram
- threat model diagram
- deployment diagram

Use Mermaid where practical.

==================================================
38. ARCHITECTURE DECISION RECORDS
==================================================

Create ADRs for major decisions.

Examples:

ADR-001 PostgreSQL + PostGIS
ADR-002 Graph Database Decision
ADR-003 Event Streaming
ADR-004 ML Model Strategy
ADR-005 Synthetic Data Strategy
ADR-006 Authentication
ADR-007 Audit Architecture
ADR-008 Blockchain vs Append-Only Ledger
ADR-009 Modular Monolith vs Microservices
ADR-010 Public Repository Security Boundary

Every ADR must explain:
- context
- decision
- alternatives
- consequences

==================================================
39. CODE QUALITY
==================================================

Follow professional engineering standards.

Requirements:
- strong typing
- clear module boundaries
- dependency inversion where useful
- SOLID principles where appropriate
- meaningful naming
- no giant files
- no magic constants
- configuration via environment/config
- structured errors
- no dead code
- no fake TODO architecture everywhere

Do not over-engineer.

Prefer simple, correct implementations over elaborate abstractions.

==================================================
40. PUBLIC GITHUB SAFETY
==================================================

Before writing anything:

Create:

SECURITY.md
CONTRIBUTING.md
CODEOWNERS

Add:
- .gitignore
- .env.example
- pre-commit configuration
- secret scanning configuration

The repository must pass a secret scan.

Create an explicit:

PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md

It must explain:
what is safe to publish
what must remain private
how production connectors are separated

==================================================
41. IMPLEMENTATION PHASES
==================================================

Do NOT try to build the entire system blindly in one pass.

Execute in phases.

PHASE 0:
Repository and architecture foundation.

PHASE 1:
Domain model + database + synthetic data generator.

PHASE 2:
Complaint ingestion + transaction ingestion.

PHASE 3:
Transaction graph + money trail.

PHASE 4:
Baseline prediction engine.

PHASE 5:
Advanced predictive model + evaluation.

PHASE 6:
GIS risk heatmap.

PHASE 7:
Investigator case management.

PHASE 8:
Alert engine.

PHASE 9:
Security hardening.

PHASE 10:
Observability.

PHASE 11:
End-to-end demo.

PHASE 12:
Performance/security/ML validation.

PHASE 13:
Documentation and final review.

After every phase:
- run tests
- verify architecture
- update documentation
- ensure no secrets
- commit-ready state

==================================================
42. CLAUDE CODE WORKING RULES
==================================================

You are operating as the principal engineer.

Do not ask me to make obvious implementation decisions.

Make technically defensible decisions yourself.

However:
If a requirement is genuinely ambiguous and choosing incorrectly would
materially change the architecture, document the assumption and choose the
least risky reversible option.

Before implementing:
1. inspect repository
2. create architecture plan
3. create ADRs
4. create initial directory structure
5. create development environment
6. implement incrementally

Do not generate thousands of lines of low-quality code immediately.

Build vertical slices.

Each slice must be runnable.

After implementation:
- run tests
- run static analysis
- run security checks
- run the demo
- inspect failures
- fix them
- update docs

==================================================
43. FINAL ACCEPTANCE CRITERIA
==================================================

The project is considered successful only when:

1. A synthetic complaint can enter the system.

2. The complaint can be linked to synthetic transactions.

3. A transaction graph can reconstruct the money trail.

4. The system can identify suspicious behavioural patterns.

5. The prediction engine can rank likely cash-out locations.

6. Predictions include probability/confidence and explanations.

7. GIS displays predicted hotspots.

8. Investigators can open a case and inspect the trail.

9. Alerts can be generated.

10. Hidden simulator ground truth can validate the prediction.

11. Metrics are calculated honestly.

12. No future-data leakage exists.

13. Authentication and authorization work.

14. Sensitive data is protected.

15. Audit events are generated.

16. The system survives prediction-service failure gracefully.

17. Observability is available.

18. CI security checks pass.

19. Public repository contains no secrets or real sensitive data.

20. The entire demo can be reproduced from a clean environment.

==================================================
44. MOST IMPORTANT ENGINEERING PRINCIPLE
==================================================

Do not optimize for how impressive the architecture diagram looks.

Optimize for this:

Can an investigator receive a cybercrime complaint,
understand the money trail,
receive a defensible prediction of likely cash-out locations,
understand WHY those locations were predicted,
act on the intelligence,
and later verify whether the prediction was correct?

If the answer is yes, TRACE X solves the actual problem.

Build for correctness first.
Security second.
Explainability third.
Scalability fourth.
Visual polish after the core system works.

Start now.

First inspect the repository and produce:

1. Architecture overview
2. Technology decision matrix
3. Repository structure
4. Threat model outline
5. Domain model
6. Data model
7. ML pipeline
8. Development roadmap
9. Initial implementation plan

Then begin Phase 0 and Phase 1.

Do not stop at documentation.
Create the actual runnable foundation.