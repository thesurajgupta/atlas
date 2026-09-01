# ADR-013 — Entity resolution as a first-class subsystem, with dynamic entity risk

**Status:** Accepted · **Date:** 2026-09-01

## Context

The predecessor brief listed `Entity` and `MuleAccount` among its domain objects and gave entity
resolution no further treatment. The `atlas.entity` module existed in the layout with no specification
behind it — a module with no section.

Studying mature financial-crime platforms made the omission obvious. Their stated architecture is
**entity-centric**: resolution is the backbone, and risk is a dynamic, ML-derived property of the
resolved entity rather than a label on a transaction.

The reason this matters for SIH26184 specifically: **a system that cannot tell that two accounts belong
to the same actor cannot detect a mule network**, and mule networks are the entire subject. Everything
downstream — money trail, graph, all three prediction tiers, every alert and every bank package — is
only as good as the entities it reasons about.

## Decision

Promote entity resolution to a first-class subsystem (spec §13) with three properties.

**1. Blocking → matching → clustering**, with a documented threshold, producing stable canonical
entities.

**2. Resolution decisions are versioned and reversible.** A merge is a hypothesis. When it is wrong it
must be splittable without destroying the cases, alerts and audit records attached to it.

**3. Resolution is point-in-time correct.** Feature reads join against the entity graph *as it stood at
`as_of`*, never as it stands now.

Point 3 is the subtle one and the reason this needed an ADR. **The entity table looks like reference
data but is actually observation data.** A merge performed today, applied retroactively, would let a
model "know" a linkage that was not knowable at prediction time — a leakage vector that none of our
three existing gates (spec §19) would catch, because no rule is broken: the feature pipeline is reading
its own entity table, exactly as designed.

Additionally, **every entity type carries a dynamic risk score**, not just accounts: endpoints, BC
agents, devices, beneficiaries, merchants. Scores are versioned with history, explained, decayed, and
reconstructible as of any past instant.

## Alternatives considered

- **Keep resolution as a utility inside `atlas.graph`.** Rejected: it becomes an implementation detail
  of one consumer, while four other modules depend on it. It also had no place to record versioning.
- **Deterministic matching only** (exact identifier equality). Rejected: misses precisely the
  adversarial cases — a mule network exists to look like unrelated accounts.
- **Probabilistic matching with no reversal path.** Rejected: over-merging is inevitable and, without
  split, unrecoverable. An unrecoverable wrong merge in a law-enforcement context is a serious harm.
- **Mule-only risk scoring** (the predecessor's Tier 3). Rejected as too narrow: the highest-value
  signal available is *endpoint* risk — the observed pattern of a small number of endpoints absorbing
  disproportionate fraud volume — which a mule-account classifier cannot express.

## Consequences

- Decay is now a required behaviour, not an optimisation. A system that never forgets eventually flags
  everything, and an entity risky in 2024 but quiet since is not risky today.
- Point-in-time entity joins are more expensive than reading a current-state table. Accepted: this is
  the cost of not lying about what was knowable.
- Entity risk **is** Tier 3. This ADR does not add a fourth model; it says Tier 3 is shared substrate
  consumed by Tiers 1 and 2 and by the outbound bank package, rather than a bolt-on classifier.
- No entity risk score may derive from a protected attribute or a proxy for one (spec §22.2), enforced
  by the existing prohibited-feature test.
