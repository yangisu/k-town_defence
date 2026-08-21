import asyncio
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine

from tests.conftest import DATABASE_URL


PROJECT_ROOT = Path(__file__).resolve().parents[2]
EXPECTED_TABLES = {"users", "fandoms", "seasons", "season_memberships"}


def _config() -> Config:
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", DATABASE_URL)
    return config


async def _membership_schema() -> tuple[set[str], list[tuple[str, str]], int]:
    engine = create_async_engine(DATABASE_URL)
    try:
        async with engine.connect() as connection:
            tables = await connection.run_sync(
                lambda sync_connection: set(inspect(sync_connection).get_table_names())
            )
            fandoms = list(
                (
                    await connection.execute(
                        text("SELECT name_ko, artist_name_ko FROM fandoms ORDER BY id")
                    )
                ).tuples()
            )
            current_seasons = int(
                (
                    await connection.execute(
                        text(
                            "SELECT count(*) FROM seasons "
                            "WHERE starts_at <= now() AND ends_at > now()"
                        )
                    )
                ).scalar_one()
            )
            return tables, fandoms, current_seasons
    finally:
        await engine.dispose()


def test_membership_migration_creates_constraints_and_seed_catalog() -> None:
    command.upgrade(_config(), "head")

    tables, fandoms, current_seasons = asyncio.run(_membership_schema())

    assert EXPECTED_TABLES <= tables
    assert fandoms == [
        ("ARMY", "방탄소년단"),
        ("BLINK", "BLACKPINK"),
        ("CARAT", "SEVENTEEN"),
    ]
    assert current_seasons == 1
