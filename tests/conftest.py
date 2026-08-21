from collections.abc import AsyncIterator, Callable
from decimal import Decimal
import os
from uuid import uuid4

from httpx import ASGITransport, AsyncClient
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ktown_defense.api.main import create_app
from ktown_defense.infrastructure.database import create_engine_and_session_factory
from ktown_defense.infrastructure.models import PlaceModel
from ktown_defense.settings import Settings


DATABASE_URL = os.getenv(
    "KTOWN_TEST_DATABASE_URL",
    "postgresql+asyncpg://ktown:ktown@127.0.0.1:55432/ktown",
)


async def _truncate(session_factory: async_sessionmaker[AsyncSession]) -> None:
    async with session_factory() as session:
        await session.execute(
            text(
                "TRUNCATE TABLE checkin_submissions, checkin_photos, "
                "checkin_gps_samples, checkin_sessions, places CASCADE"
            )
        )
        await session.commit()


@pytest.fixture
async def session_factory() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine, factory = create_engine_and_session_factory(DATABASE_URL)
    await _truncate(factory)
    try:
        yield factory
    finally:
        await _truncate(factory)
        await engine.dispose()


@pytest.fixture
async def api_client(
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[AsyncClient]:
    app = create_app(Settings(database_url=DATABASE_URL, _env_file=None))
    app.state.session_factory = session_factory
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client


@pytest.fixture
async def member_client(api_client: AsyncClient) -> AsyncIterator[AsyncClient]:
    api_client.headers["X-KTown-User-Id"] = "member-1"
    yield api_client


@pytest.fixture
def place_factory(
    session_factory: async_sessionmaker[AsyncSession],
) -> Callable[..., object]:
    async def create_place(**overrides) -> PlaceModel:
        values = {
            "id": uuid4(),
            "content_id": f"content-{uuid4()}",
            "name_ko": "감천문화마을",
            "address_ko": "부산광역시 사하구",
            "latitude": Decimal("35.097500"),
            "longitude": Decimal("129.010600"),
            "region_code": "6",
            "description_ko": "부산의 산복도로 문화마을",
            "is_public": True,
            "is_active": True,
        }
        values.update(overrides)
        place = PlaceModel(**values)
        async with session_factory() as session:
            session.add(place)
            await session.commit()
            await session.refresh(place)
        return place

    return create_place


@pytest.fixture
async def public_place(place_factory) -> PlaceModel:
    return await place_factory()
