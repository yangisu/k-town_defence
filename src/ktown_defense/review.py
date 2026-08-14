"""Server-time retry limits and the verification appeal workflow."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone, tzinfo
from enum import StrEnum
from typing import Callable, Final
from uuid import uuid4
from zoneinfo import ZoneInfo

from .auth import OperatorRole, Principal


DAILY_RETRY_LIMIT: Final = 3
APPEAL_WINDOW: Final = timedelta(hours=48)
APPEAL_REVIEW_TARGET: Final = timedelta(hours=72)


class ReviewError(RuntimeError):
    """A stable, API-facing workflow failure."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class CheckInDecisionStatus(StrEnum):
    REVIEW_REQUIRED = "review_required"
    APPROVED = "approved"
    REJECTED = "rejected"


class AppealStatus(StrEnum):
    SUBMITTED = "submitted"
    UPHELD = "upheld"
    OVERTURNED = "overturned"


@dataclass(frozen=True)
class RetryAttempt:
    user_id: str
    place_id: str
    local_date: date
    attempt_number: int
    recorded_at: datetime


@dataclass
class ReviewedCheckIn:
    checkin_id: str
    user_id: str
    status: CheckInDecisionStatus = CheckInDecisionStatus.REVIEW_REQUIRED
    reason_ko: str | None = None
    reviewer_id: str | None = None
    decided_at: datetime | None = None
    appeal: "Appeal | None" = None


@dataclass
class Appeal:
    appeal_id: str
    checkin_id: str
    reason_ko: str
    submitted_at: datetime
    due_at: datetime
    status: AppealStatus = AppealStatus.SUBMITTED
    reviewer_id: str | None = None
    decided_at: datetime | None = None


@dataclass(frozen=True)
class AuditEntry:
    actor_id: str
    action: str
    subject_type: str
    subject_id: str
    occurred_at: datetime
    allowed: bool
    result_code: str


@dataclass
class RetryLimiter:
    """Count retry starts by user, place, and the place's local date."""

    clock: Callable[[], datetime]
    default_timezone: str = "Asia/Seoul"
    _attempts: dict[tuple[str, str, date], list[RetryAttempt]] = field(
        default_factory=lambda: defaultdict(list), init=False, repr=False
    )

    def record_retry(
        self, user_id: str, place_id: str, *, timezone_name: str | None = None
    ) -> RetryAttempt:
        now = _server_now(self.clock)
        try:
            local_date = now.astimezone(self._timezone(timezone_name)).date()
        except (KeyError, ValueError) as exc:
            raise ReviewError("INVALID_TIMEZONE", "장소 시간대를 확인할 수 없습니다.") from exc
        key = (user_id, place_id, local_date)
        attempts = self._attempts[key]
        if len(attempts) >= DAILY_RETRY_LIMIT:
            raise ReviewError(
                "DAILY_RETRY_LIMIT_EXCEEDED",
                "이 장소에서는 오늘 세 번까지만 다시 시도할 수 있습니다.",
            )
        attempt = RetryAttempt(user_id, place_id, local_date, len(attempts) + 1, now)
        attempts.append(attempt)
        return attempt

    def retries_used(
        self, user_id: str, place_id: str, *, timezone_name: str | None = None
    ) -> int:
        now = _server_now(self.clock)
        local_date = now.astimezone(self._timezone(timezone_name)).date()
        return len(self._attempts[(user_id, place_id, local_date)])

    def _timezone(self, timezone_name: str | None) -> tzinfo:
        name = timezone_name or self.default_timezone
        # South Korea has used UTC+09:00 without daylight saving since 1988.
        # A fixed offset also keeps the service usable on minimal Python builds
        # where the optional IANA tzdata package is not installed.
        if name == "Asia/Seoul":
            return timezone(timedelta(hours=9), "Asia/Seoul")
        return ZoneInfo(name)


