"""The DataConnector port (master spec §10.1, ADR-010).

Production ATLAS would read from NCRP, CFCFRMS and Samanvay. None of those is
reachable from a public repository, and none should be. So every external system
is a *port* with a synthetic implementation here, and the production connector is
a deployment activity carried out under legal authority.

The contract, not the implementation, is the deliverable. A connector that
satisfies these tests can be swapped in without touching anything downstream.
"""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any

from atlas.core.clock import utc_now


class ConnectorHealth(StrEnum):
    HEALTHY = "HEALTHY"
    DEGRADED = "DEGRADED"
    UNAVAILABLE = "UNAVAILABLE"


@dataclass(frozen=True)
class RawRecord:
    """One record as the source produced it, before normalisation.

    ``observed_at`` is stamped here, at the boundary, because this is the first
    moment ATLAS could have known the fact. Setting it later — after parsing, or
    at write time — would quietly move the point-in-time boundary and let a
    feature read something fractionally before it was knowable (§19.1).
    """

    source_system: str
    source_record_id: str
    payload: dict[str, Any]
    observed_at: datetime = field(default_factory=utc_now)
    batch_id: uuid.UUID | None = None

    def idempotency_key(self) -> str:
        """Stable identity for deduplication.

        Deliberately derived from source identity rather than content: a source
        that corrects a record keeps its id, and we want the correction to
        collide with the original rather than arrive as a second complaint.
        """
        return f"{self.source_system}:{self.source_record_id}"


@dataclass(frozen=True)
class ValidationIssue:
    """One reason a record was rejected. Counted, never silently dropped."""

    field: str
    problem: str
    severity: str = "error"


@dataclass(frozen=True)
class ValidationResult:
    ok: bool
    issues: Sequence[ValidationIssue] = ()

    @classmethod
    def valid(cls) -> ValidationResult:
        return cls(ok=True)

    @classmethod
    def invalid(cls, *issues: ValidationIssue) -> ValidationResult:
        return cls(ok=False, issues=issues)


class DataConnector(ABC):
    """A source of records.

    Five methods, matching the pipeline in §10.2. ``ingest`` yields rather than
    returning a list so a connector reading 8,000 complaints a day never has to
    hold a batch in memory.
    """

    #: Stable name recorded as provenance on every row this connector produces.
    source_system: str

    @abstractmethod
    async def health_check(self) -> ConnectorHealth:
        """Is the source reachable? Called before a batch and surfaced in metrics."""

    @abstractmethod
    def validate(self, record: RawRecord) -> ValidationResult:
        """Schema and business rules. Rejection is safe, counted and reported."""

    @abstractmethod
    def ingest(self, *, since: datetime | None = None) -> AsyncIterator[RawRecord]:
        """Yield records, oldest first.

        Declared without ``async`` on purpose: implementations are async
        generators, and an ``async def`` returning ``AsyncIterator`` would type
        as a coroutine yielding an iterator instead.

        ``since`` makes the read resumable: after a failure, ingestion restarts
        from the last successfully processed record rather than from the
        beginning.
        """

    @abstractmethod
    def normalize(self, record: RawRecord) -> dict[str, Any]:
        """Map a source payload onto the canonical schema (§11)."""
