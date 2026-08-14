"""Stale points-work recovery, DLQ routing, and ledger projection repair."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import StrEnum
from threading import RLock
from typing import Callable
from uuid import uuid4

from .points import OutboxEvent, OutboxStatus, PointApplicationStatus, PointsError, PointsLedgerService
from .territory import TerritoryProjectionService


class DlqStatus(StrEnum):
    OPEN = "open"
    RETRYING = "retrying"
    RESOLVED = "resolved"


class ReconcileStatus(StrEnum):
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class DlqItem:
    dlq_item_id: str
    outbox_event_id: str
    event_key: str
    status: DlqStatus
    failed_stage: str
    reason_code: str
    attempt_count: int
    created_at: datetime
    last_retried_at: datetime | None = None
    resolved_at: datetime | None = None


@dataclass
class ReconcileRun:
    reconcile_run_id: str
    started_at: datetime
    lease_owner: str
    status: ReconcileStatus = ReconcileStatus.RUNNING
    completed_at: datetime | None = None
    stale_found: int = 0
    requeued_count: int = 0
    deduplicated_count: int = 0
    dlq_count: int = 0
    projection_rebuild_count: int = 0


@dataclass
class ReconcileService:
    """Recover stale work without creating a second ledger effect."""

    points: PointsLedgerService
    projections: dict[str, TerritoryProjectionService]
    clock: Callable[[], datetime]
    retry_offsets_seconds: tuple[int, ...] = (1, 5, 30, 120, 300)
    stale_after_seconds: int = 120
    lease_seconds: int = 60
    dlq_by_event_key: dict[str, DlqItem] = field(default_factory=dict)
    runs: list[ReconcileRun] = field(default_factory=list)
    _lock: RLock = field(default_factory=RLock, init=False, repr=False)

    def begin_attempt(self, event_key: str, *, failed_stage: str, worker_id: str = "worker") -> None:
        """Mark the current stage so an abrupt process exit can be recovered."""

        now = self._now()
        with self.points._lock:
            outbox = self._outbox(event_key)
            if outbox.status in (OutboxStatus.APPLIED, OutboxStatus.DLQ):
                raise PointsError("OUTBOX_TERMINAL", "완료되거나 DLQ로 이동한 작업은 시작할 수 없습니다.")
            outbox.status = OutboxStatus.PROCESSING
            outbox.failed_stage = failed_stage
            outbox.updated_at = now
            outbox.lease_owner = worker_id
            outbox.lease_until = now + timedelta(seconds=self.lease_seconds)

    def record_failure(self, event_key: str, *, reason_code: str) -> None:
        """Persist a failed attempt and its first-failure-anchored retry time."""

        now = self._now()
        with self.points._lock:
            outbox = self._outbox(event_key)
            if outbox.status is not OutboxStatus.PROCESSING:
                raise PointsError("OUTBOX_NOT_PROCESSING", "처리 중인 작업만 실패로 기록할 수 있습니다.")
            outbox.attempt_count += 1
            outbox.first_failed_at = outbox.first_failed_at or now
            offset_index = min(outbox.attempt_count, len(self.retry_offsets_seconds)) - 1
            outbox.next_attempt_at = outbox.first_failed_at + timedelta(
                seconds=self.retry_offsets_seconds[offset_index]
            )
            outbox.reason_code = reason_code
            outbox.status = OutboxStatus.RETRYING
            outbox.updated_at = now
            outbox.lease_owner = None
            outbox.lease_until = None
            self.points.checkins[outbox.aggregate_id].point_status = PointApplicationStatus.RETRYING

    def run_once(self, lease_owner: str) -> ReconcileRun:
        """Run one scheduled recovery pass and atomically repair projections."""

        now = self._now()
        run = ReconcileRun(str(uuid4()), now, lease_owner)
        with self._lock:
            with self.points._lock:
                for event_key, outbox in self.points.outbox_by_event_key.items():
                    if outbox.status not in (
                        OutboxStatus.PENDING,
                        OutboxStatus.PROCESSING,
                        OutboxStatus.RETRYING,
                    ):
                        continue
                    observed_at = outbox.updated_at or outbox.created_at
                    if observed_at + timedelta(seconds=self.stale_after_seconds) > now:
                        continue
                    if (
                        outbox.lease_until is not None
                        and outbox.lease_until > now
                        and outbox.lease_owner != lease_owner
                    ):
                        continue

                    outbox.lease_owner = lease_owner
                    outbox.lease_until = now + timedelta(seconds=self.lease_seconds)
                    run.stale_found += 1

                    if event_key in self.points.ledger_by_event_key:
                        outbox.status = OutboxStatus.APPLIED
                        self.points.checkins[outbox.aggregate_id].point_status = PointApplicationStatus.APPLIED
                        run.deduplicated_count += 1
                    elif outbox.attempt_count >= len(self.retry_offsets_seconds):
                        if event_key not in self.dlq_by_event_key:
                            self.dlq_by_event_key[event_key] = DlqItem(
                                dlq_item_id=str(uuid4()),
                                outbox_event_id=outbox.outbox_event_id,
                                event_key=event_key,
                                status=DlqStatus.OPEN,
                                failed_stage=outbox.failed_stage or "unknown",
                                reason_code=outbox.reason_code or "RETRY_EXHAUSTED",
                                attempt_count=outbox.attempt_count,
                                created_at=now,
                            )
                            run.dlq_count += 1
                        outbox.status = OutboxStatus.DLQ
                        self.points.checkins[outbox.aggregate_id].point_status = PointApplicationStatus.DLQ
                    else:
                        outbox.status = OutboxStatus.RETRYING
                        if outbox.next_attempt_at is None or outbox.next_attempt_at > now:
                            outbox.next_attempt_at = now
                        self.points.checkins[outbox.aggregate_id].point_status = PointApplicationStatus.RETRYING
                        run.requeued_count += 1

                    outbox.updated_at = now
                    outbox.lease_owner = None
                    outbox.lease_until = None

                ledger_events = tuple(self.points.ledger_by_event_key.values())
                for season_id, projection in self.projections.items():
                    latest_version = sum(event.season_id == season_id for event in ledger_events)
                    if projection.current.projection_version != latest_version:
                        projection.replace_from_ledger(ledger_events)
                        run.projection_rebuild_count += 1

            run.status = ReconcileStatus.COMPLETED
            run.completed_at = self._now()
            self.runs.append(run)
        return run

    def process_ready(self, worker_id: str) -> int:
        """Process all currently due work, modelling the normal retry worker."""

        now = self._now()
        processed = 0
        with self.points._lock:
            ready_keys = [
                event_key
                for event_key, outbox in self.points.outbox_by_event_key.items()
                if outbox.status in (OutboxStatus.PENDING, OutboxStatus.RETRYING)
                and (outbox.next_attempt_at is None or outbox.next_attempt_at <= now)
            ]
        for event_key in ready_keys:
            self.begin_attempt(event_key, failed_stage="ledger_commit", worker_id=worker_id)
            ledger = self.points.consume_approval(event_key)
            projection = self.projections.get(ledger.season_id)
            if projection is not None:
                projection.apply(ledger)
            processed += 1
        return processed

    def _outbox(self, event_key: str) -> OutboxEvent:
        outbox = self.points.outbox_by_event_key.get(event_key)
        if outbox is None:
            raise PointsError("OUTBOX_NOT_FOUND", "승인 outbox 이벤트를 찾을 수 없습니다.")
        return outbox

    def _now(self) -> datetime:
        now = self.clock()
        if now.tzinfo is None or now.utcoffset() is None:
            raise ValueError("server clock must return a timezone-aware datetime")
        return now
