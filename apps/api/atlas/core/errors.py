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
