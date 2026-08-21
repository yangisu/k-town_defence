"""Transactional PostgreSQL synchronization for KTO place snapshots."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Protocol
from uuid import UUID, uuid4

import anyio
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from .infrastructure.models import CatalogSyncRunModel, PlaceModel
from .ktour_area import KTourAreaPlace


class AreaClient(Protocol):
    def fetch_places(self, *, area_code: str, limit: int) -> tuple[KTourAreaPlace, ...]: ...


@dataclass(frozen=True)
class CatalogSyncResult:
    run_id: UUID
    status: str
    fetched_count: int
    active_count: int


class KTourPlaceSyncService:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        client: AreaClient,
    ) -> None:
        self._sessions = session_factory
        self._client = client

    async def sync(self, area_code: str = "6", limit: int = 100) -> CatalogSyncResult:
        run_id = uuid4()
        started_at = datetime.now(timezone.utc)
        async with self._sessions() as session:
            session.add(
                CatalogSyncRunModel(
                    id=run_id,
                    source="KTOUR_API",
                    area_code=area_code,
                    status="running",
                    fetched_count=0,
                    active_count=0,
                    started_at=started_at,
                )
            )
            await session.commit()

        try:
            places = await anyio.to_thread.run_sync(
                lambda: self._client.fetch_places(area_code=area_code, limit=limit)
            )
            if not places:
                raise ValueError("empty snapshot")
        except Exception:
            completed_at = datetime.now(timezone.utc)
            async with self._sessions() as session:
                run = await session.get(CatalogSyncRunModel, run_id)
                assert run is not None
                run.status = "failed"
                run.error_code = "TOUR_API_FAILED"
                run.completed_at = completed_at
                await session.commit()
            return CatalogSyncResult(run_id, "failed", 0, 0)

        completed_at = datetime.now(timezone.utc)
        content_ids = [place.content_id for place in places]
        snapshot_version = self._snapshot_version(places, completed_at)
        async with self._sessions() as session:
            for place in places:
                values = {
                    "id": uuid4(),
                    "content_id": place.content_id,
                    "name_ko": place.name_ko,
                    "address_ko": place.address_ko,
                    "latitude": Decimal(str(place.latitude)),
                    "longitude": Decimal(str(place.longitude)),
                    "region_code": place.region_code or area_code,
                    "description_ko": place.description_ko,
                    "source": "KTOUR_API",
                    "content_type_id": place.content_type_id,
                    "category_code": place.category_code,
                    "image_url": place.image_url,
                    "source_modified_at": place.source_modified_at,
                    "is_public": True,
                    "is_active": True,
                    "synced_at": completed_at,
                    "created_at": completed_at,
                    "updated_at": completed_at,
                }
                statement = insert(PlaceModel).values(**values)
                await session.execute(
                    statement.on_conflict_do_update(
                        index_elements=[PlaceModel.content_id],
                        set_={
                            key: value
                            for key, value in values.items()
                            if key not in {"id", "content_id", "created_at"}
                        },
                    )
                )
            await session.execute(
                update(PlaceModel)
                .where(
                    PlaceModel.source == "KTOUR_API",
                    PlaceModel.region_code == area_code,
                    PlaceModel.content_id.not_in(content_ids),
                )
                .values(is_active=False, updated_at=completed_at)
            )
            active_count = int(
                await session.scalar(
                    select(func.count(PlaceModel.id)).where(
                        PlaceModel.source == "KTOUR_API",
                        PlaceModel.region_code == area_code,
                        PlaceModel.is_active.is_(True),
                    )
                )
                or 0
            )
            run = await session.get(CatalogSyncRunModel, run_id)
            assert run is not None
            run.status = "succeeded"
            run.snapshot_version = snapshot_version
            run.fetched_count = len(places)
            run.active_count = active_count
            run.completed_at = completed_at
            await session.commit()
        return CatalogSyncResult(run_id, "succeeded", len(places), active_count)

    @staticmethod
    def _snapshot_version(
        places: tuple[KTourAreaPlace, ...], fallback: datetime
    ) -> str:
        modified = max(
            (place.source_modified_at for place in places if place.source_modified_at),
            default=fallback,
        )
        return f"KTOUR-{modified.astimezone(timezone.utc):%Y%m%d%H%M%S}-{len(places)}"
