# Reference Systems & ATLAS Design

**What we take from NICE Actimize and the FinCEN/FBI ecosystem, and what ATLAS becomes as a result.**

Scope note: these systems are studied as **architectural and UX references only**. No proprietary code,
branding, private implementation detail or pixel-level UI is reproduced. Everything below is drawn from
public product material, public regulatory documentation, and publicly circulated product screenshots.

---

## 1. What we can learn from NICE Actimize

Actimize is the mature commercial expression of "financial crime investigation at institutional scale".
Eleven lessons, ordered by how much they change our design.

### 1.1 Alert, Case and Filing are three different objects — and the funnel between them is the product

Their AML dashboard leads with a funnel, not a model metric:

```
1,533 Total Alerts → 365 Escalated to Cases → 172 Escalated to SAR/CTF/8300 filings
```

That is a **24% alert→case rate and a 47% case→filing rate**, displayed as the primary KPI row. The
system is measured by how much of what it surfaces turns out to be worth acting on.

This is the single most important structural lesson for ATLAS. Our current spec has predictions,
alerts and cases, but it measures *model* quality (PAI, Recall@K) rather than *operational* quality.
An I4C evaluator cares about both, and the second one more.

**ATLAS adopts:** `Prediction → Alert → Case → Intelligence Package → Outcome` as four distinct
objects with measured conversion at every hop. A prediction that never becomes an alert, an alert
never opened, a case that produces no intervention — each is a distinct, nameable failure. Precision
is not one number; it is a funnel.

### 1.2 The system is entity-centric, not transaction-centric

Actimize's stated approach is "entity-centric AML", with **Entity Risk** assigning a dynamic,
ML-derived score to every entity so analysts can prioritise. Entity resolution is the backbone, and
risk is a property of the resolved entity that changes over time.

**ATLAS adopts:** entity resolution is promoted from a supporting module to a first-class subsystem,
and **every** entity — account, endpoint, device, beneficiary, BC agent — carries a versioned dynamic
risk score with history, not just mule accounts. Our Tier 3 becomes a general entity-risk service
rather than a single mule classifier.

### 1.3 Alerts and cases are themselves nodes in the link graph

This is the subtlest and most valuable idea in their Link Analysis view. The graph contains
`Person`, `Address`, `Phone Number`, `Identification Document`, `Account`, `Institution` — **and also
`Alert` and `Case` nodes**, joined by edges labelled `Linked-alert`, `Related to`, `Linked account`,
`Subject`.

The consequence: an investigator can see that *this alert is connected to that case from four months
ago through a shared phone number*. Investigative artefacts become part of the evidence graph.

**ATLAS adopts:** the graph is not merely accounts and endpoints. `Complaint`, `Case`, `Alert`,
`Prediction` and `Intervention` are node types. This directly serves a stated PS requirement —
cross-jurisdiction sharing becomes traversable: *"a case in Jamtara is linked to your Delhi complaint
through this endpoint"*.

### 1.4 Typed nodes, typed edges, labelled relationships

Nodes are colour-coded by type and edges are **labelled with the relationship** (`Holds`, `Ownership`,
`Holder`, `Subject`, `Branch`). An untyped grey hairball is not an intelligence product.

**ATLAS adopts:** a closed, documented node/edge type vocabulary. Edge labels render on the graph.
Colour encodes type; saturation encodes risk; **never both on the same channel**.

### 1.5 Progressive disclosure is mandatory

Their view instructs: "CLICK to expand the graph", with `+`/`−` affordances per node. The full graph is
never rendered.

**ATLAS adopts:** the money trail opens at the case's own subgraph. Expansion is explicit, per node,
and capped. A view that renders 50,000 nodes has told the investigator nothing.

### 1.6 A consistent tab anatomy, with Audit always present

Every work item carries the same tabs: **Summary · Transactions · Link Analysis · Audit**.

Audit being a permanent, co-equal tab — not a settings screen — is a statement about the product's
purpose. Investigative actions are reviewable by default.

**ATLAS adopts:** every case, alert and prediction gets
**Summary · Money Trail · Graph · Prediction & Why · Evidence · Audit**, in that order, always.

