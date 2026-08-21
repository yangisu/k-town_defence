"""Idempotently seed one public place for local integrated-mode verification."""

import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from .infrastructure.database import create_engine_and_session_factory
from .infrastructure.models import PlaceModel
from .settings import Settings


async def seed_demo_places(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        existing = await session.scalar(
            select(PlaceModel).where(
                PlaceModel.content_id == "demo-busan-gamcheon"
            )
        )
        if existing is not None:
            return
        now = datetime.now(timezone.utc)
        session.add(
            PlaceModel(
                id=uuid4(),
                content_id="demo-busan-gamcheon",
                name_ko="감천문화마을",
                address_ko="부산광역시 사하구 감내2로 203",
                latitude=Decimal("35.097500"),
                longitude=Decimal("129.010600"),
                region_code="6",
                description_ko="부산 산복도로의 생활문화와 골목 풍경을 만나는 관광지",
                is_public=True,
                is_active=True,
                synced_at=now,
                created_at=now,
                updated_at=now,
            )
        )
        await session.commit()


async def _main() -> None:
    engine, sessions = create_engine_and_session_factory(Settings().database_url)
    try:
        await seed_demo_places(sessions)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(_main())
