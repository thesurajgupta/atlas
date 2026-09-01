# ADR-007 — Audit architecture: hash chain + externally signed checkpoints

**Status:** Accepted · **Date:** 2026-09-01

## Context

The predecessor brief specified `previous_event_hash` / `event_hash` chaining and then correctly warned:
*"Do NOT claim this is a legal blockchain chain-of-custody mechanism unless the implementation actually
provides the necessary guarantees."*

The warning was right and the design did not act on it. **A hash chain alone is not tamper-evidence.**
An administrator with write access to the audit table can alter an event and recompute every subsequent
hash. The chain detects *corruption*; it does not detect an *authorised rewrite*. In an insider-threat
model — and insider misuse is explicitly in scope — that is the threat that matters.

## Decision

Three layers, all required:

1. **Append-only storage.** No `UPDATE` or `DELETE` grant on the `audit` schema for any application
   role. Enforced by database privilege; asserted by a migration test that fails if the grant exists.
2. **Hash chaining.** Each event binds its predecessor: `event_hash = H(previous_event_hash ‖ canonical(event))`.
3. **Periodic signed checkpoints.** At a fixed interval, the chain head is signed with a key held
   **outside the application database** (KMS/HSM in production; a separate file-based key with its own
   access path in development). Checkpoints are written to append-only storage.

Rewriting history now requires forging a signature, not merely writing to a table.

`make verify-audit-chain` recomputes the full chain and verifies every checkpoint signature.

## Alternatives considered

- **Hash chain alone.** Rejected: see Context.
- **Public blockchain anchoring.** Rejected — see ADR-008.
- **Third-party notarisation service.** Rejected: external dependency, incompatible with the air-gapped
  deployment story.
- **Write-once media.** Deferred: a production infrastructure decision, not an application one; noted in
  `docs/deployment/production-hardening.md`.

## Consequences

- Signing-key management becomes a real operational responsibility, including rotation and the fact
  that checkpoints must remain verifiable across rotations.
- Verification cost is O(events since last checkpoint) for incremental checks.
- **The claim we may make is "tamper-evident".** Not "immutable", not "legal chain of custody". This
  wording is binding on all documents, slides and verbal answers (spec §32.1).