### 1.7 A persistent header fact-strip

Their investigation workspace pins a strip of orienting facts above everything: Item Type, Alert
Category, Item Date, Party Key, Party Name, Issues, Score, Business Unit.

**ATLAS adopts:** a pinned strip carrying **Case ID · Typology · Complaint Time · Amount at Risk ·
Golden-Hour Position · Predicted Window · Top Candidate · Evidence Sufficiency · Model Version**.
Golden-hour position belongs here because it is the fact that determines whether anything else matters.

### 1.8 The system proposes the next step

A "Next steps" control drives the workflow, described as "data-driven, risk-calibrated". The system
does not merely store a case; it recommends what to do with it.

**ATLAS adopts:** every case surfaces a ranked, *typed* next action (§26 intervention types) with the
reason it is recommended. The investigator always overrides freely, and the override is recorded — it
is training signal.

### 1.9 Recommended case groupings — alert consolidation as a feature

Their dashboard shows "3 RECOMMENDED CASE GROUPINGS" with quantitative reasons:

> *Transactions exceed $20,000 within 14 days* · *Sent 20 or more transactions between $500 and $5,000
> within 28 days* · *100% increase in transaction amounts over the last 3 days*

The system proposes merging related alerts into one case, and **states its reason numerically**.

This matters more for ATLAS than for them. A single mule network generates dozens of correlated
complaints across multiple states. Presenting those as 40 separate alerts is how you cause the alert
fatigue our own spec identifies as a threat.

**ATLAS adopts:** a **Network Case Grouping** service that proposes consolidating complaints sharing a
mule cluster, an endpoint or a typology signature — with a quantitative reason string and a one-click
merge that preserves each complaint's jurisdictional ownership.

### 1.10 Reasons are quantitative and human-readable

Not "suspicious activity". Instead: *"Sent 20 or more transactions between $500 and $5,000 within 28
days."* A number, a threshold, a window.

**ATLAS adopts:** every alert reason, grouping reason and contributing factor renders as a sentence
containing a quantity and a window. SHAP values are translated into this form, never shown raw to an
investigator.

### 1.11 Restrained, information-dense visual design

Light background, small type, dense tables, generous data-ink, colour used **semantically and
sparingly**. Regional distribution shown as a **treemap** rather than a map, because the task there is
comparing volumes across jurisdictions — a choropleth would hide small, high-volume districts.

**ATLAS adopts:** this confirms master spec §25. It also gives us a specific rule: **the map is for
"where", the treemap is for "how much"**. We need both, and they answer different questions.

---

## 2. What we can learn from FinCEN / the FBI ecosystem

FinCEN is the closest existing analogue to what I4C is building toward, and the structural parallels
are close enough to be directly instructive.

### 2.1 The intermediary model — and why it is the right shape for I4C

FinCEN sits **between** law enforcement and roughly 16,000 financial institutions (~37,000 points of
contact). Under §314(a), an LEA does not query banks directly: it certifies a request to FinCEN,
FinCEN fans it out, institutions search their records, responses return through FinCEN.

The PS describes exactly this topology — LEAs "at the state and local levels, **coordinated by I4C**",
with intelligence reaching banks "**through** the CFCFRMS".

**ATLAS adopts:** ATLAS is explicitly an **I4C-mediated layer**. It never holds a direct bank
connection, and `atlas.intel` is modelled as a request/response fan-out through a coordinating
authority — not as point-to-point API calls to banks. This is both the legally correct shape and the
architecturally correct one.

### 2.2 §314(a) gives us a proven workflow for outbound intelligence

The 314(a) pattern is: **certified request → scoped fan-out → bounded record search → response →
retention limits → full audit**. Certification is what makes the request lawful; scoping is what keeps
it proportionate.

**ATLAS adopts:** the outbound intelligence package carries a **certification block** — requesting
officer, jurisdiction, legal basis, case reference, scope, expiry. No package leaves without one. This
turns "we send an alert to a bank" into a defensible legal artefact, and it is the kind of detail an
I4C evaluator will notice immediately.

### 2.3 §314(b) shows that sharing needs a liability position, not just an API

