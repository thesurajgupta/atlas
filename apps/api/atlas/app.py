"""FastAPI application factory.

Assembles the modular monolith into one deployable app (ADR-009). Each module
contributes a router; nothing here reaches into another module's internals.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

from atlas.core.config import Environment, get_settings
from atlas.core.database import dispose_engine
from atlas.core.errors import AtlasError
from atlas.core.middleware import (
    CorrelationIdMiddleware,
    RateLimitMiddleware,
    atlas_error_handler,
    unhandled_error_handler,
)
from atlas.core.ratelimit import close_redis
from atlas.iam.router import router as iam_router


def configure_logging() -> None:
    """Structured JSON logs, with no sensitive values (master spec §30, §39).

    JSON rather than human-readable because these are meant to be searched by
    correlation id during an incident, not read as they scroll past.
    """
    settings = get_settings()
    logging.basicConfig(format="%(message)s", level=settings.log_level)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelName(settings.log_level)
        ),
        cache_logger_on_first_use=True,
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    structlog.get_logger(__name__).info("atlas.start", env=get_settings().env.value)
    yield
    await dispose_engine()
    await close_redis()


def create_app() -> FastAPI:
    settings = get_settings()
    is_production = settings.env is Environment.PRODUCTION

    app = FastAPI(
        title="ATLAS",
        description=(
            "Predictive cash-out intelligence for cybercrime complaints (SIH26184). "
            "All data in this deployment is synthetic."
        ),
        version="0.1.0",
        lifespan=lifespan,
        # Interactive docs are useful in development and are an unnecessary
        # surface in production, where the schema is published deliberately
        # rather than served to anyone who finds the host.
        docs_url=None if is_production else "/docs",
        redoc_url=None,
        openapi_url=None if is_production else "/openapi.json",
    )

    # Order matters: correlation id is added last so it runs first, and every
    # later middleware — including the rate limiter's rejection — has an id to
    # attach to its response.
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(CorrelationIdMiddleware)

    app.add_exception_handler(AtlasError, atlas_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)

    app.include_router(iam_router)

    @app.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        """Liveness. Deliberately checks nothing external.

        A liveness probe that fails when the database is slow causes an
        orchestrator to restart a process that was working fine, turning a
        dependency blip into an outage.
        """
        return {"status": "ok"}

    @app.get("/health/ready", tags=["health"])
    async def ready() -> dict[str, str]:
        """Readiness. Reports whether this instance can serve traffic.

        Unimplemented dependency checks land with the resilience work (§37); a
        readiness probe that returns "ok" without checking anything would be
        worse than none, so this states plainly that it is liveness-equivalent
        for now.
        """
        return {"status": "ok", "checks": "liveness-only"}

    return app


app = create_app()
