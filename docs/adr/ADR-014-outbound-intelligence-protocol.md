# ADR-014 — Outbound intelligence protocol: certification and bidirectional response

**Status:** Accepted · **Date:** 2026-09-01

## Context

The problem statement requires that intelligence reach banks "through the Citizen Financial Cyber Fraud
Reporting and Management System, enabling faster fund blocking and increasing the chances of recovery",
and that it support "real-time actionable intelligence sharing across jurisdictions".

The predecessor brief omitted this entirely. Our first correction added an outbound package — but as a
**one-way** notification: ATLAS → bank.

Studying the FinCEN model showed that one-way is the wrong shape, for two independent reasons.

**First, lawfulness.** Under the §314(a) pattern a law-enforcement request to financial institutions is
*certified* by the requesting authority, *scoped* to a stated purpose, time-bounded, and audited. An
uncertified message asking a bank to freeze an account is not an intelligence product; it is an email.

**Second, learning.** Public-private financial-intelligence partnerships work because feedback returns
to the filer — institutions learn which reports mattered. Under a one-way design, a bank never learns
which of our notices led to a recovery, ATLAS never learns which were actionable, and both sides
optimise blind. Worse, **recovery rate — which the PS names as an objective — is unmeasurable**, because
the outcome happens at the recipient and never comes back.

## Decision

**1. Every package carries a mandatory certification block** — requesting officer, jurisdiction, legal
basis, case reference, purpose, scope, issue time, **expiry**, signature. The outbound path rejects any
package without a complete one. Expiry is mandatory: a package confers time-bounded authority over
named accounts, never standing access.

**2. Every package carries a response channel**, with five outcomes: `ACTED`, `ALREADY_ACTIONED`,
`NOT_ACTED`, `FALSE_POSITIVE`, `OUT_OF_SCOPE`.

The `ACTED` / `ALREADY_ACTIONED` distinction is the reason this is an ADR rather than a schema note.
It **separates being wrong from being slow** — two failures with completely different remedies, which
no model metric can tell apart. A ranking failure means retrain; a lead-time failure means the
prediction was right and the pipeline was too slow, and retraining will not help at all.

**3. Two scheduled products close the loop:** a per-recipient **outcome digest**, and a
**typology advisory** derived from our own corpus. Advisories require recorded human review before
publication.

## Alternatives considered

- **One-way notification** (our previous design). Rejected: unlawful in shape, and makes the PS's own
  recovery objective unmeasurable.
- **Direct point-to-point bank APIs.** Rejected: the PS specifies I4C coordination and the CFCFRMS
  route. A direct connection is both legally wrong and architecturally wrong — it would put ATLAS in a
  position no hackathon system should model itself into.
- **Optional certification** for low-severity packages. Rejected: an optional control is not a control,
  and a tiered scheme invites the severity field to be gamed downward.
- **Automatic advisory publication.** Rejected: an advisory naming a district has real consequences for
  a real place (spec §2, §3). Human review is a control, not a bottleneck to optimise away.
- **Inferring outcomes from later data** instead of asking. Rejected as the primary mechanism: it is
  guessing about the one thing we could simply be told. Retained only as a fallback when a recipient
  does not respond, and labelled as inferred wherever reported.

## Consequences

- Recipients must implement a response path, which is real integration friction. Mitigated by making
  `NOT_ACTED` with a reason a first-class, low-effort answer — a cheap response is far better than
  silence.
- Non-response must be handled: unanswered packages are tracked, reported as a coverage gap, and never
  silently counted as either success or failure.
- Response data becomes a labelled dataset, which makes it a **poisoning target** (spec §35): a
  compromised recipient could bias the model by systematically mislabelling. Responses are therefore
  authenticated, per-recipient rate-limited, weighted by recipient reliability, and monitored for
  distribution shift.
- On synthetic data these outcomes are simulated, and every report must say so. A simulated recovery
  rate demonstrates that the measurement pipeline works — not that the system recovers money.
