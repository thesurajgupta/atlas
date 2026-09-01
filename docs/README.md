# ATLAS Documentation

Honest status. Documents scheduled for a later phase are listed as such rather than stubbed out with
placeholder text — see master spec §46 ("no placeholder architecture").

## Authoritative now

| Document | Purpose |
|---|---|
| [ATLAS_MASTER_SPEC.md](ATLAS_MASTER_SPEC.md) | The specification. Start here |
| [NON-GOALS.md](NON-GOALS.md) | Scope boundary (canonical list is spec §3) |
| [problem-statement/SIH26184-official.md](problem-statement/SIH26184-official.md) | Verbatim official PS. **Never paraphrase** |
| [problem-statement/incumbent-landscape.md](problem-statement/incumbent-landscape.md) | NCRP, CFCFRMS, Samanvay, Pratibimb — and the gap ATLAS fills |
| [problem-statement/requirements-traceability.md](problem-statement/requirements-traceability.md) | Every PS clause → module → test |
| [adr/](adr/) | 12 architecture decision records |
| [security/incident-response.md](security/incident-response.md) | What to do when something goes wrong |
| [archive/original-brief.md](archive/original-brief.md) | Superseded predecessor brief, retained with rationale |

## Scheduled

| Document | Phase |
|---|---|
| `architecture/system-architecture.md`, `data-flow.md`, `deployment.md` | 1 |
| `ml/label-definition.md` | 5 |
| `ml/typology-assumptions.md`, `ml/simulator-limitations.md` | 2 |
| `ml/data-leakage-prevention.md` | 5 |
| `ml/evaluation.md`, `ml/feedback-loop.md` | 6 |
| `ml/model-card.md` | 8 |
| `data-governance/data-classification.md`, `data-lineage.md`, `legal-context.md` | 3 |
| `api/api-reference.md` (generated from OpenAPI) | 3 |
| `security/security-architecture.md`, `threat-model.md` | 12 |
| `deployment/production-hardening.md`, `performance.md` | 13 |
| `demo/demo-script.md`, `judge-questions.md` | 14 |

## Conventions

- `§N` references point to numbered sections of the master spec. `scripts/check_spec_refs.py` verifies
  that every one resolves, and runs in CI.
- ADRs are immutable once accepted. To change a decision, write a superseding ADR.
- No document may contain a hand-written metric. Numbers come from `make eval` and carry a git SHA.
