"""Transactional approval outbox and idempotent points ledger.

The in-memory store models the database constraints used by the MVP.  A single
lock is the transaction boundary: approval state, membership locking, and the
outbox row become visible together; ledger event keys are a unique index.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from threading import RLock
from typing import Callable
from uuid import uuid4


class PointsError(RuntimeError):
    """A stable domain error raised by the points workflow."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class PointApplicationStatus(StrEnum):
    NOT_STARTED = "not_started"
    APPROVED_PROCESSING = "approved_processing"
    RETRYING = "retrying"
    DLQ = "dlq"
    APPLIED = "applied"
    REVERSED = "reversed"


class OutboxStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    RETRYING = "retrying"
    APPLIED = "applied"
    DLQ = "dlq"


class LedgerEventType(StrEnum):
    FIRST_SCORE = "FIRST_SCORE"
    REPEAT_ZERO = "REPEAT_ZERO"
    REVERSAL = "REVERSAL"


class ReversalReason(StrEnum):
    """The two operational findings that may reverse an approval."""

    APPROVAL_CANCELLED = "APPROVAL_CANCELLED"
    FRAUD_CONFIRMED = "FRAUD_CONFIRMED"


@dataclass
class SeasonMembership:
    user_id: str
    season_id: str
    fandom_id: str
    locked_at: datetime | None = None


@dataclass
class ApprovedCheckIn:
    checkin_id: str
    user_id: str
    place_id: str
    season_id: str
    point_status: PointApplicationStatus = PointApplicationStatus.NOT_STARTED


@dataclass
class OutboxEvent:
    outbox_event_id: str
    event_key: str
    aggregate_id: str
    user_id: str
    fandom_id: str
    place_id: str
    season_id: str
    created_at: datetime
    status: OutboxStatus = OutboxStatus.PENDING
    attempt_count: int = 0
    next_attempt_at: datetime | None = None
    failed_stage: str | None = None
    reason_code: str | None = None
    first_failed_at: datetime | None = None
    updated_at: datetime | None = None
    lease_owner: str | None = None
    lease_until: datetime | None = None


@dataclass(frozen=True)
class LedgerEvent:
    ledger_event_id: str
    event_key: str
    checkin_id: str
    user_id: str
    fandom_id: str
    place_id: str
    season_id: str
    points: int
    event_type: LedgerEventType
    created_at: datetime
    reversal_of: str | None = None
    reversal_reason: ReversalReason | None = None


