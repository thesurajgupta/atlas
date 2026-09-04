"""Synthetic connectors (master spec §10.1, ADR-010).

These are the only connectors in this repository. Production connectors to NCRP,
CFCFRMS and Samanvay are specified by the port and its contract tests, and
implemented in a controlled deployment under legal authority.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator, Iterable
from datetime import datetime
from typing import Any

from atlas.core.enums import FraudTypology
from atlas.ingest.ports import (
    ConnectorHealth,
    DataConnector,
    RawRecord,
    ValidationIssue,
    ValidationResult,
)
from atlas.ingest.quality import check_amount, check_required, check_timestamps, combine

REQUIRED_COMPLAINT_FIELDS = (
    "public_ref",
    "reported_at",
    "typology",
    "reported_amount",
    "victim_jurisdiction_id",
)


class SyntheticComplaintConnector(DataConnector):
    """Complaints in the shape NCRP would deliver them.

    Backed by an in-memory sequence so tests and the demo are deterministic. The
    simulator (Phase 2) will feed this same interface; nothing downstream has to
    change when it does.
    """

    source_system = "synthetic-ncrp"

    def __init__(self, records: Iterable[dict[str, Any]] | None = None) -> None:
        self._payloads = list(records or [])

    async def health_check(self) -> ConnectorHealth:
        return ConnectorHealth.HEALTHY

    def validate(self, record: RawRecord) -> ValidationResult:
        payload = record.payload
        missing = check_required(payload, REQUIRED_COMPLAINT_FIELDS)
        if missing:
            # Stop here: timestamp and amount checks would fail confusingly on
            # fields that simply are not present.
            return combine(missing)

        issues = list(missing)
        amount_issue = check_amount(payload["reported_amount"])
        if amount_issue:
            issues.append(amount_issue)

        try:
            reported_at = _parse_dt(payload["reported_at"])
            initiated = (
                _parse_dt(payload["fraud_initiated_at"])
                if payload.get("fraud_initiated_at")
                else None
            )
            issues.extend(check_timestamps(reported_at, initiated))
        except (ValueError, TypeError) as exc:
            issues.append(ValidationIssue("reported_at", f"unparseable timestamp: {exc}"))

        try:
            FraudTypology(payload["typology"])
        except ValueError:
            issues.append(ValidationIssue("typology", f"unknown typology {payload['typology']!r}"))

        return combine(issues)

    async def ingest(self, *, since: datetime | None = None) -> AsyncIterator[RawRecord]:
        batch = uuid.uuid4()
        for payload in self._payloads:
            record = RawRecord(
                source_system=self.source_system,
                source_record_id=str(payload.get("public_ref", uuid.uuid4())),
                payload=payload,
                batch_id=batch,
            )
            if since is not None:
                try:
                    if _parse_dt(payload["reported_at"]) <= since:
                        continue
                except (KeyError, ValueError, TypeError):
                    # An unparseable timestamp must not be skipped by the resume
                    # filter — let it through so validation rejects it visibly.
                    pass
            yield record

    def normalize(self, record: RawRecord) -> dict[str, Any]:
        payload = record.payload
        return {
            "public_ref": str(payload["public_ref"]).strip(),
            "reported_at": _parse_dt(payload["reported_at"]),
            "fraud_initiated_at": (
                _parse_dt(payload["fraud_initiated_at"])
                if payload.get("fraud_initiated_at")
                else None
            ),
            "typology": FraudTypology(payload["typology"]),
            "reported_amount": str(payload["reported_amount"]),
            "currency": str(payload.get("currency", "INR")).upper(),
            "victim_jurisdiction_id": uuid.UUID(str(payload["victim_jurisdiction_id"])),
            # Narrative is attacker-controlled text. Length-capped here; it is
            # never an authoritative source of a financial fact (§11, §34).
            "narrative": (str(payload["narrative"])[:8000] if payload.get("narrative") else None),
            "reported_beneficiary_account": _clean(payload.get("reported_beneficiary_account"), 64),
            "reported_beneficiary_ifsc": _clean(payload.get("reported_beneficiary_ifsc"), 16),
            "source_system": record.source_system,
            "source_record_id": record.source_record_id,
            "ingestion_batch_id": record.batch_id,
            "observed_at": record.observed_at,
        }


def _parse_dt(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value))


def _clean(value: Any, limit: int) -> str | None:
    if value in (None, ""):
        return None
    return str(value).strip()[:limit]