Institution-to-institution sharing works because §314(b) provides a **statutory safe harbour** from
civil liability. Banks share because the legal exposure of sharing is bounded.

**ATLAS adopts:** our cross-jurisdiction and bank-facing design documents the **legal basis and
liability position** for each flow, not merely the payload schema. A sharing mechanism without a
liability answer will not be adopted, however good the API.

### 2.4 FinCEN Exchange: feedback to the filer is what makes the ecosystem work

FinCEN convenes regular briefings that tell institutions which reports mattered and what current
threats look like. Institutions get better because they learn what was useful.

**This is the biggest single gap in our current design.** Our `atlas.intel` is one-way: ATLAS → bank.
Nothing flows back, so banks never learn which of our notices led to a recovery.

**ATLAS adopts:** intelligence flow becomes **bidirectional**. Every package carries a response
channel (`acted / not acted / already frozen / false positive`) and, at intervals, ATLAS publishes an
**outcome digest** and a **typology advisory** derived from its own data. This closes the loop for
model retraining *and* it is exactly the mechanism the PS gestures at with "enhancing coordination
between law enforcement and financial entities".

### 2.5 "Data collection, not form design"

FinCEN's modernised system is explicitly described as driven by data collection rather than form
design — the canonical data model comes first, forms are views onto it.

**ATLAS adopts:** confirms our canonical complaint schema approach. Forms and connectors are
projections; the schema is authoritative.

### 2.6 Standardised, thresholded, machine-readable report types

CTR at a $10,000 threshold; SAR for suspicious activity including structuring. Standardised,
mandatory, machine-readable — which is precisely what makes national-scale analytics possible.

**ATLAS adopts:** a standardised, versioned **Cash-Out Risk Notice** schema as the unit of outbound
intelligence, with defined severity thresholds. Ad-hoc payloads do not scale to 8,000 complaints/day.

### 2.7 Measure investigative utility, not just model accuracy

The public figures that justify BSA data are *utility* figures: roughly 32% of FBI Complex Financial
Crime Program cases linked to SAR/CTR data; HSI running on the order of 290,000 BSA-related queries in
a year. Nobody quotes an AUC.

**ATLAS adopts — and this materially extends our evaluation contract:** alongside PAI, Recall@K and
lead time, we report **investigative utility**:

- share of cases where ATLAS intelligence was cited in the action taken;
- alert→case and case→intervention conversion (§1.1);
- **time-to-fund-block** and **recovery rate** (already required by the PS);
- analyst-hours saved per case.

### 2.8 Query-level audit on a national dataset

Access to BSA data is logged and audited per query. This independently confirms the control set we
designed for threat T-01 (prediction-API abuse to locate *unwatched* endpoints) and raises its priority.

### 2.9 Published typologies and red-flag advisories

FinCEN publishes red-flag indicators so institutions can detect patterns themselves.

**ATLAS adopts:** ATLAS generates typology advisories from its own corpus — *"AePS cash-out through
BC agents in district X shows a new pattern: N agents, ₹Y, Z-hour window"* — as a scheduled,
human-reviewed product. Human-reviewed, because an automatically published advisory naming a district
is a serious action (spec §2, §3).

---

## 3. Capabilities ATLAS should have

Grouped by layer. **Bold** entries are new or materially upgraded as a result of this study.

**Ingestion & normalisation** — complaint intake (NCRP/1930/CFCFRMS-shaped connectors) · transaction
feed · endpoint registry (ATM, AePS/BC, branch, merchant) · canonical schema · dedup · provenance ·
data-quality gates · `observed_at` stamping.

**Entity intelligence** — **entity resolution as a first-class subsystem** · **dynamic risk score for
every entity type, versioned with history** · mule-account assessment · **BC-agent risk** ·
beneficiary and device linkage.

**Money-flow reconstruction** — multi-hop time-respecting traversal · splitting/aggregation detection ·
velocity · fan-in/fan-out · cross-state movement · confidence and provenance on every edge.

**Graph intelligence** — **complaints, cases, alerts, predictions and interventions as graph nodes** ·
community detection · centrality · motif detection · **cross-jurisdiction linkage discovery** ·
progressive expansion.

