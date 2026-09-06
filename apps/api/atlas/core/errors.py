"""Structured errors.

Internal detail never reaches a client (master spec §36). Every error carries a
correlation id so an operator can find the full context in the logs, while the
response body stays opaque.
"""

from __future__ import annotations

from typing import Any


class AtlasError(Exception):
    """Base class. Carries a client-safe message and private context."""

    status_code: int = 500
    code: str = "internal_error"
    client_message: str = "An internal error occurred."

    def __init__(self, detail: str | None = None, **context: Any) -> None:
        super().__init__(detail or self.client_message)
        self.detail = detail
        self.context = context

    def to_client(self, correlation_id: str) -> dict[str, Any]:
        """Client-facing body. Deliberately excludes ``detail`` and ``context``."""
        return {
            "error": self.code,
            "message": self.client_message,
            "correlation_id": correlation_id,
        }


class ValidationError(AtlasError):
    status_code = 422
    code = "validation_error"
    client_message = "The request failed validation."


class NotFoundError(AtlasError):
    status_code = 404
    code = "not_found"
    client_message = "The requested resource was not found."


class AuthenticationError(AtlasError):
    status_code = 401
    code = "authentication_required"
    client_message = "Authentication is required."


class AuthorizationError(AtlasError):
    """Raised when an authenticated actor lacks permission.

    Returns 404 rather than 403 for resource-level denials, so that probing
    cannot be used to enumerate which case ids exist outside the caller's
    jurisdiction. The distinction is recorded in the audit log, where it belongs.
    """

    status_code = 404
    code = "not_found"
    client_message = "The requested resource was not found."


class ForbiddenError(AtlasError):
    """Raised when a role may not use an endpoint at all. Returns **403**.

    The counterpart to :class:`AuthorizationError`, and the difference is about
    what the status code discloses rather than about severity.

    ``AuthorizationError`` answers "may you see *this record*", and returns 404
    because a 403 would confirm the record exists — enough to map case ids in
    other jurisdictions by probing.

    This one answers "may your role use *this endpoint*", where the endpoint's
    existence is not a secret: it is published in the OpenAPI schema. Refusing
    with 404 would tell an auditor whose role was misconfigured that the audit
    API is missing, rather than that their permissions are wrong — a worse
    answer that protects nothing.

    Use it only for role-level refusals. Anything that depends on *which* row is
    being read stays a 404.
    """

    status_code = 403
    code = "forbidden"
    client_message = "Your role does not permit this operation."


class JurisdictionError(AuthorizationError):
    """Denied because the resource lies outside the actor's jurisdiction."""


class QuotaExceededError(AtlasError):
    """Per-analyst query budget exhausted (threat T-01, master spec §35.1)."""

    status_code = 429
    code = "quota_exceeded"
    client_message = "Query budget exceeded for this period."


class LeakageError(AtlasError):
    """A feature read data it must not see.

    This is deliberately an exception rather than a filtered result. Silently
    dropping a future-dated row would let a leak pass unnoticed; failing loudly
    is the point of the gate (master spec §19).
    """

    status_code = 500
    code = "leakage_guard"
    client_message = "An internal error occurred."
