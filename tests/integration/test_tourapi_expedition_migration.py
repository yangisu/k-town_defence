import asyncio
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

from tests.conftest import DATABASE_URL


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _config() -> Config:
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", DATABASE_URL)
    return config


async def _schema() -> tuple[set[str], set[str], set[str]]:
    engine = create_async_engine(DATABASE_URL)
    try:
        async with engine.connect() as connection:
            return await connection.run_sync(
                lambda conn: (
                    set(inspect(conn).get_table_names()),
                    {
                        column["name"]
                        for column in inspect(conn).get_columns("places")
                    },
                    {
                        column["name"]
                        for column in inspect(conn).get_columns("open_api_call_logs")
                    },
                )
            )
    finally:
        await engine.dispose()


def test_expedition_migration_adds_enrichment_and_safe_call_log() -> None:
    command.upgrade(_config(), "head")
    tables, place_columns, log_columns = asyncio.run(_schema())

    assert "open_api_call_logs" in tables
    assert {
        "homepage_url",
        "telephone",
        "open_time",
        "rest_date",
        "parking",
        "intro_json",
        "info_json",
        "image_urls",
        "festival_start_date",
        "festival_end_date",
        "discovery_keywords",
        "source_operations",
    } <= place_columns
    assert log_columns == {
        "id",
        "sync_run_id",
        "operation",
        "feature",
        "status",
        "response_count",
        "error_code",
        "started_at",
        "completed_at",
    }
    assert "service_key" not in log_columns
    assert "request_url" not in log_columns
