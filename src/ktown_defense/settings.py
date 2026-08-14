from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://ktown_defense:local-development-only@localhost:5432/ktown_defense"
    object_storage_endpoint: str = "http://localhost:9000"
    object_storage_bucket: str = "ktown-defense-private"
    environment: str = "local"

    model_config = SettingsConfigDict(env_file=".env", env_prefix="KTOWN_", extra="ignore")
