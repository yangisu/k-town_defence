"""Check-in session state and recovery rules.

The model deliberately uses caller-supplied UTC times.  This keeps the server
clock authoritative while making browser interruptions and expiry boundaries
deterministic to test.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import StrEnum
from typing import Final
from uuid import uuid4


SESSION_LIFETIME: Final = timedelta(minutes=30)
MIN_DWELL_SECONDS: Final = 5 * 60
SUBMISSION_ACCURACY_M: Final = 100.0
AUTO_APPROVAL_ACCURACY_M: Final = 50.0
REQUIRED_SAMPLE_KINDS: Final = frozenset({"start", "middle", "end"})


class SessionStatus(StrEnum):
    COLLECTING = "collecting"
    PAUSED = "paused"
    READY_TO_SUBMIT = "ready_to_submit"
    SUBMITTED = "submitted"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class CheckInError(RuntimeError):
    """A stable API-facing check-in failure."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class GpsSample:
    sample_sequence: int
    sample_kind: str
    latitude: float
    longitude: float
    accuracy_m: float
    captured_at: datetime

    @property
    def submission_valid(self) -> bool:
        return self.accuracy_m <= SUBMISSION_ACCURACY_M

    @property
    def auto_approval_valid(self) -> bool:
        return self.accuracy_m <= AUTO_APPROVAL_ACCURACY_M


@dataclass(frozen=True)
class PhotoAsset:
    photo_asset_id: str
    upload_idempotency_key: str
    captured_at: datetime
    captured_with_session_camera: bool = True


@dataclass(frozen=True)
class Submission:
    checkin_id: str
    checkin_session_id: str
    idempotency_key: str


