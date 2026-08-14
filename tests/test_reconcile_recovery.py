from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ktown_defense.points import (  # noqa: E402
    ApprovedCheckIn,
    OutboxStatus,
    PointApplicationStatus,
    PointsLedgerService,
)
from ktown_defense.reconcile import DlqStatus, ReconcileService  # noqa: E402
from ktown_defense.territory import TerritoryProjectionService  # noqa: E402


START = datetime(2026, 8, 12, 0, 0, tzinfo=timezone.utc)


class MutableClock:
    def __init__(self) -> None:
        self.current = START

    def __call__(self) -> datetime:
        return self.current

    def advance(self, **kwargs: int) -> None:
        self.current += timedelta(**kwargs)


class ReconcileRecoveryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.clock = MutableClock()
        self.points = PointsLedgerService(clock=self.clock)
        self.projection = TerritoryProjectionService("season-1", fandom_ids=("fandom-a",))
        self.reconcile = ReconcileService(
            points=self.points,
            projections={"season-1": self.projection},
            clock=self.clock,
        )

    def approve(self, suffix: str, *, place_id: str = "place-1") -> str:
        user_id = f"user-{suffix}"
        checkin_id = f"checkin-{suffix}"
        self.points.select_fandom(user_id, "season-1", "fandom-a")
        outbox = self.points.commit_first_approval(
            ApprovedCheckIn(checkin_id, user_id, place_id, "season-1")
        )
        return outbox.event_key

    def test_exactly_two_minute_old_processing_work_is_requeued_and_applied_once(self) -> None:
        event_key = self.approve("stale")
        self.reconcile.begin_attempt(event_key, failed_stage="ledger_commit")

        self.clock.advance(seconds=119)
        early = self.reconcile.run_once("reconciler-a")
        self.assertEqual(early.stale_found, 0)
        self.assertEqual(self.points.outbox_by_event_key[event_key].status, OutboxStatus.PROCESSING)

        self.clock.advance(seconds=1)
        recovered = self.reconcile.run_once("reconciler-a")
        self.assertEqual((recovered.stale_found, recovered.requeued_count), (1, 1))
        self.assertEqual(self.points.outbox_by_event_key[event_key].status, OutboxStatus.RETRYING)
        self.assertEqual(
            self.points.checkins["checkin-stale"].point_status,
            PointApplicationStatus.RETRYING,
        )

        first = self.reconcile.process_ready("worker-a")
        second = self.reconcile.process_ready("worker-b")
        self.assertEqual((first, second), (1, 0))
        self.assertEqual(len(self.points.ledger_by_event_key), 1)
        self.assertEqual(self.points.points_for("user-stale", "season-1"), 100)

    def test_existing_ledger_effect_is_deduplicated_when_stale_work_is_reconciled(self) -> None:
        event_key = self.approve("dedupe")
        original = self.points.consume_approval(event_key)
        outbox = self.points.outbox_by_event_key[event_key]
        outbox.status = OutboxStatus.RETRYING
        outbox.updated_at = self.clock() - timedelta(minutes=2)
        outbox.failed_stage = "ledger_commit"
        self.points.checkins["checkin-dedupe"].point_status = PointApplicationStatus.RETRYING

        result = self.reconcile.run_once("reconciler-a")

        self.assertEqual((result.stale_found, result.deduplicated_count), (1, 1))
        self.assertEqual(outbox.status, OutboxStatus.APPLIED)
        self.assertEqual(self.points.checkins["checkin-dedupe"].point_status, PointApplicationStatus.APPLIED)
        self.assertIs(self.points.ledger_by_event_key[event_key], original)
        self.assertEqual(len(self.points.ledger_by_event_key), 1)

    def test_failure_offsets_are_anchored_to_first_failure(self) -> None:
        event_key = self.approve("backoff")
        expected_offsets = (1, 5, 30, 120, 300)

        for attempt, offset in enumerate(expected_offsets, start=1):
            self.reconcile.begin_attempt(event_key, failed_stage="projection_commit")
            self.reconcile.record_failure(event_key, reason_code="INJECTED_EXIT")
            outbox = self.points.outbox_by_event_key[event_key]
            self.assertEqual(outbox.attempt_count, attempt)
            self.assertEqual(outbox.next_attempt_at, START + timedelta(seconds=offset))

    def test_only_exhausted_stale_work_moves_to_one_dlq_item(self) -> None:
        retry_key = self.approve("retry")
        exhausted_key = self.approve("exhausted")
        self.reconcile.begin_attempt(retry_key, failed_stage="outbox_publish")
        self.reconcile.record_failure(retry_key, reason_code="TEMPORARY")

        for _ in range(5):
            self.reconcile.begin_attempt(exhausted_key, failed_stage="ledger_commit")
            self.reconcile.record_failure(exhausted_key, reason_code="DB_DOWN")

        self.clock.advance(minutes=2)
        first = self.reconcile.run_once("reconciler-a")
        second = self.reconcile.run_once("reconciler-b")

        self.assertEqual(first.dlq_count, 1)
        self.assertEqual(first.requeued_count, 1)
        self.assertEqual(second.dlq_count, 0)
        self.assertEqual(len(self.reconcile.dlq_by_event_key), 1)
        item = self.reconcile.dlq_by_event_key[exhausted_key]
        self.assertEqual(item.status, DlqStatus.OPEN)
        self.assertEqual(item.failed_stage, "ledger_commit")
        self.assertEqual(item.reason_code, "DB_DOWN")
        self.assertEqual(item.attempt_count, 5)
        self.assertEqual(self.points.outbox_by_event_key[exhausted_key].status, OutboxStatus.DLQ)
        self.assertEqual(self.points.outbox_by_event_key[retry_key].status, OutboxStatus.RETRYING)

    def test_lagging_projection_is_atomically_rebuilt_to_latest_ledger_version(self) -> None:
        for suffix in ("one", "two", "three"):
            event_key = self.approve(suffix)
            self.points.consume_approval(event_key)
            self.clock.advance(seconds=1)

        self.assertEqual(self.projection.current.projection_version, 0)
        expected = TerritoryProjectionService("season-1", fandom_ids=("fandom-a",)).rebuild(
            self.points.ledger_by_event_key.values()
        )

        result = self.reconcile.run_once("reconciler-a")

        self.assertEqual(result.projection_rebuild_count, 1)
        self.assertEqual(self.projection.current.projection_version, 3)
        self.assertEqual(self.projection.current.projection_hash, expected.projection_hash)
        self.assertEqual(self.projection.current.strongholds[0].owner_fandom_id, "fandom-a")


if __name__ == "__main__":
    unittest.main()
