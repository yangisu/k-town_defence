"""Focused persistence operations for places and check-ins."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import PlaceModel


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
