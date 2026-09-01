# ADR-011 — Prediction granularity: H3 resolution chosen by PAI sweep

**Status:** Accepted (resolution pending empirical sweep) · **Date:** 2026-09-01

## Context

The predecessor brief's prediction target was "the ATM". It never defined the spatial unit, and that
omission is consequential.

India has roughly 250,000 ATMs and a substantially larger AePS/Business-Correspondent network. Two
things follow:

- **Exact-endpoint Top-1 accuracy will be near zero**, and reporting it honestly makes a genuinely
  useful system look like a failure.
- More importantly, **exact-endpoint precision is not what the operational decision needs**. A team
  cannot be deployed to a single ATM on a probabilistic forecast; it is deployed to a *neighbourhood*.
  Predicting at a granularity finer than the action is precision theatre.

## Decision

Predict over the **H3 hexagonal lattice**, with resolution **selected empirically by sweeping the PAI
curve** rather than asserted.

- **Tier 1** forecasts at cell level. Candidate resolutions swept: r6 (~36 km², state/district view),
  r7 (~5.2 km², operational tasking), r8 (~0.74 km², urban drill-down), r9 (~0.1 km², dense metro).
- **Tier 2** ranks individual endpoints *within* a bounded candidate set (ADR-012), which is what makes
  endpoint-level output defensible: it is a ranking over a stated set, not a lottery over 250,000.
- Reported at both granularities: cell-level PAI/PEI, and endpoint-level Recall@K **plus
  hit-within-radius** (500 m / 2 km / 5 km), because radius is what an operational reader understands.

**Why H3 rather than a PostGIS grid:** H3 cells are near-equal-area, which matters because PAI is
area-normalised — a variable-area grid makes PAI incomparable across regions. H3 also has clean
parent/child aggregation, so a state view is an exact roll-up of the district view rather than a
re-computation.

**The sweep is the deliverable.** `ml/evaluation/harness/resolution_sweep.py` produces a PAI-vs-area
curve per resolution; the chosen resolution and its curve are appended to this ADR. Choosing before
measuring would be exactly the kind of asserted decision this ADR exists to replace.

## Alternatives considered

- **Individual endpoint as the only unit.** Rejected: near-zero Top-1, and finer than the operational
  decision.
- **Administrative units (district, police-station).** Rejected as the *model* unit — wildly variable
  areas make PAI meaningless — but retained as an **aggregation and routing** unit, since jurisdiction
  is how tasking actually works. Cells roll up to jurisdictions for hand-off (spec §28.2).
- **Fixed square grid.** Rejected: orientation artefacts, and unequal areas away from the equator.
- **Continuous KDE surface.** Rejected as primary: harder to task against and harder to evaluate with
  standard indices; retained as a visualisation option.

## Consequences

- Two granularities to evaluate and explain. Accepted: they answer two different operational questions.
- Resolution is configuration, not a constant, and the config is part of the model version.
- **PAI is sensitive to the area denominator**, so any resolution change invalidates comparison with
  prior results. The evaluation harness refuses to compare across resolutions, in the same way it
  refuses to compare across label-definition versions.

## Pending

Append the sweep results and the selected resolution here once Phase 6 completes. Until then, r7 is the
working default and is marked as provisional in all output.
