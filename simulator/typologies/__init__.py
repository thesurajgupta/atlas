"""One generator per NCRP fraud category (spec §9, §23.1, issue #5).

``GENERATORS`` maps each modelled typology to its generator class. ``FraudTypology.OTHER`` has
no dedicated generator — spec §9 defines behavioural signatures for exactly seven categories, and
a catch-all "other" would either duplicate one of them or encode an assumption nobody has made
deliberately. Scenarios needing a generic fallback should pick an explicit typology instead.

See ``base.py`` for the shared engine and ``docs/ml/typology-assumptions.md`` for the rationale
behind each profile's numbers.
"""

from __future__ import annotations

from atlas.core.enums import FraudTypology

from .base import (
    AccountPool,
    AccountRef,
    AmountCurve,
    CashOutEvent,
    EndpointRef,
    EndpointRegistry,
    FraudScenario,
    GeographicDispersion,
    LayeringHop,
    TypologyGenerator,
    TypologyProfile,
)
from .customer_care import CustomerCareImpersonationGenerator
from .digital_arrest import DigitalArrestGenerator
from .investment_scam import InvestmentScamGenerator
from .job_task import JobTaskFraudGenerator
from .loan_app import LoanAppExtortionGenerator
from .sextortion import SextortionGenerator
from .upi_collect import UpiCollectFraudGenerator

GENERATORS: dict[FraudTypology, type[TypologyGenerator]] = {
    FraudTypology.DIGITAL_ARREST: DigitalArrestGenerator,
    FraudTypology.INVESTMENT_SCAM: InvestmentScamGenerator,
    FraudTypology.UPI_COLLECT_FRAUD: UpiCollectFraudGenerator,
    FraudTypology.CUSTOMER_CARE_IMPERSONATION: CustomerCareImpersonationGenerator,
    FraudTypology.LOAN_APP_EXTORTION: LoanAppExtortionGenerator,
    FraudTypology.JOB_TASK_FRAUD: JobTaskFraudGenerator,
    FraudTypology.SEXTORTION: SextortionGenerator,
}

__all__ = [
    "GENERATORS",
    "AccountPool",
    "AccountRef",
    "AmountCurve",
    "CashOutEvent",
    "CustomerCareImpersonationGenerator",
    "DigitalArrestGenerator",
    "EndpointRef",
    "EndpointRegistry",
    "FraudScenario",
    "GeographicDispersion",
    "InvestmentScamGenerator",
    "JobTaskFraudGenerator",
    "LayeringHop",
    "LoanAppExtortionGenerator",
    "SextortionGenerator",
    "TypologyGenerator",
    "TypologyProfile",
    "UpiCollectFraudGenerator",
]
