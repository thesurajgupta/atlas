# ADR-004 — Three-tier prediction stack

**Status:** Accepted · **Date:** 2026-09-01

## Context

The predecessor brief specified one task: *"Given observed transaction/case data up to time T, rank
candidate cash-out locations for a future window."*

That task is correct and valuable, but as the **only** task it fails on contact with real data. Most
complaints name a mule account the system has never seen. A single-task system then either returns
nothing, or — worse — returns a confident-looking ranking derived from almost no evidence. The second
outcome violates the same document's own honesty rules.

There is also an evaluation problem. India has roughly 250,000 ATMs plus a much larger AePS/BC network.
Exact-endpoint Top-1 accuracy over that space will be near zero, and an honest report of it reads as
failure even when the system is genuinely useful.

## Decision

Three tiers, each independently evaluated and **never averaged together**:

| Tier | Question | Availability | Headline metric |
|---|---|---|---|
| **1 — Zone risk forecast** | Which cells will see fraud-linked cash-out in [T, T+Δ]? | Always | PAI / PEI |
| **2 — Case-conditioned ranking** | For *this* case, which endpoints and when? | When evidence supports it | Recall@K, lead time |
| **3 — Mule & endpoint risk** | Which accounts and endpoints are cash-out infrastructure? | Always | PR-AUC, precision@budget |

Tier 1 is the honest backbone: it has no cold-start and it answers the PS's "predict potential
withdrawal hotspots" directly. Tier 2 is the headline capability and degrades explicitly via
`evidence_sufficiency` (ADR-012). Tier 3 produces the output banks can act on through CFCFRMS, and
feeds features to both other tiers.

## Alternatives considered

- **Single case-conditioned ranker** (the predecessor's design). Rejected: cold-starts to nothing,
  cannot power the heatmap when no live case exists, and forces dishonest output under thin evidence.
- **Single zone-level forecaster.** Rejected: answers the heatmap requirement but not "likely cash
  withdrawal **locations**", which the PS title asks for explicitly.
- **One multi-task model.** Rejected: couples three different label definitions, availability profiles
  and evaluation regimes into one artefact that cannot be honestly reported per-tier.

## Consequences

- Three models to train, monitor and version rather than one.
- Reporting is more complex, and deliberately so — a single blended accuracy number would be easier to
  present and would be misleading.
- The heatmap works on day one, before any case-level model is trained, which de-risks the build order.
- Tier 1's Hawkes baseline is genuinely strong; beating it is a real result rather than a formality.
