"""Alert policy (master spec §27, §35.1).

A pure function, so it can be tested exhaustively without a database — which is
most of the reason it was written as one. The decisions here are about spending
someone's attention, and the cost of getting them wrong is an operator who stops
reading alerts.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from atlas.alerts.policy import (
    DEFAULT_BUDGET_PER_WINDOW,
    AlertCandidate,
    decide,
    dedup_key,
)
from atlas.core.enums import AlertSeverity, EvidenceSufficiency

NOW = datetime(2026, 5, 2, 14, 0, tzinfo=UTC)


def candidate(
    *,
    evidence: EvidenceSufficiency = EvidenceSufficiency.STRONG,
    amount: str = "50000.00",
    minutes_ago: int = 10,
    endpoint: str | None = "EP-0783",
    case_ref: str = "CASE-2026-0914",
    jurisdiction: str = "DL-CYB",
) -> AlertCandidate:
    return AlertCandidate(
        case_ref=case_ref,
        jurisdiction_id=jurisdiction,
        evidence=evidence,
        amount_at_risk=Decimal(amount),
        fraud_initiated_at=NOW - timedelta(minutes=minutes_ago),
        top_candidate_ref=endpoint,
        typology="DIGITAL_ARREST",
    )


# --------------------------------------------------------------------------
# Evidence veto
# --------------------------------------------------------------------------


def test_insufficient_evidence_raises_nothing_at_any_amount() -> None:
    """The veto that matters most.

    An INSUFFICIENT prediction emits no ranked candidates, so there is nowhere
    to send anyone. Raising anyway would send a team on a guess that arrived
    looking like a finding.
    """
    decision = decide(
        candidate(evidence=EvidenceSufficiency.INSUFFICIENT, amount="5000000.00"),
        now=NOW,
    )

    assert decision.raise_alert is False
    assert "INSUFFICIENT" in decision.reason


def test_weak_evidence_alerts_but_stays_low() -> None:
    """Weak is still actionable — dimmed, not silent."""
    decision = decide(candidate(evidence=EvidenceSufficiency.WEAK), now=NOW)

    assert decision.raise_alert is True
    assert decision.severity is AlertSeverity.MEDIUM  # LOW, raised once for time


def test_urgency_does_not_promote_weak_evidence_to_strong() -> None:
    """Time raises severity; it never substitutes for knowing where to look.

    A weak prediction two minutes after the fraud is still weak. If urgency
    could carry it to CRITICAL, the band would stop meaning anything.
    """
    weak = decide(
        candidate(evidence=EvidenceSufficiency.WEAK, minutes_ago=2, amount="900000.00"),
        now=NOW,
    )
    strong = decide(
        candidate(
            evidence=EvidenceSufficiency.STRONG, minutes_ago=2, amount="900000.00"
        ),
        now=NOW,
    )

    assert weak.severity is not None and strong.severity is not None
    ladder = [
        AlertSeverity.LOW,
        AlertSeverity.MEDIUM,
        AlertSeverity.HIGH,
        AlertSeverity.CRITICAL,
    ]
    assert ladder.index(weak.severity) < ladder.index(strong.severity)


# --------------------------------------------------------------------------
# Golden hour
# --------------------------------------------------------------------------


def test_nothing_is_raised_after_the_golden_hour() -> None:
    """An alert past the window claims interception is possible when it is not.

    The case still matters for investigation and linkage. It is not an
    interruption.
    """
    decision = decide(candidate(minutes_ago=95), now=NOW)

    assert decision.raise_alert is False
    assert "golden hour" in decision.reason


def test_the_first_twenty_minutes_raise_severity() -> None:
    early = decide(candidate(minutes_ago=5), now=NOW)
    late = decide(candidate(minutes_ago=45), now=NOW)

    assert early.severity is AlertSeverity.CRITICAL
    assert late.severity is AlertSeverity.HIGH


def test_a_high_amount_raises_severity_one_step() -> None:
    small = decide(candidate(amount="20000.00", minutes_ago=45), now=NOW)
    large = decide(candidate(amount="820000.00", minutes_ago=45), now=NOW)

    assert small.severity is AlertSeverity.HIGH
    assert large.severity is AlertSeverity.CRITICAL


# --------------------------------------------------------------------------
# Deduplication
# --------------------------------------------------------------------------


def test_the_dedup_key_is_the_decision_not_the_message() -> None:
    """Same case, same endpoint — one alert, whatever the wording or severity.

    Keying on rendered text would make a re-run with a reworded template look
    like new information.
    """
    a = candidate(amount="50000.00", minutes_ago=10)
    b = candidate(amount="999999.00", minutes_ago=55)

    assert dedup_key(a) == dedup_key(b)


def test_a_different_endpoint_is_a_different_alert() -> None:
    assert dedup_key(candidate(endpoint="EP-0783")) != dedup_key(
        candidate(endpoint="EP-1092")
    )


def test_a_repeat_inside_the_window_is_suppressed() -> None:
    first = decide(candidate(), now=NOW)
    assert first.raise_alert is True

    second = decide(candidate(), now=NOW, recent_keys=frozenset({first.dedup_key}))
    assert second.raise_alert is False
    assert "suppression window" in second.reason


def test_a_zone_only_candidate_dedupes_on_the_case() -> None:
    """Without this, a case with no ranked endpoint re-alerts every pipeline run."""
    a = decide(candidate(endpoint=None), now=NOW)
    b = decide(candidate(endpoint=None), now=NOW, recent_keys=frozenset({a.dedup_key}))

    assert b.raise_alert is False


# --------------------------------------------------------------------------
# Budget
# --------------------------------------------------------------------------


def test_the_budget_stops_flooding() -> None:
    decision = decide(candidate(), now=NOW, issued_in_window=DEFAULT_BUDGET_PER_WINDOW)

    assert decision.raise_alert is False
    assert "budget exhausted" in decision.reason


def test_deduplication_runs_before_the_budget() -> None:
    """A repeat must not consume budget a genuinely new alert could have used."""
    key = dedup_key(candidate())
    decision = decide(
        candidate(),
        now=NOW,
        recent_keys=frozenset({key}),
        issued_in_window=DEFAULT_BUDGET_PER_WINDOW - 1,
    )

    assert decision.raise_alert is False
    assert "suppression window" in decision.reason  # not "budget"


def test_a_flooded_jurisdiction_still_refuses_insufficient_evidence() -> None:
    """Order matters: the veto is not skipped once the budget is gone."""
    decision = decide(
        candidate(evidence=EvidenceSufficiency.INSUFFICIENT),
        now=NOW,
        issued_in_window=DEFAULT_BUDGET_PER_WINDOW + 50,
    )

    assert "INSUFFICIENT" in decision.reason


# --------------------------------------------------------------------------
# The explanation
# --------------------------------------------------------------------------


def test_the_reason_carries_a_quantity_and_a_window() -> None:
    """ "High-risk activity detected" tells an investigator nothing to weigh.

    An alert that cannot be weighed is one that gets dismissed or over-trusted,
    and both are worse than not sending it.
    """
    decision = decide(candidate(amount="820000.00", minutes_ago=12), now=NOW)

    assert decision.raise_alert is True
    assert "820,000" in decision.reason
    assert "12 minutes" in decision.reason
    assert "EP-0783" in decision.reason
    assert "strong evidence" in decision.reason


def test_a_zone_only_alert_says_it_has_no_endpoint() -> None:
    """Silence about the missing endpoint would read as a ranked candidate."""
    decision = decide(candidate(endpoint=None), now=NOW)

    assert "no ranked endpoint" in decision.reason


def test_a_suppressed_alert_still_explains_itself() -> None:
    """An alert that was not sent is a decision somebody may have to explain.

    "No alert appeared" is not an explanation.
    """
    for decision in (
        decide(candidate(evidence=EvidenceSufficiency.INSUFFICIENT), now=NOW),
        decide(candidate(minutes_ago=200), now=NOW),
        decide(candidate(), now=NOW, issued_in_window=999),
    ):
        assert decision.raise_alert is False
        assert len(decision.reason) > 20
        assert decision.dedup_key


@pytest.mark.parametrize(
    ("evidence", "expected"),
    [
        (EvidenceSufficiency.STRONG, AlertSeverity.HIGH),
        (EvidenceSufficiency.MODERATE, AlertSeverity.MEDIUM),
        (EvidenceSufficiency.WEAK, AlertSeverity.LOW),
    ],
)
def test_evidence_sets_the_severity_floor(
    evidence: EvidenceSufficiency, expected: AlertSeverity
) -> None:
    """With no amount or time bonus, severity is exactly the evidence band."""
    decision = decide(
        candidate(evidence=evidence, amount="20000.00", minutes_ago=45), now=NOW
    )

    assert decision.severity is expected
