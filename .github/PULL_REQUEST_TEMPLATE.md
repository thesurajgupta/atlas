## What this changes

<!-- One or two sentences. What does this PR do, and why? -->

## Related

<!-- Closes #123 / Part of #45 / Relates to spec §N -->

## Type

- [ ] Feature
- [ ] Bug fix
- [ ] ML / model change
- [ ] Docs
- [ ] Infra / CI
- [ ] Security
- [ ] Refactor (no behaviour change)

---

## Checklist

Tick what applies. **If something doesn't apply, say why rather than deleting it** — a skipped check
that's explained is fine; a silently removed one isn't.

- [ ] `make verify` passes locally
- [ ] No secrets, credentials, real PII, real financial data, or real case material (see [`PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md`](../PUBLIC_REPOSITORY_SECURITY_BOUNDARY.md))
- [ ] Docs updated if behaviour or architecture changed
- [ ] Tests added or updated

### If this touches ML, features, the simulator, or prediction

- [ ] `make test-leakage` passes — **all five gates** (spec §19)
- [ ] No feature reads data with `observed_at > as_of`
- [ ] Any metric quoted below was produced by `make eval`, not typed by hand
- [ ] If the label definition changed: ADR written, version bumped, **all prior metrics regenerated**

### If this touches security, auth, audit, or `atlas.intel`

- [ ] `tests/security` passes
- [ ] Authorization enforced server-side, not only in the UI
- [ ] Audit events emitted for sensitive operations
- [ ] Tagged `@thesurajgupta` for review

### If this changes an architectural decision

- [ ] New ADR added under `docs/adr/` (don't edit an accepted ADR — supersede it)
- [ ] `docs/adr/README.md` index updated

---

## Metrics

<!-- ONLY if this changes model behaviour. Paste from reports/evaluation-<sha>.md.
     Never hand-write a number. If a metric moved, say which and by how much. -->

## How to test this

<!-- Exact commands a reviewer runs to see it work. -->

## Anything you're unsure about

<!-- Genuinely useful. Flag the bits you'd like a second opinion on — this is not a weakness. -->
