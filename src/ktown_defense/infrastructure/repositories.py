"""Focused persistence operations for places and check-ins."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import CheckInSessionModel, PlaceModel


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
