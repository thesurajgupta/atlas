"""The ingestion pipeline (master spec §10.2).

Every record passes through the same seven steps, in order:

  validate → normalise → deduplicate → tag provenance → classify → persist → audit

Idempotency is the property that matters most. A source will replay a batch
after a network failure, and 8,000 complaints a day means that will happen. A
replay must produce no duplicate complaint and no duplicate alert — so
deduplication keys on source identity, and the database enforces it too, because
an application-level check alone loses a race.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

import structlog
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from atlas.audit.service import Actor, AuditRequest
from atlas.audit.service import record as audit_record
from atlas.complaints.models import Complaint
from atlas.core import context
from atlas.core.classification import Classification
from atlas.ingest.ports import DataConnector, RawRecord
from atlas.ingest.quality import QualityReport

logger = structlog.get_logger(__name__)

#: Below this, a batch is treated as suspect rather than merely lossy. A sudden
#: drop usually means the source changed its format, and continuing to accept the
#: survivors would quietly bias whatever is built on them.
MIN_ACCEPTANCE_RATE = 0.80


@dataclass
class IngestionOutcome:
    report: QualityReport
    batch_id: uuid.UUID
    suspect: bool = False

    @property
    def summary(self) -> str:
        r = self.report
        return (
            f"{r.accepted} accepted, {r.rejected} rejected, {r.duplicates} duplicate "
            f"({r.acceptance_rate:.0%} accepted)"
        )


async def _already_ingested(session: AsyncSession, record: RawRecord) -> bool:
    result = await session.execute(
        select(Complaint.id).where(
            Complaint.source_system == record.source_system,
            Complaint.source_record_id == record.source_record_id,
        )
    )
    return result.scalar_one_or_none() is not None


async def ingest_complaints(
    session: AsyncSession,
    connector: DataConnector,
    *,
    actor: Actor | None = None,
) -> IngestionOutcome:
    """Run one batch through the pipeline.

    Rejected records are counted by reason and reported. They are never silently
    dropped: a pipeline quietly discarding 5% of complaints is indistinguishable
    from one receiving 5% fewer, and only one of those is a bug.
    """
    report = QualityReport()
    batch_id = uuid.uuid4()

    async for raw in connector.ingest():
        outcome = connector.validate(raw)
        if not outcome.ok:
            for issue in outcome.issues:
                report.record_rejection(f"{issue.field}: {issue.problem}")
            continue

        if await _already_ingested(session, raw):
            report.duplicates += 1
            continue

        fields = connector.normalize(raw)
        fields["ingestion_batch_id"] = batch_id
        complaint = Complaint(
            **fields,
            classification=Classification.SENSITIVE,
            is_synthetic=True,
        )
        session.add(complaint)
        try:
            await session.flush()
        except IntegrityError:
            # The application check above lost a race with a concurrent batch.
            # The unique constraint is the real guarantee; this is the expected
            # way that guarantee announces itself.
            await session.rollback()
            report.duplicates += 1
            continue

        report.accepted += 1

    suspect = report.total > 0 and report.acceptance_rate < MIN_ACCEPTANCE_RATE

    await audit_record(
        session,
        AuditRequest(
            action="ingest.batch",
            resource_type="complaint_batch",
            resource_id=str(batch_id),
            result="degraded" if suspect else "allowed",
            correlation_id=context.get_correlation_id(),
            detail={
                "source": connector.source_system,
                "accepted": report.accepted,
                "rejected": report.rejected,
                "duplicates": report.duplicates,
                "acceptance_rate": round(report.acceptance_rate, 4),
                "top_rejection_reasons": dict(report.reasons.most_common(5)),
            },
        ),
        actor or Actor(role="system"),
    )

    if suspect:
        logger.warning(
            "ingest.batch_suspect",
            source=connector.source_system,
            batch_id=str(batch_id),
            acceptance_rate=report.acceptance_rate,
            reasons=dict(report.reasons.most_common(5)),
        )

    return IngestionOutcome(report=report, batch_id=batch_id, suspect=suspect)
