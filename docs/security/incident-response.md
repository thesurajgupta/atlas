# Incident Response

Scope: this repository and its development environments. Production incident response is the deploying
authority's process; this document covers what the ATLAS team does.

## Severity

| Level | Meaning | Response |
|---|---|---|
| **SEV-1** | Secret committed · real data committed · ground-truth leakage into the prediction path · audit chain broken | Immediate, drop everything |
| **SEV-2** | Auth/authz bypass · IDOR · privilege escalation · query-budget bypass (threat T-01) | Same day |
| **SEV-3** | Dependency CVE · misconfiguration without exposure | Next working day |

## A secret was committed — SEV-1

**Treat it as compromised the moment it is pushed. Assume it was cloned.**

1. **Rotate the credential first.** Before cleaning history, before telling anyone. Rewriting history
   is not a remedy — it does not un-publish what was fetched.
2. Revoke any sessions or tokens derived from it.
3. Remove it from the working tree and add the pattern to `.gitignore`.
4. Purge from history (`git filter-repo`) and force-push **only after** rotation. Note that forks and
   caches may retain it.
5. Record the incident: what leaked, for how long, what was rotated, what changed to prevent recurrence.

The prevention control is `pre-commit` with `gitleaks`. If a secret reached `main`, the hook was
missing or bypassed — fix that as part of the incident, not afterwards.

## Real data was committed — SEV-1

As above, plus: this is a **data-protection incident**, not merely a hygiene failure. Under CERT-In
Directions, reportable incidents carry a 6-hour reporting obligation, and the DPDP framework carries
its own notification duties. Escalate to the project leads immediately — do not attempt to quietly
clean it up.

## Ground truth reached the prediction path — SEV-1

This invalidates **every metric the project has reported.**

1. Stop. Do not publish or present any result until resolved.
2. Identify which leakage gate should have caught it and why it did not (spec §19.3).
3. Fix the gate first, then the leak — a gate that failed once will fail again.
4. **Regenerate every affected evaluation report.** Do not hand-edit numbers.
5. Record the incident in the model card. If results were shown to anyone based on the leaked run,
   correct them explicitly.

Never weaken a gate to make a build pass. If a gate fires, it has found something real.

## Audit chain verification failed — SEV-1

1. Do not write further audit events until triaged.
2. Determine the last verifiable signed checkpoint (ADR-007).
3. Events after it are **suspect and must be treated as such** — the chain's value is that it tells you
   this rather than hiding it.
4. Investigate: corruption, a bug, or tampering. Assume tampering until shown otherwise.

## After any SEV-1 or SEV-2

Write it down: what happened, how it was detected, how long it took to detect, what fixed it, and what
control changed so it cannot recur. Detection time is the number worth tracking.
