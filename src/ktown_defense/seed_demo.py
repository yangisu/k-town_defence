"""Idempotently seed operator-managed demo and route anchor places."""

import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from .infrastructure.database import create_engine_and_session_factory
from .infrastructure.models import PlaceModel
from .settings import Settings
from .bts_busan_route import BTS_BUSAN_ROUTE


async def seed_demo_places(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    include_route_anchors: bool = False,
) -> None:
    async with session_factory() as session:
        now = datetime.now(timezone.utc)
        definitions = [
            {
                "content_id": "demo-busan-gamcheon",
                "name_ko": "감천문화마을",
                "address_ko": "부산광역시 사하구 감내2로 203",
                "latitude": Decimal("35.097500"),
                "longitude": Decimal("129.010600"),
                "description_ko": "부산 산복도로의 생활문화와 골목 풍경을 만나는 관광지",
                "discovery_keywords": [],
                "homepage_url": None,
                "source_operations": [],
            },
            *((
                {
                    "content_id": anchor.content_id,
                    "name_ko": anchor.name_ko,
                    "address_ko": anchor.address_ko,
                    "latitude": Decimal(str(anchor.latitude)),
                    "longitude": Decimal(str(anchor.longitude)),
                    "description_ko": "BTS 부산 원정의 필수 공식 앵커",
                    "discovery_keywords": list(anchor.aliases),
                    "homepage_url": anchor.homepage_url,
                    "source_operations": ["operator_verified_anchor"],
                }
                for anchor in BTS_BUSAN_ROUTE.anchors
            ) if include_route_anchors else ()),
        ]
        for definition in definitions:
            existing = await session.scalar(select(PlaceModel).where(
                PlaceModel.content_id == definition["content_id"]
            ))
            values = dict(
                **definition,
                region_code="6",
                source="operator",
                content_type_id="12",
                is_public=True,
                is_active=True,
                synced_at=now,
                updated_at=now,
            )
            if existing is not None:
                for key, value in values.items():
                    setattr(existing, key, value)
                continue
            session.add(PlaceModel(
                id=uuid4(),
                **values,
                created_at=now,
            ))
        await session.commit()


async def seed_bts_route_anchors(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Seed the legacy demo row and both versioned BTS route anchors."""
    await seed_demo_places(session_factory, include_route_anchors=True)


async def _main() -> None:
    engine, sessions = create_engine_and_session_factory(Settings().database_url)
    try:
        await seed_bts_route_anchors(sessions)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(_main())
