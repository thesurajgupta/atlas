# Security Policy

ATLAS is a security-focused project built for Smart India Hackathon 2026 (SIH26184). We take
vulnerability reports seriously.

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

Use GitHub's private vulnerability reporting ("Report a vulnerability" under the Security tab), or
contact the maintainers listed in `CODEOWNERS` directly.

Please include: affected component, reproduction steps, impact assessment, and any suggested fix.
We aim to acknowledge within 72 hours.

## Scope

In scope: authentication and authorization bypass · IDOR · privilege escalation · injection · SSRF ·
audit-log tampering · **prediction-API abuse** (see below) · leakage of ground truth into the
prediction path · secret exposure in the repository or its history.

Out of scope: findings that require a compromised host · social engineering · denial of service against
a local development instance · issues in synthetic data content.

## Two classes of issue specific to this project

**Prediction-API abuse (threat T-01).** ATLAS forecasts where fraudulent cash-out is likely. The same
data reveals where it is *unlikely* — i.e. which locations are unwatched. Anything that lets a user
enumerate low-risk areas beyond their authorised scope, or exceed their query budget, is a security
vulnerability, not a feature request. See `docs/ATLAS_MASTER_SPEC.md` §35.1.

**Ground-truth leakage.** Any path by which the prediction or feature pipeline can reach the
simulator's hidden ground truth is a critical issue — it invalidates every metric the project reports.
See §19.

## Data

This repository contains **synthetic data only**. If you believe any file contains real personal,
financial or law-enforcement data, report it immediately as a security issue.

## Supported versions

This is a hackathon project under active development. Only `main` is supported.
