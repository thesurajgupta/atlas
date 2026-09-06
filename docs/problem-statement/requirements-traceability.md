# Requirements Traceability — SIH26184

Every clause of the official problem statement, mapped to the module that implements it and the test
that proves it. Source of truth for the clauses: `SIH26184-official.md` (verbatim).

**Rule:** a clause is not "done" because code exists. It is done when the Test ID passes in CI.
`docs/ATLAS_MASTER_SPEC.md` §49 criterion 21 makes this a release gate.

Status: `PLANNED` → `IN_PROGRESS` → `IMPLEMENTED` → `VERIFIED` (test green in CI).

## Deliverable (a) — Predictive Analytics Engine

> "AI/ML-based system to analyse historical cybercrime and financial data to predict potential
> withdrawal hotspots. Features include pattern detection, geospatial risk modelling, and real-time alerts."

| Clause | Module | Test ID | Status |
|---|---|---|---|
| Analyse historical cybercrime data | `atlas.ingest`, `atlas.complaints` | `INT-ING-001` | PLANNED |
| Analyse financial data / money trail | `atlas.graph` | `INT-GRAPH-001` | IMPLEMENTED |
| **Predict potential withdrawal hotspots** | `atlas.predict` Tier 1 | `ML-T1-PAI-001` | PLANNED |
| Pattern detection | `atlas.features`, `atlas.predict` Tier 3 | `ML-T3-PRAUC-001` | PLANNED |
| Geospatial risk modelling | `atlas.geo` | `INT-GEO-001` | PLANNED |
| Real-time alerts | `atlas.alerts` | `E2E-ALERT-001` | PLANNED |
| *(implied)* Prediction must be honest | evaluation harness | `LEAK-001/002/003` | PLANNED |

## Deliverable (b) — Risk Heatmap Dashboard

> "GIS-enabled dashboard visualizing real-time and potential risk zones with drill-down filters by
> time, location, and crime category etc."

| Clause | Module | Test ID | Status |
|---|---|---|---|
| GIS-enabled dashboard | `apps/web`, `atlas.geo` | `E2E-MAP-001` | PLANNED |
| Visualise **real-time** risk zones | `atlas.geo` current-risk layer | `INT-GEO-002` | PLANNED |
| Visualise **potential** (predicted) risk zones | `atlas.predict` Tier 1 → `atlas.geo` | `INT-GEO-003` | PLANNED |
| Drill-down by **time** | window selector 6h/24h/72h | `UI-FILTER-001` | PLANNED |
| Drill-down by **location** | state/district/cell hierarchy | `UI-FILTER-002` | PLANNED |
| Drill-down by **crime category** | typology filter | `UI-FILTER-003` | PLANNED |
| *(spec §24)* Uncertainty rendered, not hidden | `apps/web` | `UI-CONF-001` | PLANNED |

## Deliverable (c) — Law Enforcement Interface

> "Secure interface for investigators to access alerts, intelligence reports, and evidence documentation."

| Clause | Module | Test ID | Status |
|---|---|---|---|
| **Secure** interface | `atlas.iam` | `SEC-AUTH-001..00n` | PLANNED |
| Access alerts | `atlas.alerts`, `apps/web` | `E2E-ALERT-002` | PLANNED |
| Access intelligence reports | `atlas.intel`, `atlas.cases` | `E2E-CASE-001` | PLANNED |
| Evidence documentation | `atlas.cases` evidence refs | `INT-EVID-001` | PLANNED |
| *(implied)* Jurisdiction scoping | `atlas.iam` | `SEC-JURIS-001` | PLANNED |
| *(implied)* Every action audited | `atlas.audit` | `INT-AUDIT-001` | PLANNED |

## Deliverable (d) — Alert & Notification System

> "Real-time notifications to law enforcements, banks, and I4C officers via SMS, email, API, or
> dashboard triggers."

| Clause | Module | Test ID | Status |
|---|---|---|---|
| Notify **law enforcement** | `atlas.alerts` | `E2E-ALERT-001` | PLANNED |
| Notify **banks** | `atlas.intel` bank package | `E2E-INTEL-001` | PLANNED |
| Notify **I4C officers** | `atlas.alerts` national scope | `E2E-ALERT-003` | PLANNED |
| Channel: SMS | `SMSProvider` (mock default) | `INT-NOTIF-001` | PLANNED |
| Channel: email | `EmailProvider` (mock default) | `INT-NOTIF-002` | PLANNED |
| Channel: **API** | signed webhook + pull API | `INT-INTEL-002` | PLANNED |
| Channel: dashboard triggers | `apps/web` | `E2E-ALERT-002` | PLANNED |

## Clauses from Background & Description — the ones the original brief dropped

These are the highest-risk rows in this document. Each was absent from `docs/archive/original-brief.md`.

