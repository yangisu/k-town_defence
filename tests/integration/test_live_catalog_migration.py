import asyncio
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

from ktown_defense.settings import Settings
from tests.conftest import DATABASE_URL


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _config() -> Config:
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", DATABASE_URL)
    return config


async def _schema() -> tuple[set[str], set[str]]:
    engine = create_async_engine(DATABASE_URL)
    try:
        async with engine.connect() as connection:
            return await connection.run_sync(
                lambda conn: (
                    set(inspect(conn).get_table_names()),
                    {column["name"] for column in inspect(conn).get_columns("places")},
                )
            )
    finally:
        await engine.dispose()


def test_live_catalog_migration_adds_metadata_and_run_table() -> None:
    command.upgrade(_config(), "head")
    tables, place_columns = asyncio.run(_schema())

    assert "catalog_sync_runs" in tables
    assert {
        "source",
        "content_type_id",
        "category_code",
        "image_url",
        "source_modified_at",
    } <= place_columns


def test_upload_dir_is_configurable(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("KTOWN_UPLOAD_DIR", str(tmp_path))

    assert Settings(_env_file=None).upload_dir == tmp_path
