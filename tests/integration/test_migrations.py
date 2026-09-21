import asyncio
import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATABASE_URL = os.getenv(
    "KTOWN_TEST_DATABASE_URL",
    "postgresql+asyncpg://ktown:ktown@127.0.0.1:55432/ktown_test",
)
EXPECTED_TABLES = {
    "alembic_version",
    "places",
    "checkin_sessions",
    "checkin_gps_samples",
    "checkin_photos",
    "checkin_submissions",
    "expeditions",
    "expedition_stops",
}


def _config() -> Config:
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", DATABASE_URL)
    return config


async def _table_names() -> set[str]:
    engine = create_async_engine(DATABASE_URL)
    try:
        async with engine.connect() as connection:
            return set(
                await connection.run_sync(
                    lambda sync_connection: inspect(sync_connection).get_table_names()
                )
            )
    finally:
        await engine.dispose()


async def _route_schema() -> tuple[set[str], set[str]]:
    engine = create_async_engine(DATABASE_URL)
    try:
        async with engine.connect() as connection:
            return await connection.run_sync(lambda sync_connection: (
                {column["name"] for column in inspect(sync_connection).get_columns("expedition_stops")},
                {column["name"] for column in inspect(sync_connection).get_columns("expeditions")},
            ))
    finally:
        await engine.dispose()


def test_upgrade_downgrade_and_reupgrade_manage_the_mvp_schema() -> None:
    config = _config()

    command.upgrade(config, "head")
    assert EXPECTED_TABLES <= asyncio.run(_table_names())
    stop_columns, expedition_columns = asyncio.run(_route_schema())
    assert {
        "stop_kind", "is_required", "placement", "recommendation_source",
        "recommendation_reason", "recommendation_metadata",
    } <= stop_columns
    assert {"route_key", "route_version"} <= expedition_columns

    command.downgrade(config, "base")
    assert asyncio.run(_table_names()) == {"alembic_version"}

    command.upgrade(config, "head")
    assert EXPECTED_TABLES <= asyncio.run(_table_names())
