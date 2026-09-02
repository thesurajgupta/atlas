"""Configuration. Environment only, never hard-coded (master spec §46)."""

from __future__ import annotations

from enum import StrEnum
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _repo_root() -> Path:
    """Locate the repository root by walking up for a marker file.

    Settings must resolve identically whether invoked from the repo root, from
    `apps/api` (alembic), or from a test runner's temp directory. Relying on the
    current working directory silently loads a different configuration depending
    on where you happened to stand.
    """
    here = Path(__file__).resolve()
    for candidate in (here, *here.parents):
        if (candidate / "docker-compose.yml").exists():
            return candidate
    return here.parents[-1]


ENV_FILE = _repo_root() / ".env"


class Environment(StrEnum):
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


class Settings(BaseSettings):
    """Runtime settings, loaded from environment or ``.env``."""

    model_config = SettingsConfigDict(
        env_prefix="ATLAS_", env_file=ENV_FILE, extra="ignore", frozen=True
    )

    env: Environment = Environment.DEVELOPMENT
    log_level: str = "INFO"

    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "atlas"
    db_user: str = "atlas_app"
    # S105: deliberate non-secret placeholder for local development only.
    # model_post_init refuses these values outside development.
    db_password: str = "change-me-locally"  # noqa: S105

    # Separate role with NO grant on the `truth` schema (master spec §19.2).
    feature_db_user: str = "atlas_features"
    feature_db_password: str = "change-me-locally"  # noqa: S105

    redis_url: str = "redis://localhost:6379/0"

    access_token_ttl_seconds: int = 900
    refresh_token_ttl_seconds: int = 86400
    mfa_required: bool = True
    jwt_secret: str = "generate-a-random-value-locally"  # noqa: S105

    h3_resolution: int = Field(default=7, ge=0, le=15)
    candidate_set_cap: int = Field(default=500, gt=0)

    query_budget_per_analyst_per_day: int = Field(default=500, gt=0)
    rate_limit_per_minute: int = Field(default=120, gt=0)

    notification_provider: str = "mock"
    allow_external_notifications: bool = False

    def model_post_init(self, _: object) -> None:
        """Fail closed: a placeholder secret must never reach a real environment.

        Refusing to start is the correct behaviour. A system that boots with a
        known-public signing key is worse than one that does not boot, because
        the failure is silent.
        """
        if self.env is Environment.DEVELOPMENT:
            return
        placeholders = {"generate-a-random-value-locally", "change-me-locally", ""}
        if self.jwt_secret in placeholders:
            raise ValueError(f"jwt_secret is a placeholder; refusing to start in {self.env}")
        if self.db_password in placeholders:
            raise ValueError(f"db_password is a placeholder; refusing to start in {self.env}")
        if self.allow_external_notifications and self.notification_provider == "mock":
            raise ValueError("external notifications enabled but provider is still 'mock'")

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    @property
    def feature_database_url(self) -> str:
        """Connection for the feature pipeline — a role with no `truth` grant."""
        return (
            f"postgresql+asyncpg://{self.feature_db_user}:{self.feature_db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
