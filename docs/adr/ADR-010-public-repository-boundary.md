# ADR-010 — Public repository security boundary

**Status:** Accepted · **Date:** 2026-09-01

## Context

This repository is public. It describes a system intended for law-enforcement use against financially
motivated adversaries who are capable of reading it. Two distinct risks follow:

1. **Leakage** — committing real data, credentials or intelligence.
2. **Adversarial study** — an attacker reading the model design to learn how to evade it.

The second risk is easy to over-correct for. Security through obscurity is not a control, and a
government system's design ought to be auditable.

## Decision

**Publish the design; withhold the deployment.**

Safe to publish: source, architecture, ADRs, infrastructure definitions, synthetic datasets and the
generator, ML experiments, documentation, tests, security controls, mock connectors.

**Never in this repository:** real financial data · real citizen PII · bank or government credentials ·
production API keys · secrets · private certificates · real law-enforcement intelligence · real account
numbers · real transaction histories · production endpoint/deployment topology · production model
weights trained on real data · specific operational thresholds used in a live deployment.

Enforcement, not exhortation:

- `.gitignore` + `.env.example` (no real values, ever).
- `pre-commit` hooks including a secret scanner.
- `gitleaks` in CI over **full history**, not just the diff.
- Synthetic identifiers only; real account numbers are never primary keys in any environment.
- `PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md` at the repository root.

On the adversarial-study risk: model *architecture* is published; deployed *thresholds*, *alert budgets*
and *trained weights* are deployment configuration and are not. An adversary learning that we use
LambdaMART over a candidate set does not gain an operational advantage; learning the live alert
threshold for their district would.

## Alternatives considered

- **Private repository.** Rejected: the hackathon requires public submission, and auditability is a
  virtue for a government system.
- **Publish everything including trained models.** Rejected: models trained on real data are derived
  from restricted data and inherit its classification.
- **Publish nothing sensitive-adjacent.** Rejected: would gut the submission and mistakes obscurity for
  security.

## Consequences

- A pre-commit hook is mandatory for every contributor; documented in `CONTRIBUTING.md`.
- Any secret ever committed must be treated as compromised and rotated — history rewriting is not a
  remedy, and the incident-response doc says so.
- The production/public split must be maintained deliberately as the project grows; the boundary
  document is reviewed at every phase gate.
