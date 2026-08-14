"""Season review grace, dual approval, and immutable result snapshots."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import StrEnum
from threading import RLock
from typing import Callable, Iterable
from uuid import uuid4

from .territory import TerritoryProjectionService, TerritorySnapshot


class SeasonError(RuntimeError):
    """A stable domain error for invalid season lifecycle operations."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code


class SeasonStatus(StrEnum):
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    REVIEW_GRACE = "review_grace"
    AWAITING_DUAL_APPROVAL = "awaiting_dual_approval"
    FINALIZED = "finalized"


class DualApprovalStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"


@dataclass
class Season:
    season_id: str
    starts_at: datetime
    ends_at: datetime
    review_grace_ends_at: datetime | None = None
    status: SeasonStatus = SeasonStatus.ACTIVE
    finalized_at: datetime | None = None

    def __post_init__(self) -> None:
        _require_aware(self.starts_at)
        _require_aware(self.ends_at)
        if self.starts_at >= self.ends_at:
            raise ValueError("season starts_at must be earlier than ends_at")
        expected_grace_end = self.ends_at + timedelta(hours=72)
        if self.review_grace_ends_at is None:
            self.review_grace_ends_at = expected_grace_end
        elif self.review_grace_ends_at != expected_grace_end:
            raise ValueError("review grace must end exactly 72 hours after season end")


@dataclass(frozen=True)
class SubmittedCheckIn:
    checkin_id: str
    season_id: str
    submitted_at: datetime
    review_grace_eligible: bool


@dataclass
class DualApproval:
    dual_approval_id: str
    action_type: str
    subject_id: str
    requester_id: str
    requested_at: datetime
    status: DualApprovalStatus = DualApprovalStatus.PENDING
    approver_id: str | None = None
    approved_at: datetime | None = None


@dataclass(frozen=True)
class SeasonResult:
    season_result_id: str
    season_id: str
    fandom_id: str
    rank: int
    stronghold_count: int
    valid_points: int
    finalized_at: datetime


@dataclass(frozen=True)
class SeasonAuditEntry:
    actor_id: str
    action: str
    subject_id: str
    occurred_at: datetime


