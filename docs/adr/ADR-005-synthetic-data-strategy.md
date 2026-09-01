# ADR-005 — Synthetic data strategy and generator lineage

**Status:** Accepted · **Date:** 2026-09-01

## Context

SIH26184 ships **no dataset**. Real NCRP/CFCFRMS data is lawfully inaccessible to a hackathon team and
would be unpublishable in a public repository even if it were available.

Therefore every number this project reports rests on synthetic data, and the simulator's credibility
*is* the project's credibility. A simulator that accidentally embeds the answer produces excellent,
worthless metrics.

## Decision

Build an **agent-based behavioural simulator**, following the approach established by **AMLSim** and by
**AMLworld** (IBM Research / ETH Zurich, NeurIPS 2023 Datasets & Benchmarks), adapted to Indian
cyber-fraud typologies and cash-out channels.

- Normal population agents with realistic diurnal/weekly rhythms, salary, bills, retail.
- One generator per fraud typology (spec §9), each with its own layering depth, amount distribution,
  inter-hop delay and channel mix.
- Cash-out channels include **AePS/BC and merchant QR**, not only ATMs (spec §8.1).
- Hidden ground truth in an isolated schema with no grant to the serving role (spec §19.2).
- Fixed committed seeds; scenarios are reproducible bit-for-bit.

**Realism validation is a gate, not a report** (spec §23.3). The decisive check is the **separability
sanity gate**: if any single feature separates synthetic-fraud from synthetic-normal above threshold,
the dataset version is rejected. This is what stops us from grading ourselves on a giveaway.

## Alternatives considered

- **Public AML datasets** (e.g. IBM AMLworld releases, Elliptic). Rejected as primary: no cash-out
  *location* labels, no Indian channel structure, no complaint linkage. Retained as a **calibration
  reference** for distributional sanity.
- **PaySim / naive random generation.** Rejected: mobile-money oriented, and too simple to produce
  learnable-but-not-trivial structure.
- **Hand-authored scenarios only.** Rejected: too few, and prone to encoding the modeller's expected
  answer — which the separability gate exists to catch.

## Consequences

- Results are demonstrated on synthetic data and must always be described that way. `docs/ml/simulator-limitations.md`
  states plainly what is not captured, and those limits are volunteered to judges rather than defended.
- Simulator assumptions are documented as assumptions (`docs/ml/typology-assumptions.md`) and calibrated
  against published aggregates where they exist.
- Significant engineering investment in something that ships no user-facing feature. Accepted: without
  it there is no honest evaluation, and without honest evaluation there is no defensible submission.
