# ADR-008 — Ledger vs blockchain

**Status:** Accepted · **Date:** 2026-09-01

## Context

SIH26184 sits under the theme **"Blockchain & Cybersecurity"**, but the problem statement itself is
pure predictive analytics — the words "blockchain", "ledger" and "chain" appear nowhere in its text.

This creates a real pressure to add a blockchain for thematic credit. That pressure should be resisted
and the resistance should be *documented*, because "why is there no blockchain?" is a predictable judge
question and the answer needs to be better than a shrug.

There is nonetheless a genuine integrity requirement: audit and evidence records must be tamper-evident
under an insider-threat model (ADR-007).

## Decision

**Implement cryptographic integrity where it is needed; do not implement a blockchain.**

The integrity layer is ADR-007: append-only storage + hash chaining + externally signed checkpoints.
That is a real cryptographic mechanism delivering a property the system genuinely requires.

Explicitly rejected:

### No public blockchain

- Sensitive investigative data must never touch a public chain, and the PS's own data is
  law-enforcement material.
- Hash-only anchoring buys third-party timestamping at the cost of a **permanent, unrevocable public
  artefact** — the existence and timing of investigative activity becomes public metadata, which is
  itself intelligence.
- Introduces an external network dependency incompatible with an air-gapped government deployment.
- Cost and latency are unjustifiable for the volume of audit events.

### No permissioned ledger, for now

A private chain among parties who already trust a central coordinator (I4C) is a distributed database
with worse latency, worse tooling and a larger operational surface. Byzantine fault tolerance solves a
problem that does not exist when I4C is the acknowledged coordinating authority.

## Alternatives considered

- **Hyperledger Fabric for evidence integrity.** Rejected now; see revisit trigger.
- **Public chain hash anchoring (Bitcoin/Ethereum).** Rejected; see above.
- **Certificate-transparency-style Merkle log.** Genuinely attractive and closest to what we built —
  ADR-007's checkpointing is deliberately Merkle-compatible, so upgrading to full CT-style inclusion
  proofs is incremental rather than a rewrite.

## Revisit trigger — stated so the decision is falsifiable

Adopt a permissioned ledger when a genuine **multi-party trust boundary** appears: specifically, when
banks and LEAs need to resolve a dispute about *what intelligence was shared, with whom, and when*,
without either side being able to alter its own record, and where a central coordinator's attestation is
not accepted by both parties. That is a real Byzantine setting. Nothing in the current PS scope is.

## Consequences

- We can answer the theme question directly: *"We implemented cryptographic integrity where it was
  needed and declined a blockchain where it was not — here is the ADR, and here is the condition under
  which we would change our mind."* That is a stronger answer than an unjustifiable chain.
- We forgo thematic credit from judges who equate the theme with a literal blockchain. Accepted: the
  risk of failing a follow-up question on an unjustified chain is higher.
- ADR-007's design stays Merkle-compatible so the upgrade path remains cheap.
