"""
Minimal synthetic complaint generator (placeholder for master spec §23 Phase 2).

Status: `simulator/generators/` and `simulator/typologies/` are currently empty
(confirmed — only stale __pycache__ from a deleted experiment). The full
agent-based, AMLSim-style simulator (§23.1: population, money-flow
reconstruction, mule networks, per-typology behavioural generators) has not
been built yet — that is a much larger piece of work than one task.

This module is deliberately NOT that. It generates only what a real NCRP
complaint would contain (§11 canonical complaint fields) — enough to close
the "simulator se complaints" gap end-to-end (generator -> connector ->
pipeline -> database) right now, so the rest of the team isn't blocked on
Phase 2 landing first. When the real generator arrives, it should produce the
same dict shape and this file can be deleted; nothing downstream changes
(this is the same guarantee `SyntheticComplaintConnector`'s docstring makes).

What this deliberately does NOT do, and must not be asked to do:
  - no money-flow / mule-account / transaction generation (§23.1, later phase)
  - no cash-out endpoint or cash-out timestamp — there IS no hidden ground
    truth here, because there is no fraud path being simulated yet, only the
    complaint envelope. Once the real generator exists and produces truth,
    that truth belongs in `simulator/truth/` and must never appear in a
    dict handed to a connector (§19, §23.2).

Amount realism reuses the calibrated, Benford-conformant per-typology ranges
from `simulator/validation/amount_distribution.py` (§23.3) rather than a new
ad-hoc range, so complaint amounts generated here don't quietly reintroduce
the conformance problem that file exists to prevent.
"""

from __future__ import annotations

import random
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from simulator.validation.amount_distribution import generate_amount

# Real enum values from apps/api/atlas/core/enums.py::FraudTypology. Not
# imported directly — `simulator/` and `apps/api/` are separate top-level
# packages/deployments (see repo layout), so this is a deliberate, documented
# string-literal mirror, not a missing import. If FraudTypology changes,
# update this tuple.
FRAUD_TYPOLOGIES = (
    "DIGITAL_ARREST",
    "INVESTMENT_SCAM",
    "UPI_COLLECT_FRAUD",
    "CUSTOMER_CARE_IMPERSONATION",
    "LOAN_APP_EXTORTION",
    "JOB_TASK_FRAUD",
    "SEXTORTION",
)

# Maps the real enum value to the internal key amount_distribution.py uses.
# (That file was written before the real enum values were confirmed — keys
# differ in casing/naming. Fixing that naming mismatch is a separate,
# small cleanup; not folded in here to keep this change reviewable.)
_AMOUNT_KEY = {
    "DIGITAL_ARREST": "digital_arrest",
    "INVESTMENT_SCAM": "investment_scam",
    "UPI_COLLECT_FRAUD": "upi_collect_qr",
    "CUSTOMER_CARE_IMPERSONATION": "customer_care_impersonation",
    "LOAN_APP_EXTORTION": "loan_app_extortion",
    "JOB_TASK_FRAUD": "job_task_fraud",
    "SEXTORTION": "sextortion",
}

# How long, roughly, between fraud initiation and the victim reporting it —
# this is the "golden hour" window (§11) and genuinely differs by typology:
# a digital-arrest victim is coerced for longer before realising, an UPI
# collect-fraud victim usually notices within minutes. Documented assumption,
# not measured — same caveat as §9's typology table.
_REPORT_DELAY_MINUTES = {
    "DIGITAL_ARREST": (30, 240),
    "INVESTMENT_SCAM": (60, 4320),  # can be days
    "UPI_COLLECT_FRAUD": (5, 60),
    "CUSTOMER_CARE_IMPERSONATION": (15, 120),
    "LOAN_APP_EXTORTION": (60, 1440),
    "JOB_TASK_FRAUD": (120, 2880),
    "SEXTORTION": (10, 180),
}

_NARRATIVE_TEMPLATES = {
    "DIGITAL_ARREST": "Victim reports coercion over a sustained video/voice call impersonating law enforcement.",
    "INVESTMENT_SCAM": "Victim reports repeated transfers into a trading platform promising high returns.",
    "UPI_COLLECT_FRAUD": "Victim reports approving a UPI collect request believing it to be a refund.",
    "CUSTOMER_CARE_IMPERSONATION": "Victim reports remote-access software installed after a fake customer-care call.",
    "LOAN_APP_EXTORTION": "Victim reports repeated small debits and threats from an unregistered loan app.",
    "JOB_TASK_FRAUD": "Victim reports upfront payments for a task-based job offer that stopped responding.",
    "SEXTORTION": "Victim reports a single urgent payment made under threat of image/video release.",
}


@dataclass(frozen=True)
class GeneratedComplaint:
    payload: dict  # exact shape SyntheticComplaintConnector.validate/normalize expects


def generate_complaint(
    typology: str,
    rng: random.Random,
    now: datetime | None = None,
) -> GeneratedComplaint:
    """One complaint-shaped payload. `victim_jurisdiction_id` is intentionally
    left out — the caller must fill it with a real Jurisdiction row's id
    (there is no valid default; inventing one would just move the
    foreign-key failure from here to the database)."""
    if typology not in FRAUD_TYPOLOGIES:
        raise ValueError(f"unknown typology {typology!r}; expected one of {FRAUD_TYPOLOGIES}")

    now = now or datetime.now(timezone.utc)
    lo_min, hi_min = _REPORT_DELAY_MINUTES[typology]
    delay = timedelta(minutes=rng.uniform(lo_min, hi_min))
    fraud_initiated_at = now - delay
    reported_at = now - timedelta(minutes=rng.uniform(0, 10))  # small additional reporting lag

    amount = generate_amount(_AMOUNT_KEY[typology], rng)

    payload = {
        "public_ref": f"CMP-SYN-{uuid.uuid4().hex[:6]}",
        "reported_at": reported_at.isoformat(),
        "fraud_initiated_at": fraud_initiated_at.isoformat(),
        "typology": typology,
        "reported_amount": f"{amount:.2f}",
        "narrative": _NARRATIVE_TEMPLATES[typology],
        # victim_jurisdiction_id: caller must set this
    }
    return GeneratedComplaint(payload=payload)


def generate_complaint_batch(
    n: int,
    rng: random.Random,
    typology_weights: dict[str, float] | None = None,
    now: datetime | None = None,
) -> list[dict]:
    """`n` complaint-shaped payloads, typology-mixed. Same caveat as
    `generate_complaint`: caller must set `victim_jurisdiction_id` on each
    dict before handing them to `SyntheticComplaintConnector`."""
    weights = typology_weights or {t: 1.0 for t in FRAUD_TYPOLOGIES}
    typologies, w = zip(*weights.items())
    chosen = rng.choices(typologies, weights=w, k=n)
    return [generate_complaint(t, rng, now).payload for t in chosen]