**Prediction** — Tier 1 zone risk forecast · Tier 2 case-conditioned endpoint ranking + hazard model ·
Tier 3 entity/endpoint risk · calibrated probabilities · SHAP explanations · evidence-sufficiency
banding · point-in-time correctness.

**Geospatial** — H3 lattice risk surface · endpoint layer · jurisdiction boundaries · predicted vs
historical hotspots · **treemap volume view alongside the map** · drill-down by time/location/category.

**Alerting** — policy engine · severity · per-jurisdiction budgets · deduplication · suppression ·
escalation · **network case grouping with quantitative reasons**.

**Case management** — lifecycle · assignment · **system-recommended next step** · typed interventions ·
evidence references · **merge/split with jurisdictional ownership preserved** · outcome recording.

**Outbound intelligence** — **certified request block (§314(a) pattern)** · CFCFRMS-shaped bank
package · cross-jurisdiction hand-off with receipt · **bidirectional response channel** ·
**outcome digest and typology advisory** · signed webhooks with replay protection.

**Security & assurance** — OIDC + MFA · RBAC/ABAC with jurisdiction scoping · **per-analyst query
budgets and negative-space query restriction** · break-glass · append-only hash-chained audit with
externally signed checkpoints · full leakage control.

**Evaluation & monitoring** — PAI/PEI · Recall@K · lead-time distribution · calibration ·
**funnel conversion** · **investigative utility** · drift · fairness disparity · feedback-loop control
cells.

---

## 4. Proposed system architecture

Modular monolith, one deployable API, thirteen bounded contexts, one PostgreSQL schema per module,
boundaries enforced in CI by `import-linter` (ADR-009). This is unchanged by the reference study — if
anything it is reinforced, because Actimize's own value proposition is *consolidation* into a single
workspace, not fragmentation into services.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  CONSUMERS                                                                   │
│  Investigator Web · Admin · Bank Portal · Demo Console · Outbound API        │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │  OIDC + MFA · RBAC/ABAC · jurisdiction scope
                                │  rate limits · QUERY BUDGETS (threat T-01)
┌───────────────────────────────▼──────────────────────────────────────────────┐
│  API LAYER — FastAPI, versioned /api/v1, OpenAPI-generated                    │
├──────────────────────────────────────────────────────────────────────────────┤
│  DELIVERY            atlas.alerts        atlas.intel        atlas.cases       │
│                      policy · budgets    certified pkg      lifecycle         │
│                      dedup · grouping    bank + juris       typed actions     │
│                      escalation          BIDIRECTIONAL      next-step engine  │
├──────────────────────────────────────────────────────────────────────────────┤
│  INTELLIGENCE        atlas.predict       atlas.geo                            │
│                      T1 zone forecast    H3 surface · treemap                 │
│                      T2 rank + hazard    jurisdiction rollup                  │
│                      T3 entity risk      hotspot compare                      │
├──────────────────────────────────────────────────────────────────────────────┤
│  ANALYSIS            atlas.features      atlas.graph        atlas.entity      │
│                      point-in-time       trail · motifs     resolution        │
│                      as-of joins         ARTEFACT NODES     dynamic risk      │
├──────────────────────────────────────────────────────────────────────────────┤
│  INTAKE              atlas.ingest        atlas.complaints                     │
│                      connectors · DQ     canonical schema · golden hour       │
├──────────────────────────────────────────────────────────────────────────────┤
│  FOUNDATION          atlas.iam           atlas.audit        atlas.core        │
│                      identity · scope    hash chain +       config · clock    │
│                      break-glass         signed checkpoints errors · types    │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────────────┐
│  DATA — PostgreSQL 16 · PostGIS · H3 · TimescaleDB · one schema per module    │
│         Redis: cache · rate limit · event bus (Streams)                       │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  schema `truth` — simulator ground truth. NO GRANT to app or features. │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
        ▲                                                          │
        │  synthetic only, isolated role                           │  certified,
   ┌────┴─────────┐                                    ┌───────────▼──────────┐
   │  simulator   │  NOT importable by serving path    │  I4C-mediated        │
   │  typologies  │                                    │  fan-out to banks    │
   │  truth       │                                    │  + jurisdictions     │
   └──────────────┘                                    └──────────────────────┘
