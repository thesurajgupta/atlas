# ADR-012 — Candidate generation and negative sampling

**Status:** Accepted · **Date:** 2026-09-01

## Context

The predecessor brief specified ranking "candidate cash-out locations" without ever defining how
candidates are produced. That omission is not a detail — it is the difference between a meaningful
metric and a fraudulent one.

If the recall stage quietly contains the true endpoint and few plausible competitors, Recall@5
approaches 1.0 and means nothing. If it excludes the true endpoint, the ranker cannot succeed no matter
how good it is. **The candidate set silently determines the headline metric.** This is the most common
silent failure in deployed ranking systems.

A second problem the brief did not address: most real complaints name a mule account never seen before.
Recall strategies that depend on account history produce an empty set for exactly the cases that matter
most.

## Decision

### Recall ladder

Union, deduplicate, cap at N, and **record which rungs contributed** in the prediction payload:

| Rung | Source | Requires |
|---|---|---|
| 1 | Endpoints in the mule account's own historical activity footprint | Account seen before |
| 2 | Endpoints used by accounts in the same detected mule cluster | Cluster membership |
| 3 | Endpoints near the account's home branch / KYC district | KYC district only |
| 4 | Endpoints in the top-N cells from the Tier-1 forecast | Nothing case-specific |
| 5 | Endpoints matching the case's typology signature | Fraud category |

Rungs 4 and 5 require no account history, so **the ladder never returns empty** where a Tier-1 forecast
exists — which is always.

### Evidence sufficiency

Recall composition determines the honesty band, and the band is part of the API contract:

| Rungs available | `evidence_sufficiency` | Behaviour |
|---|---|---|
| 1 and 2 | `STRONG` | Full ranked output |
| 1 or 2 | `MODERATE` | Full ranked output |
| 3 only, or 4+5 | `WEAK` | Ranked output, visually degraded in UI |
| none | `INSUFFICIENT` | **No ranked candidates.** Tier 1 forecast only |

### Negative sampling

Hard negatives drawn from the **same recall set**, stratified by distance band, so the ranker learns to
discriminate between plausible alternatives rather than between the answer and random noise. Random
global negatives are forbidden — they make the task trivially easy and the metric meaningless.

### Contract

`candidate_set_size` and `recall_stage_rungs_used` are **published fields**, not debug output. A
Recall@K figure without the size and construction of the set it ranked over is not interpretable, and
the evaluation report prints both alongside every ranking metric.

## Tests that make this real

- Recall-set construction never reads ground truth (import isolation, spec §19.3).
- The true endpoint is not preferentially positioned relative to negatives.
- Cold-start cases produce `WEAK` or `INSUFFICIENT`, never `STRONG`.
- `INSUFFICIENT` emits no ranked candidates.
- Candidate-set size distribution is reported per evaluation run; a sudden narrowing is investigated,
  because a shrinking candidate set inflates Recall@K while representing no improvement.

## Alternatives considered

- **All endpoints in the state as candidates.** Rejected: computationally wasteful and produces
  uninformatively low Recall@K without improving the operational answer.
- **k-nearest endpoints to the last known transaction.** Rejected as sole strategy: encodes a strong
  and frequently wrong prior that cash-out is near the last hop — the Nuh pattern shows cash-out
  concentrating in specific districts regardless of the trail's geography.
- **Learned retrieval (two-tower).** Deferred: needs more data than we will have, and the rule-based
  ladder is inspectable, which matters more here than marginal recall.

## Consequences

- The recall stage becomes a first-class component with its own metrics (recall of the true endpoint
  into the candidate set — the ceiling on Tier 2 performance) and its own failure modes.
- Reported numbers are lower than a naive design would produce, and are defensible under questioning.
- Cold-start behaviour is explicit and visible rather than silent.
