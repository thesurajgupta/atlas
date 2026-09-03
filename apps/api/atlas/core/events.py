"""The event bus (ADR-003, master spec §10.2).

Redis Streams behind an ``EventBus`` port. The sizing argument is in ADR-003:
8,000 complaints a day is roughly 0.1 events/sec mean, and even at 5× headroom
with bursty peaks and ~20 derived events per complaint this stays in the low
hundreds per second. Kafka is provisioned for three orders of magnitude more and
would not fit on the demo laptop. The port is the migration seam.

Consumers must be idempotent. Redis Streams gives at-least-once delivery, so a
handler will occasionally see the same event twice — after a consumer crash
between processing and acknowledgement, which is exactly when it is least
convenient.
"""

from __future__ import annotations

import json
import uuid
from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import structlog
from redis.asyncio import Redis

from atlas.core.clock import utc_now

logger = structlog.get_logger(__name__)

#: Poison messages land here rather than blocking the stream forever.
DEAD_LETTER_STREAM = "atlas:dlq"

#: How many times a message is retried before it is considered poison. Low on
#: purpose: a message failing five times will fail the sixth, and meanwhile it
#: is holding up everything behind it.
MAX_DELIVERIES = 5

#: How long a message must sit unacknowledged before another consumer may claim
#: it. Covers the case that motivates at-least-once delivery: a consumer that
#: read a message and then died.
CLAIM_IDLE_MS = 30_000


@dataclass(frozen=True)
class Event:
    """One thing that happened."""

    type: str
    payload: dict[str, Any]
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    occurred_at: datetime = field(default_factory=utc_now)
    correlation_id: str = ""

    def to_fields(self) -> dict[str, str]:
        """Redis stream fields. Everything is a string on the wire."""
        return {
            "id": self.id,
            "type": self.type,
            "occurred_at": self.occurred_at.isoformat(),
            "correlation_id": self.correlation_id,
            "payload": json.dumps(self.payload, separators=(",", ":"), sort_keys=True),
        }

    @classmethod
    def from_fields(cls, fields: dict[str, str]) -> Event:
        return cls(
            id=fields["id"],
            type=fields["type"],
            occurred_at=datetime.fromisoformat(fields["occurred_at"]),
            correlation_id=fields.get("correlation_id", ""),
            payload=json.loads(fields["payload"]),
        )


Handler = Callable[[Event], Awaitable[None]]


class EventBus(ABC):
    """The port. One production implementation, one in-memory test double."""

    @abstractmethod
    async def publish(self, stream: str, event: Event) -> str:
        """Append an event. Returns the broker's message id."""

    @abstractmethod
    async def consume(
        self, stream: str, group: str, consumer: str, handler: Handler, *, limit: int = 10
    ) -> int:
        """Process up to ``limit`` pending events. Returns how many succeeded."""


class RedisEventBus(EventBus):
    """Redis Streams with consumer groups."""

    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def publish(self, stream: str, event: Event) -> str:
        message_id = await self._redis.xadd(stream, event.to_fields())
        logger.debug("event.published", stream=stream, type=event.type, event_id=event.id)
        return str(message_id)

    async def ensure_group(self, stream: str, group: str) -> None:
        """Create the consumer group, tolerating the case where it exists.

        ``mkstream=True`` so a consumer can start before any producer has run —
        otherwise startup order silently decides whether the system works.
        """
        try:
            await self._redis.xgroup_create(stream, group, id="0", mkstream=True)
        except Exception as exc:  # noqa: BLE001 — redis raises a generic error here
            if "BUSYGROUP" not in str(exc):
                raise

    async def consume(
        self,
        stream: str,
        group: str,
        consumer: str,
        handler: Handler,
        *,
        limit: int = 10,
        claim_idle_ms: int = CLAIM_IDLE_MS,
    ) -> int:
        """Reclaim, read, handle, acknowledge.

        Acknowledgement happens only after the handler returns. A crash before
        that leaves the message pending and it is redelivered — which is why
        handlers must be idempotent rather than merely careful.
        """
        await self.ensure_group(stream, group)

        # Reclaim abandoned messages before reading new ones. Without this a
        # message read by a consumer that then crashed stays pending forever:
        # `xreadgroup` with ">" only ever returns messages nobody has seen, so
        # nothing would retry and the dead-letter path would be unreachable.
        _, claimed, _ = await self._redis.xautoclaim(
            stream, group, consumer, min_idle_time=claim_idle_ms, count=limit
        )

        batches = await self._redis.xreadgroup(group, consumer, {stream: ">"}, count=limit)
        pending: list[tuple[str, dict[str, str]]] = list(claimed)
        for _, messages in batches:
            pending.extend(messages)

        processed = 0
        for message_id, fields in pending:
            try:
                await handler(Event.from_fields(fields))
            except Exception:
                logger.exception("event.handler_failed", stream=stream, message_id=str(message_id))
                await self._maybe_dead_letter(stream, group, message_id, fields)
                continue
            await self._redis.xack(stream, group, message_id)
            processed += 1
        return processed

    async def _maybe_dead_letter(
        self, stream: str, group: str, message_id: str, fields: dict[str, str]
    ) -> None:
        """Move a repeatedly failing message aside.

        Without this one poison message blocks the stream indefinitely. It is
        acknowledged only after being copied to the DLQ, so a failure here leaves
        it pending rather than losing it.
        """
        pending = await self._redis.xpending_range(
            stream, group, min=message_id, max=message_id, count=1
        )
        deliveries = int(pending[0]["times_delivered"]) if pending else 1
        if deliveries < MAX_DELIVERIES:
            return

        dlq_fields: dict[str, str] = dict(fields)
        dlq_fields["original_stream"] = stream
        dlq_fields["deliveries"] = str(deliveries)
        await self._redis.xadd(DEAD_LETTER_STREAM, dlq_fields)  # type: ignore[arg-type]
        await self._redis.xack(stream, group, message_id)
        logger.warning(
            "event.dead_lettered", stream=stream, message_id=str(message_id), deliveries=deliveries
        )


class InMemoryEventBus(EventBus):
    """Test double. Same contract, no broker.

    Exists so tests of publishing behaviour do not need Redis running, and so a
    contributor without Docker can still run most of the suite.
    """

    def __init__(self) -> None:
        self.published: dict[str, list[Event]] = {}
        self._offsets: dict[tuple[str, str], int] = {}

    async def publish(self, stream: str, event: Event) -> str:
        self.published.setdefault(stream, []).append(event)
        return f"{stream}-{len(self.published[stream])}"

    async def consume(
        self, stream: str, group: str, consumer: str, handler: Handler, *, limit: int = 10
    ) -> int:
        events = self.published.get(stream, [])
        start = self._offsets.get((stream, group), 0)
        processed = 0
        for event in events[start : start + limit]:
            await handler(event)
            processed += 1
        self._offsets[(stream, group)] = start + processed
        return processed


# Stream names. Constants rather than literals so a typo is an import error
# rather than a queue nobody is reading.
STREAM_COMPLAINTS = "atlas:complaints"
STREAM_TRANSACTIONS = "atlas:transactions"
STREAM_PREDICTIONS = "atlas:predictions"
STREAM_ALERTS = "atlas:alerts"