```

Two structural points worth defending out loud:

- **`truth` is a database-level boundary, not a coding convention.** The role the prediction path
  authenticates as has no grant on that schema.
- **`atlas.intel` is the only egress.** Everything leaving ATLAS is a certified, schema-versioned,
  signed, audited package. There is no second door.

---

## 5. Recommended tech stack

Unchanged from the master spec — the reference study did not surface a reason to alter it — with the
additions noted.

| Layer | Choice | Rationale |
|---|---|---|
| Database | PostgreSQL 16 + **PostGIS + h3-pg + TimescaleDB** | One transactional store. **Verified working, native arm64.** ADR-001 |
| Graph | Recursive CTEs + materialised adjacency | Trails are 3–8 hops. ADR-002 |
| Cache / bus | Redis + Streams | ~0.1 events/sec mean. Kafka is 3 orders of magnitude of over-provision. ADR-003 |
| API | FastAPI · Pydantic v2 · SQLAlchemy 2.0 async · Alembic | Schema validation at the boundary is a security control here |
| Web | Next.js · TypeScript · Tailwind | |
| Map | MapLibre GL + **deck.gl H3HexagonLayer** | Renders large H3 surfaces at interactive rates; open and self-hostable for air-gapped deployment |
| Graph UI | **Cytoscape.js** | Typed nodes, labelled edges, incremental expansion, deterministic layouts — the specific needs from §1.3–1.5 |
| Charts | ECharts (incl. **treemap**) | §1.11 |
| ML | scikit-learn · LightGBM/XGBoost (LambdaMART) · lifelines · SHAP | Ranking + survival + explanation |
| Identity | Built-in OIDC-shaped provider; Keycloak adapter | ADR-006 |
| Audit | Hash chain + externally signed checkpoints | ADR-007/008. **No blockchain** |
| Observability | OpenTelemetry · Prometheus · Grafana | Optional compose profile |

Deliberately **not** adopted: Neo4j (ADR-002), Kafka (ADR-003), any blockchain (ADR-008), and a
microservice split (ADR-009). Each has a written rationale and a stated revisit trigger.

---

## 6. How the predictive cash-out engine should work

Three tiers, reported separately, never blended into one flattering number.

```
Complaint (t0)
   │
   ├─► Money-trail reconstruction ──► entity resolution ──► entity risk (T3)
   │
   ├─► Point-in-time feature store   [as_of = now; nothing later is readable]
   │
   ├─► TIER 1  Zone risk forecast                    ── always available
   │      Hawkes self-excitation baseline → LightGBM on cell × time
   │      P(≥1 fraud-linked cash-out in H3 cell c during [T, T+Δ]), Δ ∈ 6/24/72h
   │      Metrics: PAI · PEI · PEI* · hit-rate @ area%
   │
   ├─► TIER 2  Case-conditioned endpoint ranking     ── evidence-gated
   │      Stage A  RECALL — 5-rung candidate ladder
   │               1 account's own endpoint history
   │               2 endpoints of the mule cluster
   │               3 endpoints near KYC district
   │               4 endpoints in top Tier-1 cells      ◄─ never empty
   │               5 endpoints matching typology signature
   │      Stage B  RANK — LambdaMART over (case, candidate)
   │               hard negatives from the same recall set, distance-stratified
   │      Stage C  WHEN — discrete-time hazard model → predicted window
   │      Stage D  CALIBRATE — isotonic; ECE < 0.10 or it is not called a probability
   │      Metrics: Recall@{1,3,5,10} · hit-within-radius · lead time · ECE
   │
   └─► TIER 3  Entity & endpoint risk                ── always available
          mule-likelihood · endpoint cash-out-infrastructure score · BC-agent churn
          Metrics: PR-AUC · precision @ alert budget
