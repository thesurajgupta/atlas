"""Request and response models for authentication endpoints."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=256)
    totp_code: str | None = Field(default=None, min_length=6, max_length=6)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    # S105: the OAuth2 token *type*, not a credential (RFC 6750 §2.1).
    token_type: str = "bearer"  # noqa: S105
    expires_in: int


class InvestigatorProfile(BaseModel):
    """The caller's own identity.

    Deliberately narrow. This endpoint exists so a client can render "logged in
    as", not so it can enumerate the directory — it returns only the caller's own
    record and no one else's.
    """

    id: uuid.UUID
    username: str
    display_name: str
    role: str
    jurisdiction_id: uuid.UUID
    mfa_enrolled: bool