| Official clause | Module | Test ID | Status |
|---|---|---|---|
| "enable the prediction of likely cash withdrawal locations" | `atlas.predict` Tier 2 | `ML-T2-RECALL-001` | PLANNED |
| "**in advance**" → lead time is the operational metric | evaluation harness | `ML-LEADTIME-001` | PLANNED |
| "LEAs **at the state and local levels, coordinated by I4C**" → federated jurisdiction tree | `atlas.iam` | `SEC-JURIS-001` | PLANNED |
| "**deploying special teams**" → typed intervention `DEPLOY_TEAM` | `atlas.cases` | `INT-CASE-INTV-001` | PLANNED |
| "**alerting local banks**" → `ALERT_LOCAL_BANK` | `atlas.cases`, `atlas.intel` | `INT-CASE-INTV-002` | PLANNED |
| "**and ATMs in high-risk areas**" → `ALERT_ATM_OPERATOR` | `atlas.cases` | `INT-CASE-INTV-003` | PLANNED |
| "help banks and FIs **through the CFCFRMS**" | `atlas.intel` CFCFRMS-shaped package | `E2E-INTEL-001` | PLANNED |
| "enabling **faster fund blocking**" → time-to-fund-block measured | evaluation harness | `ML-FUNDBLOCK-001` | PLANNED |
| "**increasing the chances of recovery**" → recovery rate measured | evaluation harness | `ML-RECOVERY-001` | PLANNED |
| "real-time actionable intelligence sharing **across jurisdictions**" | `atlas.intel` hand-off | `E2E-INTEL-002` | PLANNED |
| "~8000 complaints on daily basis" + "will continue to rise" → 5× headroom | load test | `PERF-INGEST-001` | PLANNED |
| "goes beyond merely reacting to complaints" → forward-looking, not reactive | `atlas.predict` | `ML-T1-PAI-001` | PLANNED |

## Capabilities added after the reference-systems study

These derive from studying how mature financial-crime platforms and national financial-intelligence
ecosystems actually work (`docs/architecture/reference-systems-and-design.md`). Each traces back to a
clause above that it strengthens — none is scope creep.

| Capability | Serves which official clause | Module | Test ID | Status |
|---|---|---|---|---|
| Intelligence funnel with conversion at all four hops | "actionable intelligence" — measures whether it was actioned | evaluation harness | `ML-FUNNEL-001` | PLANNED |
| Investigative-utility metrics | "faster fund blocking", "chances of recovery" | evaluation harness | `ML-UTILITY-001` | PLANNED |
| Entity resolution, versioned and point-in-time correct | "analyse historical cybercrime and financial data" | `atlas.entity` | `INT-ENT-001` | PLANNED |
| Point-in-time entity join (leakage gate 4) | honest prediction; guards `ML-*` | `atlas.entity`, `atlas.features` | `LEAK-004` | PLANNED |
| Dynamic risk for all entity types | "pattern detection" | `atlas.entity` | `ML-ENTRISK-001` | IMPLEMENTED |
| Artefact nodes in the graph | "intelligence sharing across jurisdictions" | `atlas.graph` | `INT-GRAPH-002` | IMPLEMENTED |
| Artefact edges excluded from features | honest prediction | `atlas.graph` | `LEAK-005` | IMPLEMENTED |
| Alert decisions persisted, suppressions included with their reason | "real-time alerts"; alert-fatigue control (§35.1) | `atlas.alerts` | `INT-ALERT-001` | IMPLEMENTED |
| Network case grouping with quantitative reason | proactive intervention at scale; alert-fatigue control | `atlas.alerts` | `INT-GROUP-001` | PLANNED |
| Grouping is human-accepted and splittable | jurisdictional ownership integrity | `atlas.cases` | `INT-GROUP-002` | PLANNED |
| Recommended next step with reason | "proactive interventions" | `atlas.cases` | `INT-CASE-NEXT-001` | PLANNED |
| Certification block on every package | lawful sharing with banks/FIs and across jurisdictions | `atlas.intel` | `SEC-CERT-001` | PLANNED |
| Expired package refused by recipient adapter | proportionate, time-bounded authority | `atlas.intel` | `SEC-CERT-002` | PLANNED |
| Bidirectional response channel | "faster fund blocking", "chances of recovery" | `atlas.intel` | `E2E-INTEL-003` | PLANNED |
| `ACTED` vs `ALREADY_ACTIONED` separated in reporting | distinguishes ranking failure from lead-time failure | evaluation harness | `ML-LEADTIME-002` | PLANNED |
| Outcome digest to recipients | "enhancing coordination between law enforcement and financial entities" | `atlas.intel` | `E2E-INTEL-004` | PLANNED |
| Typology advisory requires human review | prevents automated publication naming a district | `atlas.intel` | `SEC-ADVISORY-001` | PLANNED |
| Response-channel poisoning resistance | model integrity under a compromised recipient | `atlas.intel` | `SEC-POISON-001` | PLANNED |
| Evidence sufficiency changes UI rendering | honest presentation of uncertainty | `apps/web` | `UI-CONF-002` | PLANNED |

## Theme obligation

| Obligation | Module | Test ID | Status |
|---|---|---|---|
| Theme: **Blockchain &** Cybersecurity → cryptographic integrity where justified | `atlas.audit` hash chain + signed checkpoints | `SEC-AUDIT-CHAIN-001` | PLANNED |
| Rationale for *not* using a blockchain is documented | `docs/adr/ADR-008` | doc review | PLANNED |
| Theme: Blockchain & **Cybersecurity** | full `tests/security/` suite | `SEC-*` | PLANNED |

## Coverage check

`scripts/check_traceability.py` fails CI if any row is missing a Test ID, or if a referenced Test ID
does not exist in the test suite. A clause with no test is a clause we have not delivered.
