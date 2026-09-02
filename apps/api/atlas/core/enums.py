"""Shared domain enumerations.

These live in `core` because several modules reference them and duplicating an
enum across schemas is how two modules quietly disagree about what a value means.
"""

from __future__ import annotations

from enum import StrEnum


class CashOutChannel(StrEnum):
    """How value leaves the traceable banking system (master spec §8.1).

    Modelling this as ATM-only would be wrong for India in 2026. AePS cash-out
    through Business Correspondents is now a dominant vector, and it behaves
    differently from an ATM: different hours, different limits, different
    geography, different operator risk. Channel is therefore a first-class
    feature and a first-class filter, not a label.
    """

    ATM = "ATM"
    AEPS_BC = "AEPS_BC"
    BANK_BRANCH = "BANK_BRANCH"
    POS_CASHBACK = "POS_CASHBACK"
    MERCHANT_QR = "MERCHANT_QR"
    PREPAID_GIFT = "PREPAID_GIFT"
    CRYPTO_P2P = "CRYPTO_P2P"

    @property
    def is_geolocatable(self) -> bool:
        """Whether this channel has a physical endpoint that can be predicted.

        ``CRYPTO_P2P`` deliberately returns False. Its absence of coordinates is
        a modelled fact, not a null to be imputed — a crypto off-ramp is a real
        cash-out that our geospatial tiers structurally cannot rank, and the
        evaluation must exclude it rather than silently score it as a miss
        (master spec §17, label exclusions).
        """
        return self is not CashOutChannel.CRYPTO_P2P


class FraudTypology(StrEnum):
    """NCRP-recognisable fraud categories (master spec §9).

    Each has a different money-movement and cash-out signature, so typology is a
    feature rather than a display label.
    """

    DIGITAL_ARREST = "DIGITAL_ARREST"
    INVESTMENT_SCAM = "INVESTMENT_SCAM"
    UPI_COLLECT_FRAUD = "UPI_COLLECT_FRAUD"
    CUSTOMER_CARE_IMPERSONATION = "CUSTOMER_CARE_IMPERSONATION"
    LOAN_APP_EXTORTION = "LOAN_APP_EXTORTION"
    JOB_TASK_FRAUD = "JOB_TASK_FRAUD"
    SEXTORTION = "SEXTORTION"
    OTHER = "OTHER"


class CaseStatus(StrEnum):
    """Case lifecycle (master spec §26)."""

    NEW = "NEW"
    TRIAGED = "TRIAGED"
    INVESTIGATING = "INVESTIGATING"
    ACTION_RECOMMENDED = "ACTION_RECOMMENDED"
    ACTIONED = "ACTIONED"
    OUTCOME_RECORDED = "OUTCOME_RECORDED"
    CLOSED = "CLOSED"


class InterventionType(StrEnum):
    """Typed interventions, named by the problem statement (master spec §26).

    Typed rather than free text because intervention type is what outcomes are
    measured against. ``NO_ACTION`` is recorded explicitly with a reason: a null
    result is data, and treating it as absence of data biases the feedback loop.
    """

    DEPLOY_TEAM = "DEPLOY_TEAM"
    ALERT_LOCAL_BANK = "ALERT_LOCAL_BANK"
    ALERT_ATM_OPERATOR = "ALERT_ATM_OPERATOR"
    REQUEST_FUND_BLOCK = "REQUEST_FUND_BLOCK"
    REQUEST_CCTV = "REQUEST_CCTV"
    JURISDICTION_HANDOFF = "JURISDICTION_HANDOFF"
    NO_ACTION = "NO_ACTION"


class EvidenceSufficiency(StrEnum):
    """How much case-specific evidence backs a prediction (master spec §16.2).

    Part of the API contract, not a debug field. A ``WEAK`` prediction must not
    render like a ``STRONG`` one, and ``INSUFFICIENT`` emits no ranked candidates
    at all — only the zone forecast.
    """

    STRONG = "STRONG"
    MODERATE = "MODERATE"
    WEAK = "WEAK"
    INSUFFICIENT = "INSUFFICIENT"


class AlertSeverity(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class Role(StrEnum):
    """Roles (master spec §29). BANK_PARTNER has a real surface — see §28.1."""

    SUPER_ADMIN = "SUPER_ADMIN"
    NATIONAL_ANALYST = "NATIONAL_ANALYST"
    STATE_ANALYST = "STATE_ANALYST"
    DISTRICT_INVESTIGATOR = "DISTRICT_INVESTIGATOR"
    BANK_PARTNER = "BANK_PARTNER"
    AUDITOR = "AUDITOR"
    READ_ONLY_ANALYST = "READ_ONLY_ANALYST"


class JurisdictionLevel(StrEnum):
    """Federated tree: the PS specifies state and local levels coordinated by I4C."""

    NATIONAL = "NATIONAL"
    STATE = "STATE"
    RANGE = "RANGE"
    DISTRICT = "DISTRICT"
    POLICE_STATION = "POLICE_STATION"