@dataclass
class ReviewAppealService:
    """Enforce final-decision and single-appeal transitions."""

    clock: Callable[[], datetime]
    audit_log: list[AuditEntry] = field(default_factory=list)

    def decide_checkin(
        self,
        checkin: ReviewedCheckIn,
        *,
        operator: Principal,
        decision: CheckInDecisionStatus | str,
        reason_ko: str,
    ) -> ReviewedCheckIn:
        now = _server_now(self.clock)
        self._require_reviewer(operator, "decide_checkin", checkin.checkin_id, now)
        requested = CheckInDecisionStatus(decision)
        if requested not in {
            CheckInDecisionStatus.APPROVED,
            CheckInDecisionStatus.REJECTED,
        } or checkin.status is not CheckInDecisionStatus.REVIEW_REQUIRED:
            self._audit(operator.subject_id, "decide_checkin", checkin.checkin_id, now, False, "INVALID_REVIEW_TRANSITION")
            raise ReviewError("INVALID_REVIEW_TRANSITION", "현재 상태에서는 최종 판정을 할 수 없습니다.")
        checkin.status = requested
        checkin.reason_ko = reason_ko
        checkin.reviewer_id = operator.subject_id
        checkin.decided_at = now
        self._audit(operator.subject_id, "decide_checkin", checkin.checkin_id, now, True, requested.value)
        return checkin

    def submit_appeal(
        self, checkin: ReviewedCheckIn, *, member: Principal, reason_ko: str
    ) -> Appeal:
        now = _server_now(self.clock)
        if (
            member.kind != "member"
            or member.status != "active"
            or not member.adult_verified
            or member.subject_id != checkin.user_id
        ):
            raise ReviewError("FORBIDDEN", "이 체크인의 이의제기 권한이 없습니다.")
        if checkin.status is not CheckInDecisionStatus.REJECTED or checkin.decided_at is None:
            raise ReviewError("APPEAL_NOT_AVAILABLE", "최종 거절된 체크인만 이의제기할 수 있습니다.")
        if checkin.appeal is not None:
            raise ReviewError("APPEAL_ALREADY_SUBMITTED", "체크인당 한 번만 이의제기할 수 있습니다.")
        if now > checkin.decided_at + APPEAL_WINDOW:
            raise ReviewError("APPEAL_WINDOW_EXPIRED", "거절 후 48시간이 지나 이의제기할 수 없습니다.")
        appeal = Appeal(
            str(uuid4()), checkin.checkin_id, reason_ko, now, now + APPEAL_REVIEW_TARGET
        )
        checkin.appeal = appeal
        return appeal

    def decide_appeal(
        self,
        checkin: ReviewedCheckIn,
        *,
        operator: Principal,
        decision: AppealStatus | str,
    ) -> Appeal:
        now = _server_now(self.clock)
        self._require_reviewer(operator, "decide_appeal", checkin.checkin_id, now)
        appeal = checkin.appeal
        requested = AppealStatus(decision)
        if appeal is None or appeal.status is not AppealStatus.SUBMITTED or requested not in {
            AppealStatus.UPHELD,
            AppealStatus.OVERTURNED,
        }:
            self._audit(operator.subject_id, "decide_appeal", checkin.checkin_id, now, False, "INVALID_APPEAL_TRANSITION")
            raise ReviewError("INVALID_APPEAL_TRANSITION", "현재 상태에서는 이의제기를 판정할 수 없습니다.")
        appeal.status = requested
        appeal.reviewer_id = operator.subject_id
        appeal.decided_at = now
        self._audit(operator.subject_id, "decide_appeal", checkin.checkin_id, now, True, requested.value)
        return appeal

    def _require_reviewer(
        self, operator: Principal, action: str, subject_id: str, now: datetime
    ) -> None:
        allowed = (
            operator.kind == "operator"
            and operator.status == "active"
            and bool(
                {OperatorRole.REVIEWER, OperatorRole.SUPER_ADMIN}.intersection(
                    operator.roles
                )
            )
        )
        if not allowed:
            self._audit(operator.subject_id, action, subject_id, now, False, "FORBIDDEN")
            raise ReviewError("FORBIDDEN", "reviewer 역할이 필요합니다.")

    def _audit(
        self,
        actor_id: str,
        action: str,
        subject_id: str,
        now: datetime,
        allowed: bool,
        result_code: str,
    ) -> None:
        self.audit_log.append(
            AuditEntry(actor_id, action, "checkin", subject_id, now, allowed, result_code)
        )


def _server_now(clock: Callable[[], datetime]) -> datetime:
    now = clock()
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("server clock must return a timezone-aware datetime")
    return now
