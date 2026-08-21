"""Validated runtime settings for the HTTP and persistence adapters."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="KTOWN_",
        extra="ignore",
    )

    environment: str = "development"
    database_url: str = "postgresql+asyncpg://ktown:ktown@127.0.0.1:55432/ktown"
    upload_dir: Path = Path(".data/private-uploads")
    ktour_service_key: SecretStr | None = Field(
        default=None,
        validation_alias="KTOUR_SERVICE_KEY",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
