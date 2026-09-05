"""HTTP middleware: correlation ids, structured errors, rate limiting."""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable

import structlog
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from atlas.core import context
from atlas.core.errors import AtlasError
from atlas.core.ratelimit import RateLimiter, get_redis

logger = structlog.get_logger(__name__)

CORRELATION_HEADER = "X-Correlation-ID"

Handler = Callable[[Request], Awaitable[Response]]


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """Attach a correlation id to every request and return it on every response.

    Accepts an inbound id so a call spanning several services stays stitched
    together, but never trusts its shape: an attacker-supplied value ends up in
    logs, so it is length-capped and stripped of anything that could forge a log
    line.
    """

    MAX_INBOUND_LENGTH = 64

    async def dispatch(self, request: Request, call_next: Handler) -> Response:
        inbound = request.headers.get(CORRELATION_HEADER, "")
        if inbound and len(inbound) <= self.MAX_INBOUND_LENGTH and inbound.isalnum():
            correlation_id = inbound
        else:
            correlation_id = context.new_correlation_id()

        context.set_correlation_id(correlation_id)
        context.set_actor(None)

        started = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - started) * 1000

        response.headers[CORRELATION_HEADER] = correlation_id
        actor = context.get_actor()
        logger.info(
            "request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=round(elapsed_ms, 2),
            correlation_id=correlation_id,
            actor_id=str(actor.id) if actor else None,
            actor_role=actor.role if actor else None,
        )
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-caller request rate limit.

    Keyed on the authenticated actor where there is one, otherwise on client IP.
    Health checks are exempt — a limiter that can stop a readiness probe will
    eventually take a service out of rotation for being busy.
    """

    EXEMPT_PATHS = frozenset({"/health", "/health/ready", "/health/live", "/openapi.json"})

    async def dispatch(self, request: Request, call_next: Handler) -> Response:
        if request.url.path in self.EXEMPT_PATHS:
            return await call_next(request)

        actor = context.get_actor()
        if actor is not None:
            identity = str(actor.id)
        else:
            identity = request.client.host if request.client else "unknown"

        result = await RateLimiter(get_redis()).check_request_rate(identity)
        if not result.allowed:
            correlation_id = context.get_correlation_id()
            logger.warning(
                "rate_limited",
                identity=identity,
                path=request.url.path,
                correlation_id=correlation_id,
            )
            return JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limited",
                    "message": "Too many requests.",
                    "correlation_id": correlation_id,
                },
                headers={
                    "Retry-After": str(result.retry_after_seconds),
                    CORRELATION_HEADER: correlation_id,
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(result.limit)
        response.headers["X-RateLimit-Remaining"] = str(result.remaining)
        return response


async def atlas_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Turn a known error into a client-safe body.

    The detail and context go to the log; the client gets a code, a generic
    message and the correlation id. An investigator quoting that id lets an
    operator find the full context — without the API handing an attacker the
    internals for free.
    """
    assert isinstance(exc, AtlasError)
    correlation_id = context.get_correlation_id()
    logger.warning(
        "handled_error",
        error=exc.code,
        detail=exc.detail,
        path=request.url.path,
        correlation_id=correlation_id,
        **exc.context,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.to_client(correlation_id),
        headers={CORRELATION_HEADER: correlation_id},
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Last resort. **No stack trace ever reaches a client** (master spec §36).

    The traceback is logged in full. The response says only that something went
    wrong, and gives the id needed to find it.
    """
    correlation_id = context.get_correlation_id()
    logger.exception(
        "unhandled_error",
        path=request.url.path,
        correlation_id=correlation_id,
        error_type=type(exc).__name__,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_error",
            "message": "An internal error occurred.",
            "correlation_id": correlation_id,
        },
        headers={CORRELATION_HEADER: correlation_id},
    )
