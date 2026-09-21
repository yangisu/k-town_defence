"""Idempotently seed operator-managed demo and fixed-route places."""

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
        now = datetime.now(timezone.utc)
        definitions = (
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
            {
                "content_id": "operator:bts-busan-asiad",
                "name_ko": "부산아시아드주경기장",
                "address_ko": "부산광역시 연제구 월드컵대로 344",
                "latitude": Decimal("35.190100"),
                "longitude": Decimal("129.058400"),
                "description_ko": "BTS 부산 공연의 공식 개최 장소",
                "discovery_keywords": ["부산아시아드경기장", "부산아시아드주경기장", "부산아시아드 주경기장"],
                "homepage_url": "https://www.busan.go.kr/stadium/sfintro",
                "source_operations": ["operator_verified_anchor"],
            },
            {
                "content_id": "operator:busan-gamcheon",
                "name_ko": "감천문화마을",
                "address_ko": "부산광역시 사하구 감내1로 200",
                "latitude": Decimal("35.097700"),
                "longitude": Decimal("129.010400"),
                "description_ko": "부산의 대표 산복도로 문화마을",
                "discovery_keywords": ["감천문화마을", "감천 문화마을", "부산 감천문화마을"],
                "homepage_url": "https://saha.go.kr/portalEn/contents.do?mId=0201000000",
                "source_operations": ["operator_verified_anchor"],
            },
        )
        for values in definitions:
            existing = await session.scalar(
                select(PlaceModel).where(PlaceModel.content_id == values["content_id"])
            )
            if existing is None:
                session.add(PlaceModel(
                    id=uuid4(), region_code="6", source="operator",
                    is_public=True, is_active=True, synced_at=now,
                    created_at=now, updated_at=now, **values,
                ))
            else:
                # Operator fixtures are authoritative and cannot be overwritten by
                # a failed or stale tourism sync.
                for field, value in values.items():
                    setattr(existing, field, value)
                existing.source = "operator"
                existing.is_public = True
                existing.is_active = True
                existing.updated_at = now
        await session.commit()


async def _main() -> None:
    engine, sessions = create_engine_and_session_factory(Settings().database_url)
    try:
        await seed_demo_places(sessions)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(_main())
