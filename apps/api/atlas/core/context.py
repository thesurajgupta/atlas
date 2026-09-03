"""Per-request context.

A correlation id is attached to every request and carried through logs, errors
and audit events. When an investigator reports "it failed at 14:03", that id is
what turns a vague complaint into a single traceable request.

Uses ``contextvars`` rather than a global so concurrent requests cannot read each
other's context — with async handlers a module-level variable would leak one
request's actor into another's audit event.
"""

from __future__ import annotations

import uuid
from contextvars import ContextVar
from dataclasses import dataclass

_correlation_id: ContextVar[str | None] = ContextVar("correlation_id", default=None)
_actor: ContextVar[RequestActor | None] = ContextVar("actor", default=None)


@dataclass(frozen=True)
class RequestActor:
    """The authenticated caller, if there is one."""

    id: uuid.UUID
    role: str
    jurisdiction_id: uuid.UUID
    token_jti: str


def new_correlation_id() -> str:
    return uuid.uuid4().hex


def set_correlation_id(value: str) -> None:
    _correlation_id.set(value)


def get_correlation_id() -> str:
    """Never returns empty. An error with no correlation id cannot be traced."""
    return _correlation_id.get() or new_correlation_id()


_break_glass_used: ContextVar[bool] = ContextVar("break_glass_used", default=False)


def set_actor(actor: RequestActor | None) -> None:
    _actor.set(actor)
    _break_glass_used.set(False)


def set_break_glass_used(used: bool) -> None:
    """Mark that this request relied on a break-glass grant.

    Recorded on the audit event rather than only on the grant. A grant audited
    once and then used invisibly for an hour tells a reviewer almost nothing.
    """
    _break_glass_used.set(used)


def break_glass_used() -> bool:
    return _break_glass_used.get()


def get_actor() -> RequestActor | None:
    return _actor.get()
