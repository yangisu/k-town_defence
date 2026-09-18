"""Persistent check-in use cases."""

from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from .api.errors import ApiError
from .infrastructure.models import (
    CheckInSessionModel,
    GpsSampleModel,
    PhotoModel,
    PlaceModel,
    SubmissionModel,
)
from .infrastructure.repositories import CheckInRepository, PlaceRepository
from .verification import (
    VerificationEvidence,
    VerificationPolicy,
    VerificationSample,
    classify_verification,
    distance_meters,
)

FIRST_VISIT_POINTS = 100


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

    async def submit(
        self, user_id: str, session_id: UUID, idempotency_key: str
    ) -> SubmissionModel:
        try:
            parsed_key = UUID(idempotency_key)
        except ValueError as error:
            raise ApiError(
                422, "INVALID_IDEMPOTENCY_KEY", "멱등성 키는 UUID-v4여야 합니다."
            ) from error
        if parsed_key.version != 4:
            raise ApiError(
                422, "INVALID_IDEMPOTENCY_KEY", "멱등성 키는 UUID-v4여야 합니다."
            )

        checkin = await self._checkins.get_owned(user_id, session_id, for_update=True)
        if checkin is None:
            raise ApiError(404, "CHECKIN_NOT_FOUND", "체크인을 찾을 수 없습니다.")

        existing = await self._checkins.get_submission(session_id)
        if existing is not None:
            if existing.idempotency_key == parsed_key:
                return existing
            raise ApiError(
                409,
                "CHECKIN_ALREADY_SUBMITTED",
                "이미 다른 요청으로 제출된 체크인입니다.",
            )

        if checkin.expires_at <= self._clock():
            checkin.status = "expired"
            checkin.updated_at = self._clock()
            await self._session.commit()
            raise ApiError(409, "CHECKIN_EXPIRED", "체크인 세션이 만료되었습니다.")
        if checkin.status != "ready":
            raise ApiError(
                409, "CHECKIN_NOT_READY", "GPS와 사진 증거가 모두 필요합니다."
            )

        decision, risk_codes = await self._classify(checkin)
        awarded_points = 0
        if decision == "approved":
            prior_visits = await self._checkins.count_approved_visits(
                user_id, checkin.place_id
            )
            awarded_points = FIRST_VISIT_POINTS if prior_visits == 0 else 0

        submission = SubmissionModel(
            id=uuid4(),
            session_id=session_id,
            idempotency_key=parsed_key,
            decision=decision,
            risk_codes=list(risk_codes),
            awarded_points=awarded_points,
            submitted_at=self._clock(),
        )
        self._checkins.add_submission(submission)
        checkin.status = "submitted"
        checkin.updated_at = self._clock()
        await self._session.commit()
        await self._session.refresh(submission)
        return submission

    async def _classify(
        self, checkin: CheckInSessionModel
    ) -> tuple[str, tuple[str, ...]]:
        """Analyse the collected real GPS/photo evidence for this check-in.

        Every geofence, accuracy, and duplicate-photo check runs against the
        place's actual coordinates, so this is the "real" verification path
        (as opposed to the client-only demo simulation).  Dwell time is not
        yet enforced: the client does not track continuous foreground
        presence, so requiring a minimum dwell would reject every real
        check-in today.
        """

        place = await self._places.get_public(checkin.place_id)
        if place is None:
            raise ApiError(404, "PLACE_NOT_FOUND", "장소를 찾을 수 없습니다.")

        gps_samples = await self._checkins.list_gps(checkin.id)
        photo = await self._checkins.get_photo(checkin.id)

        duplicate_media = False
        if photo is not None:
            duplicate = await self._checkins.find_duplicate_photo(
                photo.sha256, exclude_session_id=checkin.id
            )
            duplicate_media = duplicate is not None

        evidence = VerificationEvidence(
            samples=_build_samples(gps_samples, place),
            active_dwell_seconds=_dwell_seconds(gps_samples),
            image_decoded=True,
            captured_in_active_session=True,
            duplicate_media=duplicate_media,
            multi_account_suspected=False,
        )
        policy = VerificationPolicy(min_dwell_seconds=0.0)
        result = classify_verification(policy, evidence)
        if result.status.value == "rejected":
            return "rejected", result.rejection_codes
        if result.status.value == "review_required":
            return "review_required", result.risk_codes
        return "approved", result.risk_codes


def _build_samples(
    gps_samples: list[GpsSampleModel], place: PlaceModel
) -> tuple[VerificationSample, ...]:
    """Turn ordered raw GPS rows into distance-scored verification samples.

    Sample "kind" is not sent by the client (only sequence order is), so the
    first sample is treated as ``start``, the last as ``end``, and anything
    between as ``middle`` -- matching the three-fix collection flow the
    check-in UI already performs.
    """

    samples: list[VerificationSample] = []
    previous: GpsSampleModel | None = None
    for index, sample in enumerate(gps_samples):
        if index == 0:
            kind = "start"
        elif index == len(gps_samples) - 1:
            kind = "end"
        else:
            kind = "middle"
        distance = distance_meters(
            float(sample.latitude),
            float(sample.longitude),
            float(place.latitude),
            float(place.longitude),
        )
        speed_kmh = None
        if previous is not None:
            elapsed_hours = (
                sample.captured_at - previous.captured_at
            ).total_seconds() / 3600
            if elapsed_hours > 0:
                hop_m = distance_meters(
                    float(previous.latitude),
                    float(previous.longitude),
                    float(sample.latitude),
                    float(sample.longitude),
                )
                speed_kmh = (hop_m / 1000) / elapsed_hours
        samples.append(
            VerificationSample(
                sample_kind=kind,
                accuracy_m=float(sample.accuracy_meters),
                distance_m=distance,
                speed_from_previous_kmh=speed_kmh,
            )
        )
        previous = sample
    return tuple(samples)


def _dwell_seconds(gps_samples: list[GpsSampleModel]) -> float:
    """Approximate dwell as the span between the first and last GPS fix.

    This is a stand-in for true continuous foreground dwell tracking (see
    ``checkin.py``'s in-memory session model), which the persisted API does
    not yet collect.
    """

    if len(gps_samples) < 2:
        return 0.0
    span = gps_samples[-1].captured_at - gps_samples[0].captured_at
    return max(span.total_seconds(), 0.0)
