# ATLAS — context for AI coding assistants

Predictive cash-out intelligence for cybercrime complaints. **SIH26184** · Ministry of Home Affairs ·
Indian Cyber Crime Coordination Centre (I4C).

Given a cybercrime complaint, forecast **where and when** the stolen money will be withdrawn as cash,
early enough for police to act or a bank to freeze the account.

## Read before writing code

| File | Why |
|---|---|
| `docs/ATLAS_MASTER_SPEC.md` **§2 and §3** | Defines what "correct" means here. Read these two sections even if you read nothing else |
| `docs/problem-statement/SIH26184-official.md` | The verbatim problem statement. **Never work from a paraphrase** — the predecessor brief did, and silently lost three binding requirements |
| `docs/adr/` | 14 decisions with their alternatives. If you're about to ask "why not X", the answer is probably already written |
| `docs/team/WORKFLOW.md` | Branch, commit, PR |

The full spec is long. Don't paste it — reference the section you need (`§14.1`, `§21.3`).

## Non-negotiable rules

These have each already caught a real bug. They are not ceremony.

1. **Never weaken a check to make a build pass.** If a test or gate fails, it found something real. Fix
   the cause.
2. **Never hand-write a metric.** Every number comes from `make eval`, stamped with a git SHA. A number
   nobody can reproduce is worse than no number.
3. **Never commit a secret or real data.** The repo is public. Development is synthetic data only. If a
   credential is ever committed: rotate it *first*, then clean history — rewriting does not un-publish.
4. **Never claim certainty the system doesn't have.** Use "predicted likelihood", "confidence", "ranked
   candidates". Never "100% fraudster" or "guaranteed cash-out". This applies to code comments, log
   messages, UI strings and commit messages.
5. **Green locally means nothing.** Run `make verify` — the full thing, not a subset. Several failures
   on this project were green on one machine and broken everywhere else.

## Two constraints that are easy to violate accidentally

**Point-in-time correctness.** Every observation carries `observed_at` — when the fact became
*knowable*, which is not `created_at`. Features may only read rows where `observed_at <= as_of`.
Violating this lets a model read the future, and the metrics silently become meaningless. See §19.

**The simulator is unreachable from the serving path.** `simulator/` holds hidden ground truth. Nothing
under `atlas.*` may import it, transitively. Enforced by `import-linter` in CI.

## Commands

```bash
make up              # PostgreSQL (PostGIS + H3 + TimescaleDB) and Redis
make verify          # lint, types, module boundaries, docs, deps, secrets, tests — run before every push
make test-leakage    # the ground-truth leakage gates
make verify-audit-chain
```

## Layout

```
apps/api/atlas/      one package per bounded context, one DB schema each
  core/              config, clock, errors, mixins — depends on nothing else
  iam/ audit/        identity; hash-chained tamper-evident audit
  complaints/ entity/ graph/ geo/ cases/ alerts/ intel/
  features/ predict/ the ML path — must never import simulator/
simulator/           synthetic data + hidden ground truth
tests/               unit · integration · security · leakage · fairness · e2e
docs/                spec, ADRs, problem statement, team workflow
```

Modular monolith, not microservices — one deploy unit with CI-enforced module boundaries (ADR-009).
Cross-module access goes through the owning module's service interface, never by reading another
module's schema.

## Style

Match surrounding code. Strong typing (`mypy --strict` passes). Comments explain *why*, not *what* —
especially where a choice looks odd but is deliberate. No dead code, no placeholder scaffolding.

## What this project is not

Not general predictive policing. It forecasts the **cash-out leg of reported financial fraud** — a
logistics prediction about criminal infrastructure. It never scores individuals, and no protected
attribute (or close proxy) may enter a model. That is enforced by a failing test, not a promise.
See `docs/NON-GOALS.md`.
