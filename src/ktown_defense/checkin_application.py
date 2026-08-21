"""Persistent check-in use cases."""

from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from .api.errors import ApiError
from .infrastructure.models import CheckInSessionModel
from .infrastructure.repositories import CheckInRepository, PlaceRepository


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CheckInApplication:
    def __init__(
        self,
        session: AsyncSession,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self._session = session
        self._clock = clock
        self._checkins = CheckInRepository(session)
        self._places = PlaceRepository(session)

    async def create_session(self, user_id: str, place_id: UUID) -> CheckInSessionModel:
        now = self._clock()
        if await self._places.get_public(place_id) is None:
            raise ApiError(404, "PLACE_NOT_FOUND", "장소를 찾을 수 없습니다.")

        existing = await self._checkins.find_active_session(user_id, place_id, now)
        if existing is not None:
            return existing

        checkin = CheckInSessionModel(
            id=uuid4(),
            user_id=user_id,
            place_id=place_id,
            status="collecting",
            expires_at=now + timedelta(minutes=30),
            created_at=now,
            updated_at=now,
        )
        self._checkins.add_session(checkin)
        await self._session.commit()
        await self._session.refresh(checkin)
        return checkin

    async def get_session(
        self, user_id: str, session_id: UUID
    ) -> CheckInSessionModel:
        checkin = await self._checkins.get_owned(user_id, session_id, for_update=True)
        if checkin is None:
            raise ApiError(404, "CHECKIN_NOT_FOUND", "체크인을 찾을 수 없습니다.")
        if checkin.status in {"collecting", "ready"} and checkin.expires_at <= self._clock():
            checkin.status = "expired"
            checkin.updated_at = self._clock()
            await self._session.commit()
            await self._session.refresh(checkin)
        return checkin
