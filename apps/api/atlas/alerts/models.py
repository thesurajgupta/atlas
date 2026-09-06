"""Persisted alert decisions (master spec §35.1, §26).

Every decision `policy.decide` makes is stored here — **including the ones that
did not raise an alert**. That is the point of the table, and it is the part
that is easy to skip.

An alert that was not sent is a judgement the system made on somebody's behalf.
If a case goes wrong and a supervisor asks why nobody was told, "no alert
appeared" is not an explanation; it cannot distinguish a deliberate suppression
from a pipeline that never ran. Storing only the raised ones throws away the
record of every decision except the easy ones.

So ``raised`` is a column rather than a filter, ``severity`` is nullable because
a suppression has none, and ``reason`` is populated in both cases, verbatim from
the policy. The policy already writes reasons a human can act on — "jurisdiction
budget exhausted (25/25 in window); escalate rather than repeat" — and
paraphrasing them here would be a second, worse copy.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from atlas.core.database import Base
from atlas.core.enums import AlertSeverity
from atlas.core.mixins import Timestamps, UUIDPrimaryKey

SCHEMA = "alerts"


class Alert(UUIDPrimaryKey, Timestamps, Base):
    """One alert decision: raised or suppressed, with the reason either way.

    Deliberately **not** an ``ObservationBase``. Other tables carry
    ``observed_at`` because they record a fact that became knowable at some
    instant, and features may only read what was knowable. An alert is not an
    observation about the world — it is an action this system took, and
    ``issued_at`` is when it took it. Giving it an ``observed_at`` would invite a
    feature to read it, and an alert derived from a prediction feeding back into
    the next prediction is the self-confirming loop §19.4 exists to prevent.
    """

    __tablename__ = "alert"
    __table_args__ = (
        # The suppression-window lookup. `_recent_keys` asks for the dedup keys
        # in one jurisdiction inside the last six hours, and `_issued_in_window`
        # counts raised alerts in the last twenty-four — both are this index,
        # read left to right.
        Index("ix_alert_jurisdiction_dedup_issued", "jurisdiction_id", "dedup_key", "issued_at"),
        # The listing endpoint: newest first within a jurisdiction.
        Index("ix_alert_jurisdiction_issued", "jurisdiction_id", "issued_at"),
        Index("ix_alert_case_ref", "case_ref"),
        {"schema": SCHEMA},
    )

    #: The case this alert is about, by its public reference rather than its id.
    #: `alerts` sits above `cases` in the layering contract (ADR-009) and may not
    #: hold a foreign key into it; the reference is what the policy already
    #: carries and what an investigator recognises.
    case_ref: Mapped[str] = mapped_column(String(32), nullable=False)

    #: Who this alert belongs to. Every read is scoped by it (§29), so it is not
    #: nullable: an alert nobody owns is one nobody can be shown, and a null here
    #: would be invisible to every jurisdiction-scoped query rather than visible
    #: to all of them.
    jurisdiction_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)

    #: Null when suppressed. A suppressed alert has no severity because it was
    #: never rated — defaulting one would invent a judgement the policy declined
    #: to make.
    severity: Mapped[AlertSeverity | None] = mapped_column(
        Enum(AlertSeverity, name="alert_severity", schema=SCHEMA), nullable=True
    )

    #: False for a suppression. The column, not the absence of a row, is what
    #: makes a suppression reviewable.
    raised: Mapped[bool] = mapped_column(Boolean, nullable=False)

    #: Verbatim from ``AlertDecision.reason``. ``Text`` rather than a bounded
    #: string: these are sentences written for a human, and truncating one at
    #: some column width would cut off the half that explains the decision.
    reason: Mapped[str] = mapped_column(Text, nullable=False)

    #: Identity of the decision, not the message — see ``policy.dedup_key``.
    dedup_key: Mapped[str] = mapped_column(String(32), nullable=False)

    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    #: Acknowledgement is only meaningful for a raised alert; a suppressed one
    #: was never shown to anybody to acknowledge.
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_by_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), nullable=True
    )