@dataclass
class CheckInSession:
    checkin_session_id: str
    user_id: str
    place_id: str
    season_id: str
    started_at: datetime
    status: SessionStatus = SessionStatus.COLLECTING
    active_dwell_seconds: float = 0.0
    samples: list[GpsSample] = field(default_factory=list)
    photo: PhotoAsset | None = None
    expires_at: datetime = field(init=False)
    _active_since: datetime | None = field(init=False, repr=False)
    _submission: Submission | None = field(default=None, init=False, repr=False)
    _photo_uploads: dict[str, PhotoAsset] = field(default_factory=dict, init=False, repr=False)

    def __post_init__(self) -> None:
        _require_aware(self.started_at)
        self.expires_at = self.started_at + SESSION_LIFETIME
        self._active_since = self.started_at if self.status == SessionStatus.COLLECTING else None

    @property
    def gps_submission_complete(self) -> bool:
        kinds = {sample.sample_kind for sample in self.samples if sample.submission_valid}
        return REQUIRED_SAMPLE_KINDS <= kinds

    @property
    def gps_auto_approval_eligible(self) -> bool:
        """Whether every required kind has a <=50m sample.

        Other verification risks (geofence, duplicate media, routes, and place
        policy) belong to the separate verification decision model.
        """

        kinds = {sample.sample_kind for sample in self.samples if sample.auto_approval_valid}
        return REQUIRED_SAMPLE_KINDS <= kinds

    def advance(self, now: datetime) -> SessionStatus:
        """Apply elapsed foreground dwell and the hard expiry boundary."""

        self._check_time(now)
        self._accrue_until(min(now, self.expires_at))
        if now >= self.expires_at and self.status in {
            SessionStatus.COLLECTING,
            SessionStatus.PAUSED,
            SessionStatus.READY_TO_SUBMIT,
        }:
            self.status = SessionStatus.EXPIRED
            self._active_since = None
            return self.status
        self._mark_ready_if_complete()
        return self.status

    def pause(self, now: datetime) -> SessionStatus:
        """Immediately stop GPS/dwell for hidden, offline, or denied clients."""

        self.advance(now)
        if self.status == SessionStatus.COLLECTING:
            self.status = SessionStatus.PAUSED
            self._active_since = None
        return self.status

    def resume(
        self,
        now: datetime,
        *,
        tab_active: bool,
        network_connected: bool,
        gps_permission: bool,
        location_reconfirmed: bool,
    ) -> SessionStatus:
        """Resume only after every foreground precondition is rechecked."""

        self.advance(now)
        if self.status == SessionStatus.EXPIRED:
            raise CheckInError("CHECKIN_SESSION_CLOSED", "만료된 체크인 세션입니다.")
        if self.status != SessionStatus.PAUSED:
            raise CheckInError("INVALID_SESSION_TRANSITION", "일시 중지 세션만 재개할 수 있습니다.")
        if not gps_permission:
            raise CheckInError("GPS_PERMISSION_DENIED", "위치 권한이 필요합니다.")
        if not (tab_active and network_connected and location_reconfirmed):
            return self.status
        self.status = SessionStatus.COLLECTING
        self._active_since = now
        return self.status

    def recover_after_reload(self, now: datetime) -> SessionStatus:
        """Restore an unfinished server session as paused after a reload."""

        self.advance(now)
        if self.status in {SessionStatus.COLLECTING, SessionStatus.READY_TO_SUBMIT}:
            self.status = SessionStatus.PAUSED
            self._active_since = None
        return self.status

    def add_gps_sample(self, sample: GpsSample, *, now: datetime) -> GpsSample:
        self.advance(now)
        self._require_collecting()
        if sample.sample_kind not in REQUIRED_SAMPLE_KINDS | {"recovery"}:
            raise CheckInError("VALIDATION_FAILED", "지원하지 않는 GPS 샘플 종류입니다.")
        expected = len(self.samples) + 1
        if sample.sample_sequence != expected:
            raise CheckInError("GPS_SEQUENCE_INVALID", f"sample_sequence는 {expected}이어야 합니다.")
        if sample.captured_at < self.started_at or sample.captured_at > now + timedelta(seconds=30):
            raise CheckInError("GPS_CAPTURE_TIME_INVALID", "GPS 측정 시각이 세션 범위를 벗어났습니다.")
        self.samples.append(sample)
        self._mark_ready_if_complete()
        return sample

    def capture_photo(
        self,
        *,
        upload_idempotency_key: str,
        captured_at: datetime,
        now: datetime,
        captured_with_session_camera: bool,
    ) -> PhotoAsset:
        self.advance(now)
        existing = self._photo_uploads.get(upload_idempotency_key)
        if existing is not None:
            return existing
        self._require_collecting()
        if not captured_with_session_camera:
            raise CheckInError("CAMERA_CAPTURE_REQUIRED", "활성 세션의 웹 카메라로 촬영해야 합니다.")
        if self.photo is not None:
            raise CheckInError("PHOTO_ALREADY_CAPTURED", "사진은 한 장만 제출할 수 있습니다.")
        if captured_at < self.started_at or captured_at > now:
            raise CheckInError("PHOTO_CAPTURE_TIME_INVALID", "사진 촬영 시각이 세션 범위를 벗어났습니다.")
        asset = PhotoAsset(str(uuid4()), upload_idempotency_key, captured_at)
        self.photo = asset
        self._photo_uploads[upload_idempotency_key] = asset
        self._mark_ready_if_complete()
        return asset

    def submit(self, *, idempotency_key: str, now: datetime) -> Submission:
        """Submit once; replay of the successful key returns the same result."""

        if self._submission is not None:
            if self._submission.idempotency_key == idempotency_key:
                return self._submission
            raise CheckInError("VALIDATION_FAILED", "다른 멱등 키로 다시 제출할 수 없습니다.")
        self.advance(now)
        if self.status in {SessionStatus.EXPIRED, SessionStatus.CANCELLED}:
            raise CheckInError("CHECKIN_SESSION_CLOSED", "종료된 체크인 세션입니다.")
        if self.status != SessionStatus.READY_TO_SUBMIT:
            raise CheckInError("CHECKIN_NOT_READY", "체크인 제출 조건이 충족되지 않았습니다.")
        submission = Submission(str(uuid4()), self.checkin_session_id, idempotency_key)
        self._submission = submission
        self.status = SessionStatus.SUBMITTED
        return submission

    def cancel(self, now: datetime) -> SessionStatus:
        self.advance(now)
        if self.status in {SessionStatus.COLLECTING, SessionStatus.PAUSED, SessionStatus.READY_TO_SUBMIT}:
            self.status = SessionStatus.CANCELLED
            self._active_since = None
            return self.status
        raise CheckInError("INVALID_SESSION_TRANSITION", "현재 세션은 취소할 수 없습니다.")

    def _mark_ready_if_complete(self) -> None:
        if (
            self.status == SessionStatus.COLLECTING
            and self.active_dwell_seconds >= MIN_DWELL_SECONDS
            and self.gps_submission_complete
            and self.photo is not None
        ):
            self.status = SessionStatus.READY_TO_SUBMIT
            self._active_since = None

    def _accrue_until(self, moment: datetime) -> None:
        if self.status == SessionStatus.COLLECTING and self._active_since is not None:
            if moment > self._active_since:
                self.active_dwell_seconds += (moment - self._active_since).total_seconds()
                self._active_since = moment

    def _require_collecting(self) -> None:
        if self.status in {SessionStatus.EXPIRED, SessionStatus.CANCELLED}:
            raise CheckInError("CHECKIN_SESSION_CLOSED", "종료된 체크인 세션입니다.")
        if self.status != SessionStatus.COLLECTING:
            raise CheckInError("CHECKIN_SESSION_PAUSED", "활성 포그라운드 세션에서만 수집할 수 있습니다.")

    def _check_time(self, now: datetime) -> None:
        _require_aware(now)
        if now < self.started_at:
            raise ValueError("now cannot precede started_at")


def _require_aware(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("server times must be timezone-aware")
