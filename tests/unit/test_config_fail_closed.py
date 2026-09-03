"""Configuration fails closed outside development (master spec §7)."""

from __future__ import annotations

import pytest
from atlas.core.config import MIN_JWT_SECRET_BYTES, Settings


def test_development_boots_with_placeholders() -> None:
    """Local development must stay frictionless."""
    assert Settings(env="development").env.value == "development"


def test_production_refuses_a_placeholder_secret() -> None:
    with pytest.raises(ValueError, match="placeholder"):
        Settings(env="production", jwt_secret="generate-a-random-value-locally")


def test_production_refuses_a_short_secret() -> None:
    """A real but short secret passes the placeholder check and is still weak."""
    with pytest.raises(ValueError, match="at least"):
        Settings(env="production", jwt_secret="x" * (MIN_JWT_SECRET_BYTES - 1))


def test_production_accepts_a_strong_secret() -> None:
    settings = Settings(
        env="production",
        jwt_secret="y" * MIN_JWT_SECRET_BYTES,
        db_password="a-real-password",
    )
    assert settings.env.value == "production"


def test_production_refuses_a_placeholder_db_password() -> None:
    with pytest.raises(ValueError, match="placeholder"):
        Settings(env="production", jwt_secret="y" * 40, db_password="change-me-locally")


def test_external_notifications_cannot_be_enabled_with_a_mock_provider() -> None:
    """A half-configured real provider must not silently no-op."""
    with pytest.raises(ValueError, match="mock"):
        Settings(
            env="production",
            jwt_secret="y" * 40,
            db_password="real",
            allow_external_notifications=True,
            notification_provider="mock",
        )
