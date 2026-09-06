"""Audit API models (master spec §32, §29).

The response carries the chain's integrity status alongside the events, rather
than offering it at a separate endpoint. An audit trail is only worth reading if
it has not been altered, and a reader who has to make a second call to find that
out will read the events without it.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditEventOut(BaseModel):
    """One audited operation.

    ``detail`` is included, and on a denial it is the field that matters: the
    endpoint told the caller 404, and this is where the real reason lives —
    ``{"reason": "outside jurisdiction"}``. Returning events without it would
    make the 404 policy unauditable, which is the thing this endpoint exists to
    prevent.

    Credential material never reaches here: ``audit.service.record`` redacts a
    fixed set of keys at write time, so a field added to a detail blob later
    cannot leak one by accident.

    ``event_hash`` and ``previous_event_hash`` are exposed so a reader can check
    the chain themselves rather than taking :class:`ChainStatus` on trust. An
    integrity claim nobody can verify independently is a claim, not a guarantee.
    """

    id: uuid.UUID
    sequence: int
    occurred_at: datetime

    actor_id: uuid.UUID | None
    actor_role: str | None
    actor_jurisdiction: str | None

    action: str
    resource_type: str
    resource_id: str | None
    case_id: uuid.UUID | None

    result: str
    correlation_id: str
    source_ip: str | None
    user_agent: str | None
    detail: dict[str, Any]

    previous_event_hash: str
    event_hash: str


class ChainStatus(BaseModel):
    """Whether the hash chain still verifies, and what attests it.

    ``verified`` is the result of recomputing every hash and confirming each
    event binds to its predecessor — not a stored flag. A stored one would be
    exactly as forgeable as the rows it describes.

    ``last_checkpoint_at`` is the most recent Ed25519-signed checkpoint. Its
    absence is not a failure: checkpoints need a signing key, and a development
    deployment has none. It is reported as ``null`` rather than omitted so a
    reader can tell "no checkpoint has ever been signed" from "the field was not
    returned".
    """

    verified: bool
    events: int
    last_checkpoint_at: datetime | None
    #: Populated only when verification fails: the first sequence number at
    #: which the chain broke, and what broke. Naming the row is what turns "the
    #: chain is broken" into something an operator can act on.
    first_bad_sequence: int | None = None
    reason: str | None = None


class AuditListResponse(BaseModel):
    """Audit events the caller may see, with the chain status.

    ``total`` is scoped to the caller's jurisdiction, not the table count. A
    global total would leak how much is happening elsewhere — the same reason
    the complaint and alert listings scope theirs.

    ``chain.events`` deliberately counts the **whole** chain rather than the
    caller's slice: integrity is a property of the entire log, and a count
    filtered to one jurisdiction would describe something that was never
    verified. The two numbers differing is expected, not a bug.
    """

    items: list[AuditEventOut]
    total: int
    chain: ChainStatus
