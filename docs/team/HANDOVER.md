# Handover — who owns what, and what is actually left

**Last updated:** 6 September 2026 · reflects `main` at the time of writing.

Two owners from here:

| | |
|---|---|
| **Lucky** (@luckykhan933-byte) | All frontend |
| **Raj** (@Rkamal21) | Backend |
| Suraj (@thesurajgupta) | ML path, prediction, review |

Vijay (@Vijayvardhanji) stays on the simulator — issues [#45](https://github.com/thesurajgupta/atlas/issues/45) and [#50](https://github.com/thesurajgupta/atlas/issues/50) block the entire ML path and are the highest-priority items in the repository.

---

## Rule zero: nothing here gets rebuilt

Three people have now independently built the application shell — PRs #35, #36 and #42. That is roughly a week of work spent three times, and it happened because nobody said out loud who owned it.

**Before starting any page, read the "already built" list below.** If something exists, extend it. If it is close but wrong, say so in the issue rather than starting a second one.

---

## Already built — do not rebuild

### Pages that work

| Route | State | Notes |
|---|---|---|
| `/login` | **Live** | Real auth against the API, argon2id + TOTP. Do not touch |
| `/cases` | **Live** | Reads `GET /api/v1/cases`, jurisdiction-scoped, golden hour computed server-side |
| `/money-trail` | Mock | Raj's Cytoscape view. Progressive disclosure, typed edges, truncation flags. Closes #17 |
| `/map` | Mock | Cash-out endpoint map, ranked candidates, risk panel |
| `/cases/[id]` | Mock | Work-item shell: 6 tabs, fact strip, evidence-band rendering |
| `/overview` | Mock | Intelligence funnel + secondary metrics |

### Components to reuse, not re-create

```
prediction/EvidenceBadge.tsx        the four evidence bands
prediction/PredictionAndWhy.tsx     §25.3 rendering — each band a different DOM shape
prediction/ConfidenceBar.tsx        solid / hatched / dimmed
prediction/ContributingFactors.tsx  factors as sentences, not coefficients
work-item/WorkItemShell.tsx         the 6-tab layout
work-item/FactStrip.tsx             pinned fact strip with golden-hour position
work-item/WorkItemTabs.tsx
nav/PrimaryNav.tsx                  the shared nav — 54 lines
overview/Funnel.tsx                 the intelligence funnel
lib/api.ts                          API client, token handling, error shapes
```

`PredictionAndWhy` in particular. It has 5 tests behind it and it is the enforcement point for the one UI rule that is a hard requirement. Import it; do not write a second one.

---

# Lucky — frontend

Five pages are 10-line placeholders saying *"Not yet built."* Build them in this order. **Essential only — no extra features.**

Every page is mock data. There is no backend for any of them yet, and that is expected; label the mock clearly the way `/overview` already does.

---

## 1. `/alerts` — highest priority

**Why first:** the alert policy is merged and tested ([PR #52](https://github.com/thesurajgupta/atlas/pull/52)), so the shape is already decided. This page renders decisions the backend already knows how to make.

**What it needs — and nothing more:**

- A list of alerts, newest first, each showing: severity, case ref, typology, amount at risk, golden-hour position, and the reason string.
- Severity as a chip: `LOW` `MEDIUM` `HIGH` `CRITICAL`. Use the `severity` tokens already in `tailwind.config.ts`.
- Filter by severity. One control, not a filter panel.
- **Suppressed alerts shown in a separate collapsed section**, with their reason.

**The one thing that matters:** the reason string is not decoration. `apps/api/atlas/alerts/policy.py` produces reasons like

> `digital arrest · ₹820,000 at risk · 12 minutes since fraud began · strong evidence · top candidate EP-0783`

Render it in full. Do not summarise it to "High risk". An alert an investigator cannot weigh gets dismissed or over-trusted, and both are worse than not sending it.

Suppressed alerts carry a reason too — *"jurisdiction budget exhausted (25/25 in window)"*. Showing them is how an operator learns the system is not broken, it is rationing.

**Do not build:** acknowledgement workflow, assignment, comments, bulk actions, notification settings.

---

## 2. `/models` — model performance

**Why second:** it is the page that makes the honesty visible to a judge.

**What it needs:**

- The metrics from `ml/evaluation/metrics.py`: PAI, Recall@K (K = 1, 3, 5, 10), ECE.
- **Uplift over baseline as the headline.** Not raw accuracy. Show model vs baseline side by side and the delta.
- The provenance block: git SHA, dataset version, generated-at, and `working_tree_dirty`.
- **A `not_computed` section.** The harness reports which metrics were not measured and why. Render it.

**The one thing that matters:** `make eval` currently reports `DATASET_HAS_NO_SIGNAL`. When it does, this page must say so **above** the numbers, not in a footnote. A page that shows PAI 1.0 without that is showing a defensible-looking number about the wrong thing.

Read a report from `reports/eval/*.json` — the shape is stable. Run `make eval` to generate one.

**Do not build:** charts over time, model comparison UI, retraining controls, feature importance plots.

---

## 3. `/audit` — audit log

**Why third:** §25.2 makes Audit a permanent, co-equal tab. It is a statement about what the product is for.

**What it needs:**

- A table: timestamp, actor, action, resource, result (`allowed` / `denied`), correlation id.
- Filter by result. Denials are the interesting rows.
- **A chain-integrity indicator** — verified / broken, with the event count.

**The one thing that matters:** denied events must be as visible as allowed ones. The audit log exists so a cross-jurisdiction access attempt is findable; a UI that only shows successes defeats it.

**Do not build:** export, retention controls, log search syntax, per-actor drill-down.

---

## 4. `/intelligence` — bank outbox and hand-offs

**Why fourth:** the certification block is merged ([PR #53](https://github.com/thesurajgupta/atlas/pull/53)), so the data shape exists.

**What it needs:**

- Outbound packages: recipient, case ref, status, issued-at, **expires-at**, scope summary.
- The certification block on each: requesting officer, jurisdiction, legal basis, purpose.
- **Expired packages visibly expired**, not merely old.
- Jurisdiction hand-offs as a second list.

**The one thing that matters:** expiry is not cosmetic. `apps/api/atlas/intel/certification.py` refuses expired packages outright. The UI should show that state clearly — an expired package confers nothing, and it should not look like a package that merely needs a nudge.

**Do not build:** package composer, resend, recipient management, delivery-receipt tracking.

---

## 5. `/` root — 30 minutes

Currently a bare redirect. Make it redirect to `/overview` when signed in and `/login` when not. That is the whole task.

---

## Consolidation — do this alongside, not after

**The app has three navigations.** `nav/PrimaryNav.tsx` (54 lines) is the merged one; `money-trail/NavigationRail.tsx` (221) and `money-trail/ConsoleHeader.tsx` (360) are Raj's, because `/money-trail` sits outside the `(dashboard)` route group.

Move `/money-trail` into `(dashboard)` so it inherits the shared layout, and drop the duplicate nav. Keep his `ConsoleHeader` fact strip — that part is genuinely his page's, not shell.

Point the `(dashboard)/graph` placeholder at it, or delete `/graph` and rename the route.

**Also worth removing:** `maplibre-gl` and `@fortawesome/*` came in with #54. MapLibre overlaps with the plain SVG `/map` already draws; FontAwesome is a large dependency for a handful of icons the rest of the app draws inline. `cytoscape` stays — the spec names it.

---

## Two rules that apply to every page

**Evidence bands.** `WEAK` must never render like `STRONG`, and `INSUFFICIENT` shows **no ranked list at all**. This is a hard requirement (§25.3) with a UI test behind it. Reuse `EvidenceBadge` and `PredictionAndWhy`.

**No uncalibrated percentages.** Nothing in ATLAS is calibrated. Where a number is shown, label it as mock — the way `/map` does:

> *Mock figures for interface development. Live values come only from a validated, calibrated model run — there is no trained model yet.*

---

# Raj — backend

You have read the spec more carefully than the ticket, twice now. That transfers directly.

**Everything here is Python, in `apps/api/atlas/`.** Start with `docs/team/WORKFLOW.md` and `CLAUDE.md`. Run `make verify` before every push — it runs lint, types, module boundaries, docs, dependencies, secrets, the web build and 419 tests.

---

## 1. Graph endpoints — start here

**Why:** your own `/money-trail` page is on mock data because there is no endpoint to call. You are the person who knows exactly what it needs.

`apps/api/atlas/graph/` already has:

- `trail.py` — time-respecting trail reconstruction, `reconstruct_trail()`
- `artefacts.py` — jurisdiction-scoped artefact traversal
- `models.py` — `TransactionEdge`, `ArtefactLink`

**Build:** `apps/api/atlas/graph/router.py` and `schemas.py`, exposing

```
GET /api/v1/graph/trail/{case_id}     reconstructed money trail
GET /api/v1/graph/neighbourhood/{kind}/{id}   artefact links, scoped
```

**Pattern to copy:** `apps/api/atlas/cases/router.py`. It shows jurisdiction scoping in the query, the 404-not-403 rule, and audit recording on both allow and deny.

**Three things that are not optional:**

- Every read takes an `as_of` and passes it through. `reconstruct_trail` requires one and has no default, deliberately.
- Cross-jurisdiction is **404, not 403**. A 403 confirms the id exists.
- Both allow and deny are audited, with the real reason on the deny.

---

## 2. Alerts persistence and endpoints

`apps/api/atlas/alerts/policy.py` is the decision logic, pure and tested. It has nowhere to write.

**Build:**

- An `alerts.alert` table: severity, case ref, dedup key, reason, issued-at, jurisdiction, acknowledged-at.
- A service that calls `policy.decide()` and persists the result — **including suppressions**, with their reason. An alert that was not sent is a decision somebody may have to explain.
- `GET /api/v1/alerts`, jurisdiction-scoped.

`decide()` takes `recent_keys` and `issued_in_window` as parameters rather than querying — that is what keeps it a pure function. The service supplies them.

---

## 3. Audit read endpoint

`apps/api/atlas/audit/` has the hash-chained store and checkpoint signing. There is no way to read it over HTTP.

**Build:** `GET /api/v1/audit`, gated on `Permission.AUDIT_READ`, jurisdiction-scoped, with the chain-verification status included.

---

## Do not start on

`atlas/predict/` — that is mine, and it is blocked on #50 anyway.

---

# Where the project actually stands

| | |
|---|---|
| Tests | 419, `make verify` green |
| Leakage gates | **5 of 5 live**, each proven by deliberately breaking it |
| Backend modules | 11 of 13 built (`predict` empty, `intel` partial) |
| API endpoints | 12 |
| Frontend pages | 6 built, 5 placeholders |

**The blocker for everything ML** is [#50](https://github.com/thesurajgupta/atlas/issues/50): the simulator assigns cash-out locations at random, so no model can be evaluated and every metric computes to exactly chance. Until Vijay fixes it, `predict` cannot be built honestly.

Everything in this document is work that does not depend on that.
