# ATLAS — rules for AI coding assistants

**Read `CLAUDE.md` in the repository root first.** It is the canonical version of this file and has the
full context: what to read, the module layout, and the constraints that are easy to violate.

The five rules below are repeated here because they must apply even if you read nothing else.

## Non-negotiable

1. **Never weaken a check to make a build pass.** If a test or gate fails, it found something real.
2. **Never hand-write a metric.** Numbers come from `make eval`, stamped with a git SHA.
3. **Never commit a secret or real data.** This repo is public; development is synthetic data only.
4. **Never claim certainty the system doesn't have** — "predicted likelihood", not "100% fraudster".
5. **Green locally means nothing.** Run `make verify` — the full thing, not a subset.

## Two constraints violated by accident

**Point-in-time correctness** — features may only read rows where `observed_at <= as_of`. Breaking this
lets a model read the future and silently invalidates every metric. (`docs/ATLAS_MASTER_SPEC.md` §19)

**The simulator is unreachable from the serving path** — nothing under `atlas.*` may import
`simulator/`, transitively. Enforced by `import-linter` in CI.

## Before writing code

- `docs/ATLAS_MASTER_SPEC.md` §2 and §3 — what "correct" means on this project
- `docs/problem-statement/SIH26184-official.md` — verbatim problem statement, never a paraphrase
- `docs/adr/` — 14 decisions with alternatives already considered
