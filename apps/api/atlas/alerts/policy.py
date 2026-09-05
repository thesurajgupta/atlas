"""Alert policy — when a prediction becomes something an officer is told about.

Master spec §27, §35.1.

Alert flooding is a threat here, not an inconvenience. An operator who learns
to ignore the system has been harmed by it, and every mechanism in this module
exists because raising an alert is a cost paid out of someone's attention:

* **evidence sufficiency gates severity, and can veto entirely.** An
  ``INSUFFICIENT`` prediction emits no alert at any amount. A guess that looks
  like a finding is the failure with real-world consequences (§25.3), and the
  cheapest place to stop it is before it is sent.

* **the golden hour raises severity, and past it nothing is raised.** An alert
  arriving after the money is gone is not a lesser alert; it is a false claim
  that action is still possible.

* **deduplication is by decision, not by message.** Two alerts that would send
  an officer to the same endpoint for the same case are one alert, whatever
  their text.

* **budgets are per jurisdiction.** A national cap would let one flooded
  district silence the rest of the country.

Nothing here decides *whether the prediction is right*. It decides whether the
prediction is worth interrupting someone for, which is a separate judgement and
a smaller one.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal

from atlas.core.clock import golden_hour_position
from atlas.core.enums import AlertSeverity, EvidenceSufficiency

#: Alerts per jurisdiction per rolling window. Hand-chosen, and deliberately
#: low: the number that matters is how many an investigator can actually act on
#: in a shift, which nobody here knows yet. It should be set from observed
#: intervention throughput, not from how many the engine can produce.
DEFAULT_BUDGET_PER_WINDOW = 25
DEFAULT_BUDGET_WINDOW = timedelta(hours=24)

#: How long an equivalent alert is suppressed. Long enough that a re-run of the
#: prediction pipeline does not re-notify; short enough that a genuinely new
#: development on the same case still gets through.
DEFAULT_SUPPRESSION_WINDOW = timedelta(hours=6)

#: Amount at risk above which severity is raised a step. ₹1,00,000 is the
#: reporting threshold most CFCFRMS escalation paths treat as significant; it is
#: a policy choice, not a finding, and belongs in configuration once there is a
#: jurisdiction that wants a different one.
HIGH_VALUE_THRESHOLD = Decimal("100000.00")


@dataclass(frozen=True)
class AlertCandidate:
    """A prediction being considered for an alert.

    Carries no probability. Nothing in ATLAS is calibrated yet, so a threshold
    on a probability would be a threshold on an uncalibrated number — the
    decision would look principled and be arbitrary. Evidence sufficiency is
    the honest band available today (§16.2), and it is what gates severity here.
    """

    case_ref: str
    jurisdiction_id: str
    evidence: EvidenceSufficiency
    amount_at_risk: Decimal
    fraud_initiated_at: datetime
    top_candidate_ref: str | None
    typology: str


@dataclass(frozen=True)
class AlertDecision:
    """Whether to raise, at what severity, and why not when not.

    ``reason`` is populated on suppression as well as on emission. An alert that
    was not sent is a decision somebody may need to explain later, and "no alert
    appeared" is not an explanation.
    """

    raise_alert: bool
    severity: AlertSeverity | None
    reason: str
    dedup_key: str


def dedup_key(candidate: AlertCandidate) -> str:
    """Identity of the *decision*, not of the message.

    Two alerts that would send an officer to the same endpoint for the same case
    are the same alert however differently they are worded. Hashing the case and
    the endpoint — not the text, not the timestamp, not the severity — is what
    makes a re-run of the pipeline silent instead of duplicative.

    A candidate with no endpoint keys on the case alone, so the zone-only alert
    for a case does not fire once per pipeline run.
    """
    material = f"{candidate.case_ref}|{candidate.top_candidate_ref or 'ZONE_ONLY'}"
    return hashlib.sha256(material.encode()).hexdigest()[:32]


def decide(
    candidate: AlertCandidate,
    *,
    now: datetime,
    recent_keys: frozenset[str] = frozenset(),
    issued_in_window: int = 0,
    budget: int = DEFAULT_BUDGET_PER_WINDOW,
) -> AlertDecision:
    """Decide whether this candidate becomes an alert.

    ``recent_keys`` are the dedup keys already issued inside the suppression
    window for this jurisdiction, and ``issued_in_window`` the count against the
    budget. Both are passed in rather than queried here so the policy stays a
    pure function — it can be tested exhaustively without a database, which is
    what makes it worth trusting.
    """
    key = dedup_key(candidate)

    # 1. Evidence veto. Checked first because it is the only one that says the
    #    alert should never have been considered, rather than not now.
    if candidate.evidence is EvidenceSufficiency.INSUFFICIENT:
        return AlertDecision(
            raise_alert=False,
            severity=None,
            reason=(
                "evidence sufficiency is INSUFFICIENT: no ranked candidates exist, "
                "so there is nowhere to send anyone (spec §16.2)"
            ),
            dedup_key=key,
        )

    # 2. Golden hour. Past it, an alert claims an action is possible when it is
    #    not. The case still matters — for investigation, for linkage — but it
    #    is not an interruption.
    # `now` is threaded through rather than letting golden_hour_position fall
    # back to the wall clock. A policy that reads the real time cannot be tested
    # against a fixed scenario, and the first version of this accepted `now` and
    # ignored it — every test dated in the past looked past the golden hour.
    elapsed = golden_hour_position(candidate.fraud_initiated_at, now=now)
    if elapsed > timedelta(hours=1):
        return AlertDecision(
            raise_alert=False,
            severity=None,
            reason=(
                f"golden hour elapsed {int(elapsed.total_seconds() // 60)} minutes ago; "
                f"an alert here would claim interception is still possible"
            ),
            dedup_key=key,
        )

    # 3. Deduplication, before the budget. A repeat should not consume budget
    #    that a genuinely new alert could have used.
    if key in recent_keys:
        return AlertDecision(
            raise_alert=False,
            severity=None,
            reason=(
                f"an equivalent alert for {candidate.case_ref} was issued within the "
                f"suppression window"
            ),
            dedup_key=key,
        )

    # 4. Budget. Last, so that a flooded jurisdiction still deduplicates and
    #    still refuses insufficient evidence rather than short-circuiting.
    if issued_in_window >= budget:
        return AlertDecision(
            raise_alert=False,
            severity=None,
            reason=(
                f"jurisdiction budget exhausted ({issued_in_window}/{budget} in window); "
                f"escalate rather than repeat (spec §27)"
            ),
            dedup_key=key,
        )

    return AlertDecision(
        raise_alert=True,
        severity=_severity(candidate, elapsed),
        reason=_explain(candidate, elapsed),
        dedup_key=key,
    )


def _severity(candidate: AlertCandidate, elapsed: timedelta) -> AlertSeverity:
    """Severity from evidence, amount and time remaining.

    Evidence sets the floor and time raises it — never the other way round. A
    ``WEAK`` prediction inside the golden hour is still weak; urgency is not a
    substitute for knowing where to send someone.
    """
    base = {
        EvidenceSufficiency.STRONG: AlertSeverity.HIGH,
        EvidenceSufficiency.MODERATE: AlertSeverity.MEDIUM,
        EvidenceSufficiency.WEAK: AlertSeverity.LOW,
    }[candidate.evidence]

    ladder = [AlertSeverity.LOW, AlertSeverity.MEDIUM, AlertSeverity.HIGH, AlertSeverity.CRITICAL]
    index = ladder.index(base)

    if candidate.amount_at_risk >= HIGH_VALUE_THRESHOLD:
        index += 1
    # Inside the first twenty minutes there is realistically time to act.
    if elapsed <= timedelta(minutes=20):
        index += 1

    return ladder[min(index, len(ladder) - 1)]


def _explain(candidate: AlertCandidate, elapsed: timedelta) -> str:
    """Why this alert, in a sentence carrying a quantity and a window.

    Spec §27.1 requires it of groupings; it is worth the same here. "High-risk
    activity detected" tells an investigator nothing they can weigh, and an
    alert that cannot be weighed is one that gets dismissed or over-trusted.
    """
    minutes = int(elapsed.total_seconds() // 60)
    where = (
        f"top candidate {candidate.top_candidate_ref}"
        if candidate.top_candidate_ref
        else "zone forecast only, no ranked endpoint"
    )
    return (
        f"{candidate.typology.replace('_', ' ').lower()} · "
        f"₹{candidate.amount_at_risk:,.0f} at risk · "
        f"{minutes} minutes since fraud began · "
        f"{candidate.evidence.value.lower()} evidence · {where}"
    )