```

**Evidence sufficiency governs honesty.** Which recall rungs fired determines the band —
`STRONG / MODERATE / WEAK / INSUFFICIENT` — and `INSUFFICIENT` emits **no ranked candidates at all**,
returning the Tier 1 forecast alone. The band is in the payload, and it changes how the UI renders.

**Three leakage gates**, each verified by deliberately breaking it: point-in-time as-of joins ·
`truth` schema with no grant · CI import isolation + temporal-shuffle + planted canary.

**The headline result is uplift over a strong baseline** (historical frequency + recency; Hawkes for
Tier 1), never raw accuracy. If the model cannot beat the baseline, we ship the baseline and say so.

**New from this study — the funnel is part of the engine's evaluation.** A prediction is not
successful because it ranked well; it is successful when it became an alert that became an
intervention that produced an outcome. We measure all four hops.

---

## 7. How the investigator UI should be structured

### 7.1 Global shell

Top-level navigation, mirroring the reference pattern of a small, stable set of work-item types:

```
Overview │ Alerts │ Cases │ Map │ Graph │ Intelligence │ Models │ Audit
```

Persistent: global entity search · jurisdiction selector (scoped to the user's authority) ·
alert counter · model-health indicator · data-freshness indicator.

### 7.2 Command Overview — the funnel first

Following §1.1, the KPI row is the funnel, not a model metric:

```
Predictions │ Alerts │ Cases Opened │ Interventions │ Outcomes Recorded
   (24h)         ↓ n%        ↓ n%           ↓ n%            ↓ n%
