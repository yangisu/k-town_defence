"""Persistent check-in use cases."""

from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from .api.errors import ApiError
from .infrastructure.models import CheckInSessionModel, GpsSampleModel, PhotoModel
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

    async def add_gps(
        self,
        user_id: str,
        session_id: UUID,
        *,
        sequence: int,
        latitude: float,
        longitude: float,
        accuracy_meters: float,
        captured_at: datetime,
    ) -> GpsSampleModel:
        checkin = await self._get_open_owned(user_id, session_id)
        latest = await self._checkins.latest_gps_sequence(session_id)
        if latest is not None and sequence <= latest:
            raise ApiError(409, "GPS_SEQUENCE_CONFLICT", "GPS 순번이 이전 값보다 커야 합니다.")
        sample = GpsSampleModel(
            id=uuid4(),
            session_id=session_id,
            sequence=sequence,
            latitude=latitude,
            longitude=longitude,
            accuracy_meters=accuracy_meters,
            captured_at=captured_at,
            received_at=self._clock(),
        )
        self._checkins.add_gps(sample)
        await self._session.flush()
        await self._mark_ready_if_complete(checkin)
        await self._session.commit()
        await self._session.refresh(sample)
        return sample

    async def add_photo(
        self,
        user_id: str,
        session_id: UUID,
        *,
        storage_key: str,
        content_type: str,
        size_bytes: int,
        sha256: str,
        captured_at: datetime,
    ) -> PhotoModel:
        checkin = await self._get_open_owned(user_id, session_id)
        if storage_key.startswith(("/", "\\")) or ".." in storage_key.split("/"):
            raise ApiError(422, "INVALID_STORAGE_KEY", "사진 저장 키가 올바르지 않습니다.")
        photo = PhotoModel(
            id=uuid4(),
            session_id=session_id,
            storage_key=storage_key,
            content_type=content_type,
            size_bytes=size_bytes,
            sha256=sha256,
            captured_at=captured_at,
            created_at=self._clock(),
        )
        self._checkins.add_photo(photo)
        await self._session.flush()
        await self._mark_ready_if_complete(checkin)
        await self._session.commit()
        await self._session.refresh(photo)
        return photo

    async def _get_open_owned(
        self, user_id: str, session_id: UUID
    ) -> CheckInSessionModel:
        checkin = await self._checkins.get_owned(user_id, session_id, for_update=True)
        if checkin is None:
            raise ApiError(404, "CHECKIN_NOT_FOUND", "체크인을 찾을 수 없습니다.")
        if checkin.status in {"collecting", "ready"} and checkin.expires_at <= self._clock():
            checkin.status = "expired"
            checkin.updated_at = self._clock()
            await self._session.commit()
            raise ApiError(409, "CHECKIN_EXPIRED", "체크인 세션이 만료되었습니다.")
        if checkin.status not in {"collecting", "ready"}:
            raise ApiError(409, "CHECKIN_CLOSED", "증거를 추가할 수 없는 체크인입니다.")
        return checkin

    async def _mark_ready_if_complete(self, checkin: CheckInSessionModel) -> None:
        if await self._checkins.has_gps(checkin.id) and await self._checkins.has_photo(
            checkin.id
        ):
            checkin.status = "ready"
            checkin.updated_at = self._clock()
