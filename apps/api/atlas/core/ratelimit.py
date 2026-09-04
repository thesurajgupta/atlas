"""Redis-backed rate limiting (master spec §36).

Two distinct limits, because they defend different things:

* **Request rate** — ordinary abuse and runaway clients.
* **Query budget** — the per-analyst daily cap on prediction queries. That one is
  a security control, not a performance control: it limits how much of the risk
  surface a single insider can enumerate (threat T-01, §35.1).

Both use a fixed window. A sliding window is more accurate at the boundary, but a
fixed window is far cheaper and the boundary case here is not worth the cost —
an attacker gaining a few extra queries at a window edge is not the threat.
"""

from __future__ import annotations

from dataclasses import dataclass

from redis.asyncio import Redis

from atlas.core.config import get_settings


@dataclass(frozen=True)
class LimitResult:
    allowed: bool
    remaining: int
    limit: int
    retry_after_seconds: int


class RateLimiter:
    """Fixed-window counter in Redis."""

    def __init__(self, redis: Redis[str]) -> None:
        self._redis = redis

    async def check(self, key: str, *, limit: int, window_seconds: int) -> LimitResult:
        """Increment and report. Fails **open** on Redis being unavailable.

        A deliberate choice, and the opposite of our usual fail-closed rule: if
        Redis dies, refusing every request would take the whole investigator
        platform down over a cache outage. Rate limiting is a mitigation, not an
        authorisation boundary — the actual access decisions are enforced in
        `atlas.iam` and by database grants, and neither depends on Redis.

        The query budget is the exception: `atlas.predict` must treat a Redis
        outage as a hard stop, because there the limit *is* the control.
        """
        try:
            pipe = self._redis.pipeline()
            pipe.incr(key)
            pipe.ttl(key)
            count, ttl = await pipe.execute()
        except Exception:  # noqa: BLE001 — any Redis failure means "no limiter"
            return LimitResult(allowed=True, remaining=limit, limit=limit, retry_after_seconds=0)

        if ttl == -1:  # freshly created key carries no expiry yet
            await self._redis.expire(key, window_seconds)
            ttl = window_seconds

        remaining = max(0, limit - int(count))
        return LimitResult(
            allowed=int(count) <= limit,
            remaining=remaining,
            limit=limit,
            retry_after_seconds=max(1, int(ttl)),
        )

    async def check_request_rate(self, identity: str) -> LimitResult:
        settings = get_settings()
        return await self.check(
            f"rl:req:{identity}", limit=settings.rate_limit_per_minute, window_seconds=60
        )


_redis: Redis[str] | None = None


def get_redis() -> Redis[str]:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(get_settings().redis_url, decode_responses=True)
    return _redis


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()  # type: ignore[attr-defined]
    _redis = None
