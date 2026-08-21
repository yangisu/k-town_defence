"""Focused persistence operations for places and check-ins."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import (
    CheckInSessionModel,
    GpsSampleModel,
    PhotoModel,
    PlaceModel,
    SubmissionModel,
)


class PlaceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_public(self) -> list[PlaceModel]:
        result = await self._session.scalars(
            select(PlaceModel)
            .where(PlaceModel.is_public.is_(True), PlaceModel.is_active.is_(True))
            .order_by(PlaceModel.name_ko, PlaceModel.id)
        )
        return list(result)

    async def search_public(
        self,
        *,
        region_code: str | None = None,
        category: str | None = None,
        query: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[PlaceModel], int]:
        statement = select(PlaceModel).where(
            PlaceModel.is_public.is_(True), PlaceModel.is_active.is_(True)
        )
        if region_code:
            statement = statement.where(PlaceModel.region_code == region_code)
        category_types = {
            "culture": ("12", "14", "25", "28", "32", "38"),
            "event": ("15",),
            "local_food": ("39",),
            "kpop": (),
        }
        if category:
            types = category_types[category]
            statement = statement.where(
                PlaceModel.content_type_id.in_(types) if types else False
            )
        if query:
            escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            pattern = f"%{escaped}%"
            statement = statement.where(
                or_(
                    PlaceModel.name_ko.ilike(pattern, escape="\\"),
                    PlaceModel.address_ko.ilike(pattern, escape="\\"),
                )
            )
        total = int(
            await self._session.scalar(
                select(func.count()).select_from(statement.order_by(None).subquery())
            )
            or 0
        )
        result = await self._session.scalars(
            statement.order_by(PlaceModel.name_ko, PlaceModel.id)
            .limit(limit)
            .offset(offset)
        )
        return list(result), total

    async def get_public(self, place_id: UUID) -> PlaceModel | None:
        return await self._session.scalar(
            select(PlaceModel).where(
                PlaceModel.id == place_id,
                PlaceModel.is_public.is_(True),
                PlaceModel.is_active.is_(True),
            )
        )


class CheckInRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def find_active_session(
        self, user_id: str, place_id: UUID, now: datetime
    ) -> CheckInSessionModel | None:
        return await self._session.scalar(
            select(CheckInSessionModel)
            .where(
                CheckInSessionModel.user_id == user_id,
                CheckInSessionModel.place_id == place_id,
                CheckInSessionModel.status.in_(("collecting", "ready")),
                CheckInSessionModel.expires_at > now,
            )
            .order_by(CheckInSessionModel.created_at.desc())
            .limit(1)
        )

    async def get_owned(
        self, user_id: str, session_id: UUID, *, for_update: bool = False
    ) -> CheckInSessionModel | None:
        statement = select(CheckInSessionModel).where(
            CheckInSessionModel.id == session_id,
            CheckInSessionModel.user_id == user_id,
        )
        if for_update:
            statement = statement.with_for_update()
        return await self._session.scalar(statement)

    def add_session(self, checkin: CheckInSessionModel) -> None:
        self._session.add(checkin)

    async def latest_gps_sequence(self, session_id: UUID) -> int | None:
        return await self._session.scalar(
            select(func.max(GpsSampleModel.sequence)).where(
                GpsSampleModel.session_id == session_id
            )
        )

    def add_gps(self, sample: GpsSampleModel) -> None:
        self._session.add(sample)

    def add_photo(self, photo: PhotoModel) -> None:
        self._session.add(photo)

    async def has_gps(self, session_id: UUID) -> bool:
        count = await self._session.scalar(
            select(func.count(GpsSampleModel.id)).where(
                GpsSampleModel.session_id == session_id
            )
        )
        return bool(count)

    async def has_photo(self, session_id: UUID) -> bool:
        count = await self._session.scalar(
            select(func.count(PhotoModel.id)).where(PhotoModel.session_id == session_id)
        )
        return bool(count)

    async def get_submission(self, session_id: UUID) -> SubmissionModel | None:
        return await self._session.scalar(
            select(SubmissionModel).where(SubmissionModel.session_id == session_id)
        )

    def add_submission(self, submission: SubmissionModel) -> None:
        self._session.add(submission)