@dataclass
class PointsLedgerService:
    """Commit approvals atomically and consume their outbox at least once."""

    clock: Callable[[], datetime]
    memberships: dict[tuple[str, str], SeasonMembership] = field(default_factory=dict)
    checkins: dict[str, ApprovedCheckIn] = field(default_factory=dict)
    outbox_by_event_key: dict[str, OutboxEvent] = field(default_factory=dict)
    ledger_by_event_key: dict[str, LedgerEvent] = field(default_factory=dict)
    _lock: RLock = field(default_factory=RLock, init=False, repr=False)

    def select_fandom(self, user_id: str, season_id: str, fandom_id: str) -> SeasonMembership:
        """Create or update an unlocked season membership."""

        key = (user_id, season_id)
        with self._lock:
            membership = self.memberships.get(key)
            if membership is None:
                membership = SeasonMembership(user_id, season_id, fandom_id)
                self.memberships[key] = membership
            elif membership.locked_at is not None and membership.fandom_id != fandom_id:
                raise PointsError("FANDOM_LOCKED", "최초 승인 후에는 팬덤을 변경할 수 없습니다.")
            else:
                membership.fandom_id = fandom_id
            return membership

    def commit_first_approval(
        self,
        checkin: ApprovedCheckIn,
        *,
        before_commit: Callable[[], None] | None = None,
    ) -> OutboxEvent:
        """Atomically transition approval, lock fandom, and insert one outbox row.

        ``before_commit`` is a transaction-failure seam.  If it raises, none of
        the three changes has been published.
        """

        event_key = self.approval_event_key(checkin.checkin_id)
        with self._lock:
            existing = self.outbox_by_event_key.get(event_key)
            if existing is not None:
                return existing
            if checkin.point_status is not PointApplicationStatus.NOT_STARTED:
                raise PointsError("INVALID_POINT_STATE", "승인 처리를 시작할 수 없는 상태입니다.")
            membership = self.memberships.get((checkin.user_id, checkin.season_id))
            if membership is None:
                raise PointsError("FANDOM_REQUIRED", "시즌 팬덤을 먼저 선택해야 합니다.")
            now = self._now()
            outbox = OutboxEvent(
                outbox_event_id=str(uuid4()),
                event_key=event_key,
                aggregate_id=checkin.checkin_id,
                user_id=checkin.user_id,
                fandom_id=membership.fandom_id,
                place_id=checkin.place_id,
                season_id=checkin.season_id,
                created_at=now,
                updated_at=now,
            )
            if before_commit is not None:
                before_commit()

            # These assignments are the in-memory equivalent of one DB commit.
            checkin.point_status = PointApplicationStatus.APPROVED_PROCESSING
            membership.locked_at = membership.locked_at or now
            self.checkins.setdefault(checkin.checkin_id, checkin)
            self.outbox_by_event_key[event_key] = outbox
            return outbox

    def consume_approval(self, event_key: str) -> LedgerEvent:
        """Apply an approval once, returning its original effect on redelivery."""

        with self._lock:
            existing = self.ledger_by_event_key.get(event_key)
            if existing is not None:
                return existing
            outbox = self.outbox_by_event_key.get(event_key)
            if outbox is None:
                raise PointsError("OUTBOX_NOT_FOUND", "승인 outbox 이벤트를 찾을 수 없습니다.")
            visit_key = (outbox.user_id, outbox.place_id, outbox.season_id)
            is_first = not any(
                (event.user_id, event.place_id, event.season_id) == visit_key
                and event.event_type is LedgerEventType.FIRST_SCORE
                for event in self.ledger_by_event_key.values()
            )
            ledger = LedgerEvent(
                ledger_event_id=str(uuid4()),
                event_key=outbox.event_key,
                checkin_id=outbox.aggregate_id,
                user_id=outbox.user_id,
                fandom_id=outbox.fandom_id,
                place_id=outbox.place_id,
                season_id=outbox.season_id,
                points=100 if is_first else 0,
                event_type=(LedgerEventType.FIRST_SCORE if is_first else LedgerEventType.REPEAT_ZERO),
                created_at=self._now(),
            )
            self.ledger_by_event_key[event_key] = ledger
            outbox.status = OutboxStatus.APPLIED
            outbox.updated_at = self._now()
            outbox.lease_owner = None
            outbox.lease_until = None
            self.checkins[outbox.aggregate_id].point_status = PointApplicationStatus.APPLIED
            return ledger

    def points_for(self, user_id: str, season_id: str) -> int:
        with self._lock:
            return self.replay_scores().get((user_id, season_id), 0)

    def reverse_approval(
        self,
        original_event_key: str,
        reason: ReversalReason,
    ) -> LedgerEvent:
        """Append one immutable event that negates an approval ledger event.

        The deterministic reversal key makes retries safe.  The original row is
        never edited or deleted, and the foreign-key-like ``reversal_of`` field
        records exactly which ledger effect was negated.
        """

        with self._lock:
            original = self.ledger_by_event_key.get(original_event_key)
            if original is None:
                raise PointsError("LEDGER_EVENT_NOT_FOUND", "원 승인 원장 이벤트를 찾을 수 없습니다.")
            if original.event_type is LedgerEventType.REVERSAL:
                raise PointsError("REVERSAL_TARGET_INVALID", "역분개 이벤트는 다시 역분개할 수 없습니다.")

            event_key = self.reversal_event_key(original.event_key)
            existing = self.ledger_by_event_key.get(event_key)
            if existing is not None:
                if existing.reversal_reason is not reason:
                    raise PointsError("REVERSAL_ALREADY_RECORDED", "이미 다른 사유로 역분개되었습니다.")
                return existing

            reversal = LedgerEvent(
                ledger_event_id=str(uuid4()),
                event_key=event_key,
                checkin_id=original.checkin_id,
                user_id=original.user_id,
                fandom_id=original.fandom_id,
                place_id=original.place_id,
                season_id=original.season_id,
                points=-original.points,
                event_type=LedgerEventType.REVERSAL,
                created_at=self._now(),
                reversal_of=original.ledger_event_id,
                reversal_reason=reason,
            )
            self.ledger_by_event_key[event_key] = reversal
            checkin = self.checkins.get(original.checkin_id)
            if checkin is not None:
                checkin.point_status = PointApplicationStatus.REVERSED
            return reversal

    def replay_scores(self) -> dict[tuple[str, str], int]:
        """Rebuild current user-season scores from the immutable ledger."""

        with self._lock:
            scores: dict[tuple[str, str], int] = {}
            events = sorted(
                self.ledger_by_event_key.values(),
                key=lambda event: (event.created_at, event.ledger_event_id),
            )
            for event in events:
                key = (event.user_id, event.season_id)
                scores[key] = scores.get(key, 0) + event.points
            return scores

    @staticmethod
    def approval_event_key(checkin_id: str) -> str:
        return f"checkin:{checkin_id}:approved:v1"

    @staticmethod
    def reversal_event_key(original_event_key: str) -> str:
        return f"{original_event_key}:reversal:v1"

    def _now(self) -> datetime:
        now = self.clock()
        if now.tzinfo is None or now.utcoffset() is None:
            raise ValueError("server clock must return a timezone-aware datetime")
        return now
