# ADR-006 — Authentication and identity

**Status:** Accepted · **Date:** 2026-09-01

## Context

Production ATLAS would authenticate against a government identity provider (NIC SSO or a departmental
IdP). That is unavailable and unmockable-with-fidelity in a public repository. The demo must
nonetheless exercise the **real** authorization paths, because a demo that bypasses auth proves nothing
about a system whose theme is cybersecurity.

## Decision

An **`IdentityProvider` port** with two adapters:

1. **Built-in provider (default).** OIDC-shaped, fully implemented: argon2id password hashing, TOTP MFA,
   short-lived access tokens, refresh rotation with reuse detection, JTI revocation list.
2. **Keycloak adapter** behind an optional compose profile, proving the port is real.

Authorization is **always ATLAS's own** (RBAC + ABAC, jurisdiction- and case-scoped), never delegated to
the IdP. The IdP answers *who*; ATLAS answers *what they may do*. This keeps the production swap to
identity alone.

## Alternatives considered

- **Keycloak as the only option.** Rejected: heavy for the default demo path, and the core demo must not
  depend on an optional profile.
- **Rolling our own token format.** Rejected: standard JWT with standard claims, so the government swap
  is mechanical.
- **No auth in the demo.** Rejected outright — see Context.

## Consequences

- We own password and MFA handling in the default path, which is security-sensitive code. Mitigated by
  using vetted primitives (argon2id, standard TOTP) and by a dedicated `tests/security/` suite.
- Two adapters to keep working; the Keycloak profile runs in CI to prevent bit-rot.
- Production migration touches one module (`atlas.iam`) and no authorization logic.