@dataclass
class SeasonFinalizationService:
    """Manage finalization without mutating historical ledger projections."""

    clock: Callable[[], datetime]
    seasons: dict[str, Season] = field(default_factory=dict)
    submissions: dict[str, SubmittedCheckIn] = field(default_factory=dict)
    approvals: dict[str, DualApproval] = field(default_factory=dict)
    results: dict[str, tuple[SeasonResult, ...]] = field(default_factory=dict)
    audits: list[SeasonAuditEntry] = field(default_factory=list)
    _lock: RLock = field(default_factory=RLock, init=False, repr=False)

    def add_season(self, season: Season) -> Season:
        with self._lock:
            if season.season_id in self.seasons:
                raise SeasonError("SEASON_ALREADY_EXISTS", "이미 등록된 시즌입니다.")
            self.seasons[season.season_id] = season
            return season

    def record_submission(
        self, checkin_id: str, season_id: str, submitted_at: datetime
    ) -> SubmittedCheckIn:
        """Record grace eligibility using the immutable submission timestamp."""

        _require_aware(submitted_at)
        with self._lock:
            season = self._season(season_id)
            existing = self.submissions.get(checkin_id)
            if existing is not None:
                if (existing.season_id, existing.submitted_at) != (season_id, submitted_at):
                    raise SeasonError("CHECKIN_SUBMISSION_CONFLICT", "제출 기록이 일치하지 않습니다.")
                return existing
            submission = SubmittedCheckIn(
                checkin_id=checkin_id,
                season_id=season_id,
                submitted_at=submitted_at,
                review_grace_eligible=submitted_at < season.ends_at,
            )
            self.submissions[checkin_id] = submission
            return submission

    def grace_checkin_ids(self, season_id: str) -> tuple[str, ...]:
        self._season(season_id)
        return tuple(
            sorted(
                item.checkin_id
                for item in self.submissions.values()
                if item.season_id == season_id and item.review_grace_eligible
            )
        )

    def advance_season(self, season_id: str) -> Season:
        """Enter the grace period at the season end according to server time."""

        with self._lock:
            season = self._season(season_id)
            if season.status in (SeasonStatus.SCHEDULED, SeasonStatus.ACTIVE):
                if self._now() >= season.ends_at:
                    season.status = SeasonStatus.REVIEW_GRACE
            return season

    def request_finalization(self, season_id: str, *, requester_id: str) -> DualApproval:
        with self._lock:
            season = self.advance_season(season_id)
            now = self._now()
            if season.status is SeasonStatus.FINALIZED:
                raise SeasonError("SEASON_ALREADY_FINALIZED", "이미 확정된 시즌입니다.")
            if now < season.review_grace_ends_at:
                raise SeasonError("REVIEW_GRACE_ACTIVE", "72시간 검수 유예가 끝나지 않았습니다.")

            existing = next(
                (
                    approval
                    for approval in self.approvals.values()
                    if approval.subject_id == season_id
                    and approval.action_type == "SEASON_FINALIZATION"
                ),
                None,
            )
            if existing is not None:
                return existing

            approval = DualApproval(
                dual_approval_id=str(uuid4()),
                action_type="SEASON_FINALIZATION",
                subject_id=season_id,
                requester_id=requester_id,
                requested_at=now,
            )
            self.approvals[approval.dual_approval_id] = approval
            season.status = SeasonStatus.AWAITING_DUAL_APPROVAL
            self.audits.append(
                SeasonAuditEntry(requester_id, "SEASON_FINALIZATION_REQUESTED", season_id, now)
            )
            return approval

    def approve_finalization(
        self, dual_approval_id: str, *, approver_id: str
    ) -> DualApproval:
        with self._lock:
            approval = self._approval(dual_approval_id)
            if approval.requester_id == approver_id:
                raise SeasonError(
                    "DISTINCT_APPROVER_REQUIRED", "요청자와 다른 운영자가 승인해야 합니다."
                )
            if approval.status is DualApprovalStatus.APPROVED:
                return approval
            now = self._now()
            approval.approver_id = approver_id
            approval.approved_at = now
            approval.status = DualApprovalStatus.APPROVED
            self.audits.append(
                SeasonAuditEntry(
                    approver_id, "SEASON_FINALIZATION_APPROVED", approval.subject_id, now
                )
            )
            return approval

    def finalize_season(
        self,
        season_id: str,
        dual_approval_id: str,
        projection: TerritorySnapshot,
    ) -> Season:
        """Atomically snapshot ranked results after a valid two-person approval."""

        with self._lock:
            season = self._season(season_id)
            if season.status is SeasonStatus.FINALIZED:
                raise SeasonError("SEASON_ALREADY_FINALIZED", "이미 확정된 시즌입니다.")
            if self._now() < season.review_grace_ends_at:
                raise SeasonError("REVIEW_GRACE_ACTIVE", "72시간 검수 유예가 끝나지 않았습니다.")
            approval = self._approval(dual_approval_id)
            if (
                approval.action_type != "SEASON_FINALIZATION"
                or approval.subject_id != season_id
                or approval.status is not DualApprovalStatus.APPROVED
            ):
                raise SeasonError("DUAL_APPROVAL_REQUIRED", "유효한 2인 승인이 필요합니다.")
            if projection.season_id != season_id:
                raise SeasonError("PROJECTION_SEASON_MISMATCH", "시즌 투영이 일치하지 않습니다.")

            now = self._now()
            snapshot = tuple(
                SeasonResult(
                    season_result_id=str(uuid4()),
                    season_id=season_id,
                    fandom_id=row.fandom_id,
                    rank=row.rank,
                    stronghold_count=row.stronghold_count,
                    valid_points=row.valid_points,
                    finalized_at=now,
                )
                for row in projection.leaderboard
            )
            self.results[season_id] = snapshot
            season.finalized_at = now
            season.status = SeasonStatus.FINALIZED
            self.audits.append(
                SeasonAuditEntry(
                    approval.approver_id or "", "SEASON_FINALIZED", season_id, now
                )
            )
            return season

    def results_for(self, season_id: str) -> tuple[SeasonResult, ...]:
        """Return preserved results for a finalized historical season."""

        return self.results.get(season_id, ())

    def open_next_season(
        self, season: Season, *, fandom_ids: Iterable[str] = ()
    ) -> TerritoryProjectionService:
        """Register a season with a brand-new zero-point, unowned projection."""

        with self._lock:
            self.add_season(season)
            return TerritoryProjectionService(season.season_id, fandom_ids=fandom_ids)

    def _season(self, season_id: str) -> Season:
        try:
            return self.seasons[season_id]
        except KeyError as exc:
            raise SeasonError("SEASON_NOT_FOUND", "시즌을 찾을 수 없습니다.") from exc

    def _approval(self, approval_id: str) -> DualApproval:
        try:
            return self.approvals[approval_id]
        except KeyError as exc:
            raise SeasonError("DUAL_APPROVAL_NOT_FOUND", "2인 승인 요청을 찾을 수 없습니다.") from exc

    def _now(self) -> datetime:
        now = self.clock()
        _require_aware(now)
        return now


def _require_aware(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("timestamps must be timezone-aware")
