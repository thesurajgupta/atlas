"""Redis Streams event bus (ADR-003, master spec §10.2).

At-least-once delivery is the contract, so the tests that matter are about what
happens when a handler fails — not the happy path.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from atlas.core.config import get_settings
from atlas.core.events import (
    DEAD_LETTER_STREAM,
    MAX_DELIVERIES,
    Event,
    InMemoryEventBus,
    RedisEventBus,
)
from redis.asyncio import Redis


@pytest.fixture
async def redis() -> AsyncIterator[Redis]:
    client = Redis.from_url(get_settings().redis_url, decode_responses=True)
    try:
        await client.ping()
    except Exception:  # noqa: BLE001 — any connection failure means "no Redis"
        pytest.skip("Redis not reachable — run `make up`")
    yield client
    await client.aclose()


@pytest.fixture
def stream() -> str:
    return f"atlas:test:{uuid.uuid4().hex[:8]}"


def _event(n: int = 1) -> Event:
    return Event(
        type="complaint.ingested",
        payload={"public_ref": f"CMP-SYN-{n:07d}", "amount": "1000.00"},
        correlation_id="corr-test",
    )


# --- serialisation --------------------------------------------------------


def test_event_survives_a_round_trip() -> None:
    """Everything on a Redis stream is a string; nothing may be lost in transit."""
    original = _event()
    restored = Event.from_fields(original.to_fields())
    assert restored.id == original.id
    assert restored.type == original.type
    assert restored.payload == original.payload
    assert restored.correlation_id == original.correlation_id
    assert restored.occurred_at == original.occurred_at


def test_payload_serialisation_is_deterministic() -> None:
    """Same payload, same bytes — so a replay is byte-identical."""
    payload = {"b": 2, "a": 1}
    assert (
        Event(type="t", payload=payload).to_fields()["payload"]
        == (Event(type="t", payload=payload).to_fields()["payload"])
    )


# --- the in-memory double -------------------------------------------------


async def test_in_memory_bus_delivers_once_per_group() -> None:
    """The double must honour the same contract, or tests using it lie."""
    bus = InMemoryEventBus()
    await bus.publish("s", _event(1))
    await bus.publish("s", _event(2))

    seen: list[str] = []

    async def handler(event: Event) -> None:
        seen.append(event.payload["public_ref"])

    assert await bus.consume("s", "g", "c", handler) == 2
    assert await bus.consume("s", "g", "c", handler) == 0, (
        "already-consumed events redelivered"
    )
    assert len(seen) == 2


# --- Redis ----------------------------------------------------------------


async def test_publish_and_consume(redis: Redis, stream: str) -> None:
    bus = RedisEventBus(redis)
    await bus.publish(stream, _event(1))

    received: list[Event] = []

    async def handler(event: Event) -> None:
        received.append(event)

    assert await bus.consume(stream, "g1", "c1", handler) == 1
    assert received[0].payload["public_ref"] == "CMP-SYN-0000001"
    await redis.delete(stream)


async def test_consumer_group_can_start_before_any_producer(
    redis: Redis, stream: str
) -> None:
    """Otherwise startup order silently decides whether the system works."""
    bus = RedisEventBus(redis)

    async def handler(event: Event) -> None:  # pragma: no cover - nothing to read
        raise AssertionError("no events expected")

    assert await bus.consume(stream, "g1", "c1", handler) == 0
    await redis.delete(stream)


async def test_unacknowledged_event_is_redelivered(redis: Redis, stream: str) -> None:
    """The reason handlers must be idempotent.

    A crash between processing and acknowledgement leaves the message pending,
    and it comes back.
    """
    bus = RedisEventBus(redis)
    await bus.publish(stream, _event(1))

    async def failing(event: Event) -> None:
        raise RuntimeError("handler blew up")

    assert await bus.consume(stream, "g1", "c1", failing, claim_idle_ms=0) == 0

    pending = await redis.xpending(stream, "g1")
    assert pending["pending"] == 1, "a failed handler must leave the message pending"
    await redis.delete(stream)


async def test_poison_message_is_dead_lettered(redis: Redis, stream: str) -> None:
    """One bad message must not block the stream forever."""
    bus = RedisEventBus(redis)
    await bus.publish(stream, _event(1))

    async def always_fails(event: Event) -> None:
        raise RuntimeError("poison")

    # claim_idle_ms=0 so each pass immediately reclaims the pending message
    # instead of waiting out the production idle window.
    for _ in range(MAX_DELIVERIES + 1):
        await bus.consume(stream, "g1", "c1", always_fails, claim_idle_ms=0)

    dlq = await redis.xrange(DEAD_LETTER_STREAM, count=50)
    assert any(fields.get("original_stream") == stream for _, fields in dlq), (
        "a repeatedly failing message must reach the dead-letter stream"
    )

    await redis.delete(stream)


async def test_two_groups_each_see_every_event(redis: Redis, stream: str) -> None:
    """Fan-out: prediction and alerting both consume complaints independently."""
    bus = RedisEventBus(redis)
    await bus.publish(stream, _event(1))

    counts: dict[str, int] = {"a": 0, "b": 0}

    def make(name: str):  # type: ignore[no-untyped-def]
        async def handler(event: Event) -> None:
            counts[name] += 1

        return handler

    assert await bus.consume(stream, "group-a", "c", make("a")) == 1
    assert await bus.consume(stream, "group-b", "c", make("b")) == 1
    assert counts == {"a": 1, "b": 1}
    await redis.delete(stream)