```

Then: amount at risk · **median lead time** · cases inside golden hour · predicted hotspots ·
**recommended case groupings** (§1.9) · open high-severity alerts · model health · data freshness.

Two complementary geographic views, because they answer different questions (§1.11):
**map = where**, **treemap = how much, by jurisdiction**.

### 7.3 Case workspace — the core screen

**Pinned fact-strip** (§1.7), always visible:

```
CASE-2026-0914 │ Digital Arrest │ ⏱ T+41min GOLDEN HOUR │ ₹12,40,000 at risk
Predicted window 02:00–06:00 IST │ Top: AePS-BC EP-SYN-000142 (0.31)
Evidence: MODERATE │ Model tier2-lambdamart-2026.09.01-a1b2c3d
```

**Tabs**, identical on every case (§1.6):

| Tab | Contents |
|---|---|
| **Summary** | Complaint, victim jurisdiction, typology, amount, recommended next step with reason (§1.8) |
| **Money Trail** | Time-ordered flow victim → mules → endpoint; amounts and delays on edges |
| **Graph** | Cytoscape link analysis. Typed, labelled, progressively expanded. **Includes alert/case/prediction nodes** (§1.3) |
| **Prediction & Why** | Ranked candidates, probability, confidence, window, SHAP factors as sentences (§1.10) |
| **Evidence** | References, provenance, hashes, access history |
| **Audit** | Every action on this case. Always present (§1.6) |

**Right rail:** typed intervention panel — `DEPLOY_TEAM`, `ALERT_LOCAL_BANK`, `ALERT_ATM_OPERATOR`,
`REQUEST_FUND_BLOCK`, `REQUEST_CCTV`, `JURISDICTION_HANDOFF`, `NO_ACTION` (with reason). Each records
what was predicted, what was done, and by whom.

### 7.4 Rendering uncertainty — a hard requirement

A `WEAK` prediction must not look like a `STRONG` one. This is enforced by a UI test, not by
convention, because the failure it prevents — an investigator acting on a guess that looked like
evidence — is the one with real-world consequences.

| Band | Rendering |
|---|---|
| `STRONG` | Full ranked list, solid confidence bars, map cells at full opacity |
| `MODERATE` | Ranked list, hatched confidence bars |
| `WEAK` | Ranked list dimmed, banner naming the missing evidence, map cells outlined not filled |
| `INSUFFICIENT` | **No ranked list.** Tier 1 zone forecast only, with an explicit explanation |

### 7.5 Visual language

Light, dense, restrained, accessible (§1.11). Colour is semantic and scarce: severity and risk only.
Type is small and tabular. No animation beyond state transitions. No dark "cyber" theme, no neon, no
gaming aesthetic.

**An investigator must be able to understand a case in under ten seconds, and must be unable to
mistake a guess for a finding.**

---

## 8. What this changes in the master spec — **folded in**

All seven deltas are now in `docs/ATLAS_MASTER_SPEC.md` and the traceability matrix. Recorded here so
the origin of each change stays visible.

| # | Change | From | Landed in |
|---|---|---|---|
| 1 | Prediction → Alert → Case → Package funnel, conversion measured at each hop | §1.1 | spec §21.3, §25.1; `ML-FUNNEL-001` |
| 2 | Entity resolution first-class; dynamic risk for **all** entity types | §1.2 | **new spec §13**; ADR-013; `INT-ENT-001`, `ML-ENTRISK-001` |
| 3 | Complaints, cases, alerts, predictions, interventions as **graph nodes** | §1.3 | spec §14.1; `INT-GRAPH-002` |
| 4 | **Network case grouping** with quantitative reasons | §1.9 | spec §27.1, §26.1; `INT-GROUP-001/002` |
| 5 | **Certification block** on every outbound package | §2.2 | spec §28.3; ADR-014; `SEC-CERT-001/002` |
| 6 | Outbound intelligence **bidirectional**: response channel, outcome digest, typology advisory | §2.4 | spec §28.4–28.5; ADR-014; `E2E-INTEL-003/004` |
| 7 | **Investigative-utility metrics** in the evaluation contract | §2.7 | spec §21.4; `ML-UTILITY-001` |

### Two leakage gates we did not expect

Folding delta 2 and delta 3 in exposed two ways the model could read the future that the original three
gates could not see. Neither involves anyone breaking a rule, which is what makes them worth recording:

- **Point-in-time entity resolution** (spec §19.3). The entity table looks like reference data but is
  observation data. A merge performed today, applied retroactively, lets a model "know" a linkage that
  was not knowable at prediction time — inflating Tier 2 recall on exactly the mule networks that
  matter most. The feature pipeline reads its own entity table, exactly as designed, and every existing
  gate stays silent.
- **Artefact-edge exclusion** (spec §19.4). Once `Prediction` and `Alert` are graph nodes, a model that
  can traverse to its own prior output will manufacture confidence from it — and that self-agreement
  looks exactly like skill.

The leakage control set therefore went from three gates to **five**.

### Where the differentiation actually is

Deltas 4, 6 and 7 are the ones that most distinguish this from a competent student build. Delta 6 in
particular — telling banks what happened to the intelligence we sent them — is the mechanism that makes
the whole ecosystem improve, and it is what the problem statement is reaching for when it asks for
"enhanced coordination between law enforcement and financial entities".

The single sharpest signal in delta 6 is the distinction between `ACTED` and `ALREADY_ACTIONED`:
it separates **being wrong** from **being slow**, two failures with completely different remedies that
no model metric can tell apart.

---

## Sources

NICE Actimize public product material — [niceactimize.com](https://www.niceactimize.com/),
[Enterprise Risk Case Management](https://www.niceactimize.com/enterprise-risk-case-management/enterprise-risk-case-management-overview),
[ActOne announcement](https://www.niceactimize.com/press-releases/NICE-Actimize-Introduces-ActOne--The-Markets-First-AIEnabled-Financial-Crime-Investigation-Management-Platform-213/),
[ActOne network analytics](https://www.nice.com/press-releases/nice-actimize-uncovers-complex-financial-crime),
[ActOne Extend](https://www.niceactimize.com/enterprise-risk-case-management/actone-extend);
plus publicly circulated product screenshots supplied for this review.

FinCEN public documentation — [fincen.gov](https://www.fincen.gov/),
[Section 314(a)](https://www.fincen.gov/resources/section-314a),
[Section 314(b) fact sheet](https://www.fincen.gov/system/files/shared/314bfactsheet.pdf),
[FinCEN Exchange](https://www.fincen.gov/resources/fincen-exchange),
[The Value of FinCEN Data](https://www.fincen.gov/resources/law-enforcement/case-examples),
[SAR FAQ](https://www.fincen.gov/resources/frequently-asked-questions-regarding-fincen-suspicious-activity-report-sar).
