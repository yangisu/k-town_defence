"""Transactional publication of enriched regional expedition data."""

from __future__ import annotations

from collections.abc import Callable
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Protocol
from uuid import UUID, uuid4

import anyio
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from .infrastructure.models import (
    CatalogSyncRunModel,
    OpenApiCallLogModel,
    PlaceModel,
)
from .ktour_expedition import TourismExpeditionSnapshot
from .open_data_observability import OpenApiCallObservation
from .place_sync import CatalogSyncResult


class ExpeditionClient(Protocol):
    @property
    def observations(self) -> tuple[OpenApiCallObservation, ...]: ...

    def fetch_snapshot(
        self,
        *,
        area_code: str,
        keywords: tuple[str, ...],
        start_date: date,
        end_date: date,
        limit: int,
        force_full: bool = False,
        modified_since: datetime | None = None,
    ) -> TourismExpeditionSnapshot: ...


class TourismExpeditionSyncService:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        client: ExpeditionClient,
        *,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._sessions = session_factory
        self._client = client
        self._clock = clock or (lambda: datetime.now(timezone.utc))

    async def sync(
        self,
        *,
        area_code: str,
        keywords: tuple[str, ...],
        start_date: date,
        end_date: date,
        limit: int,
        force_full: bool = False,
    ) -> CatalogSyncResult:
        async with self._sessions() as session:
            existing_count = int(
                await session.scalar(
                    select(func.count(PlaceModel.id)).where(
                        PlaceModel.source == "KTOUR_API",
                        PlaceModel.region_code == area_code,
                    )
                )
                or 0
            )
            last_successful_at = await session.scalar(
                select(func.max(CatalogSyncRunModel.completed_at)).where(
                    CatalogSyncRunModel.source == "KTOUR_API",
                    CatalogSyncRunModel.area_code == area_code,
                    CatalogSyncRunModel.status == "succeeded",
                )
            )
        effective_full = force_full or existing_count == 0
        run_id = uuid4()
        started_at = self._clock()
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
            snapshot = await anyio.to_thread.run_sync(
                lambda: self._client.fetch_snapshot(
                    area_code=area_code,
                    keywords=keywords,
                    start_date=start_date,
                    end_date=end_date,
                    limit=limit,
                    force_full=effective_full,
                    modified_since=None if effective_full else last_successful_at,
                )
            )
            if effective_full and not snapshot.places:
                raise ValueError("empty validated snapshot")
        except Exception:
            return await self._record_failure(run_id)

        completed_at = self._clock()
        async with self._sessions() as session:
            for place in snapshot.places:
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
                    "homepage_url": place.homepage_url,
                    "telephone": place.telephone,
                    "open_time": place.open_time,
                    "rest_date": place.rest_date,
                    "parking": place.parking,
                    "intro_json": dict(place.intro),
                    "info_json": [dict(item) for item in place.info],
                    "image_urls": list(place.image_urls),
                    "festival_start_date": place.festival_start_date,
                    "festival_end_date": place.festival_end_date,
                    "discovery_keywords": list(place.discovery_keywords),
                    "source_operations": list(place.source_operations),
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
            if effective_full:
                published_ids = [place.content_id for place in snapshot.places]
                await session.execute(
                    update(PlaceModel)
                    .where(
                        PlaceModel.source == "KTOUR_API",
                        PlaceModel.region_code == area_code,
                        PlaceModel.content_id.not_in(published_ids),
                    )
                    .values(is_active=False, updated_at=completed_at)
                )
            elif snapshot.deleted_content_ids:
                await session.execute(
                    update(PlaceModel)
                    .where(
                        PlaceModel.source == "KTOUR_API",
                        PlaceModel.region_code == area_code,
                        PlaceModel.content_id.in_(snapshot.deleted_content_ids),
                    )
                    .values(is_active=False, updated_at=completed_at)
                )
            self._add_observations(session, run_id, snapshot.observations)
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
            run.snapshot_version = self._snapshot_version(snapshot, completed_at)
            run.fetched_count = len(snapshot.places)
            run.active_count = active_count
            run.completed_at = completed_at
            await session.commit()
        return CatalogSyncResult(run_id, "succeeded", len(snapshot.places), active_count)

    async def _record_failure(self, run_id: UUID) -> CatalogSyncResult:
        completed_at = self._clock()
        async with self._sessions() as session:
            run = await session.get(CatalogSyncRunModel, run_id)
            assert run is not None
            run.status = "failed"
            run.error_code = "TOUR_API_FAILED"
            run.completed_at = completed_at
            self._add_observations(
                session,
                run_id,
                tuple(getattr(self._client, "observations", ())),
            )
            await session.commit()
        return CatalogSyncResult(run_id, "failed", 0, 0)

    @staticmethod
    def _add_observations(
        session: AsyncSession,
        run_id: UUID,
        observations: tuple[OpenApiCallObservation, ...],
    ) -> None:
        session.add_all(
            OpenApiCallLogModel(
                id=uuid4(),
                sync_run_id=run_id,
                operation=item.operation,
                feature=item.feature,
                status=item.status,
                response_count=item.response_count,
                error_code=item.error_code,
                started_at=item.started_at,
                completed_at=item.completed_at,
            )
            for item in observations
        )

    @staticmethod
    def _snapshot_version(
        snapshot: TourismExpeditionSnapshot, fallback: datetime
    ) -> str:
        modified = max(
            (
                place.source_modified_at
                for place in snapshot.places
                if place.source_modified_at is not None
            ),
            default=fallback,
        )
        return f"KTOUR-EXPEDITION-{modified.astimezone(timezone.utc):%Y%m%d%H%M%S}-{len(snapshot.places)}"
