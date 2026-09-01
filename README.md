# ATLAS

**Predictive cash-out intelligence for cybercrime complaints.**

Smart India Hackathon 2026 · Problem Statement **SIH26184**
Ministry of Home Affairs · Indian Cyber Crime Coordination Centre (I4C), CIS Division
Theme: Blockchain & Cybersecurity

---

> ⚠️ **All data in this repository is synthetic.** It is generated from committed seeds and describes
> no real person, account, institution or event. ATLAS is not connected to NCRP, CFCFRMS, Samanvay or
> any bank. See [`PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md`](PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md).

## The problem

India's National Cybercrime Reporting Portal receives **~8,000 complaints a day**, and the number is
rising. When someone is defrauded, the money moves through mule accounts within minutes and is taken
out as cash — at an ATM, or increasingly through an AePS Business Correspondent — often before anyone
can act.

Existing systems are **reactive**. CFCFRMS races the money after a complaint arrives. Pratibimb maps
handsets after they have offended. Both are valuable. Neither answers the question the problem
statement actually asks:

> **Where is the money most likely to be taken out as cash next, within what time window, and why?**

## What ATLAS does

ATLAS is an **intelligence-support layer** that sits on top of the existing stack. It reconstructs the
money trail from a complaint, then produces three kinds of forecast:

| Tier | Question | Availability |
|---|---|---|
| **1 — Zone risk forecast** | Which areas will see fraud-linked cash-out in the next 6/24/72 hours? | Always |
| **2 — Case-conditioned ranking** | For *this* case, which endpoints, and when? | When the evidence supports it |
| **3 — Mule & endpoint risk** | Which accounts and endpoints are cash-out infrastructure? | Always |

Each is reported **separately and honestly**. They are never blended into one flattering number.

Output goes three ways: a GIS risk heatmap, an investigator case with a typed intervention, and an
outbound intelligence package — CFCFRMS-shaped for banks, and a hand-off for other jurisdictions.

## What ATLAS does not do

It does not identify or score individual citizens as criminals. It does not use protected attributes.
It does not replace investigation or judicial process. It does not claim legal chain of custody — it
provides tamper-*evidence*, which is weaker and honest. It is **not** general predictive policing: it
forecasts the cash-out leg of *reported* financial fraud, and nothing more.

Full list: [`docs/NON-GOALS.md`](docs/NON-GOALS.md).

## Honesty commitments

These are enforced by tests, not by intention:

- **No future data reaches the model.** Five independent leakage gates — a point-in-time-correct
  feature store, a physically separated ground-truth schema, point-in-time entity resolution,
  artefact-edge exclusion, and CI checks — each verified by deliberately breaking it.
- **The demo does not cheat.** The simulator's hidden ground truth is revealed only *after* prediction.
  Fixed committed seed. If the prediction misses, the demo shows the miss.
- **Every metric is generated, never typed.** `make eval` produces a git-SHA-stamped report; no slide
  may contain a hand-written number.
- **The headline number is uplift over a strong baseline**, never raw accuracy.

## Quick start

```bash
cp .env.example .env      # local development values only
make up                   # PostgreSQL + PostGIS + H3 + Redis + API + web
make verify               # lint, types, module boundaries, tests, secret scan
make demo                 # the full story, end to end, offline, reproducible
```

## Contributing

This is a 6-person team project and **everyone can contribute anywhere** — backend, ML, frontend,
security, DevOps, UI/UX, docs. You are not locked to a module.

```bash
git clone https://github.com/thesurajgupta/atlas.git && cd atlas
cp .env.example .env
python3 -m venv .venv && .venv/bin/pip install pre-commit && .venv/bin/pre-commit install
make up && make verify
```

Then branch, push, and open a PR:

```bash
git switch -c feat/your-change && make verify && git push -u origin feat/your-change
```

`main` is protected: pull request + green CI + one approval, for everyone including the maintainer.

**Full guide → [`docs/team/WORKFLOW.md`](docs/team/WORKFLOW.md)** · rules → [`CONTRIBUTING.md`](CONTRIBUTING.md)

## Documentation

| Start here | |
|---|---|
| [Master specification](docs/ATLAS_MASTER_SPEC.md) | The authoritative design document |
| [Official problem statement](docs/problem-statement/SIH26184-official.md) | Verbatim. Do not paraphrase |
| [Incumbent landscape](docs/problem-statement/incumbent-landscape.md) | What I4C already runs, and the gap ATLAS fills |
| [Requirements traceability](docs/problem-statement/requirements-traceability.md) | Every PS clause → module → test |
| [Architecture decisions](docs/adr/) | 14 ADRs, including why there is no blockchain |
| [Team workflow](docs/team/WORKFLOW.md) | Clone, branch, commit, push, PR — exact commands |
| [Reference systems](docs/architecture/reference-systems-and-design.md) | What we took from NICE Actimize and FinCEN, and why |

## Architecture at a glance

A **modular monolith** — one deployable API, thirteen bounded contexts, module boundaries enforced in
CI by `import-linter`, one PostgreSQL schema per module.

PostgreSQL 16 + PostGIS + H3 + TimescaleDB · Redis (cache, rate limit, event bus) ·
FastAPI + Pydantic v2 + SQLAlchemy 2.0 · Next.js + MapLibre GL + deck.gl · LightGBM / LambdaMART / SHAP.

Notable decisions, each with an ADR: **no Neo4j** (trails are 3–8 hops — [ADR-002](docs/adr/ADR-002-no-neo4j.md)),
**no Kafka** (0.1 events/sec mean — [ADR-003](docs/adr/ADR-003-redis-streams-not-kafka.md)),
**no blockchain** (cryptographic integrity where it's needed, and a stated trigger to revisit —
[ADR-008](docs/adr/ADR-008-ledger-vs-blockchain.md)).

## Status

Under active development. See [master spec §47](docs/ATLAS_MASTER_SPEC.md) for the phase plan and §49
for the acceptance criteria that define "done".

## Security

See [`SECURITY.md`](SECURITY.md). Do not open public issues for vulnerabilities.

## License

See [`LICENSE`](LICENSE).
