from __future__ import annotations

import sys
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ktown_defense.points import (  # noqa: E402
    ApprovedCheckIn,
    LedgerEventType,
    PointApplicationStatus,
    PointsError,
    PointsLedgerService,
    ReversalReason,
)


class MutableClock:
    def __init__(self) -> None:
        self.now = datetime(2026, 8, 12, 9, 0, tzinfo=timezone.utc)

    def __call__(self) -> datetime:
        return self.now


class LedgerReversalTests(unittest.TestCase):
    def setUp(self) -> None:
        self.clock = MutableClock()
        self.service = PointsLedgerService(clock=self.clock)
        self.service.select_fandom("user-1", "season-1", "fandom-a")

    def approve(self, checkin_id: str, place_id: str = "place-1"):
        checkin = ApprovedCheckIn(checkin_id, "user-1", place_id, "season-1")
        outbox = self.service.commit_first_approval(checkin)
        return checkin, self.service.consume_approval(outbox.event_key)

    def test_approval_cancellation_appends_opposite_event_and_preserves_original(self) -> None:
        checkin, original = self.approve("checkin-1")
        original_snapshot = original
        self.clock.now += timedelta(minutes=1)

        reversal = self.service.reverse_approval(
            original.event_key, ReversalReason.APPROVAL_CANCELLED
        )

        self.assertIs(original_snapshot, self.service.ledger_by_event_key[original.event_key])
        self.assertEqual(2, len(self.service.ledger_by_event_key))
        self.assertEqual(LedgerEventType.REVERSAL, reversal.event_type)
        self.assertEqual(original.ledger_event_id, reversal.reversal_of)
        self.assertEqual(-original.points, reversal.points)
        self.assertEqual(PointApplicationStatus.REVERSED, checkin.point_status)
        self.assertEqual(0, self.service.points_for("user-1", "season-1"))

    def test_fraud_reversal_is_idempotent_under_duplicate_requests(self) -> None:
        _, original = self.approve("checkin-fraud")

        with ThreadPoolExecutor(max_workers=8) as pool:
            events = list(
                pool.map(
                    lambda _: self.service.reverse_approval(
                        original.event_key, ReversalReason.FRAUD_CONFIRMED
                    ),
                    range(20),
                )
            )

        self.assertEqual(1, len({event.ledger_event_id for event in events}))
        self.assertEqual(2, len(self.service.ledger_by_event_key))
        self.assertEqual(0, self.service.points_for("user-1", "season-1"))

    def test_replay_matches_current_score_after_mixed_reversals(self) -> None:
        _, first = self.approve("checkin-first", "place-1")
        self.clock.now += timedelta(seconds=1)
        self.approve("checkin-second", "place-2")
        self.clock.now += timedelta(seconds=1)
        self.service.reverse_approval(first.event_key, ReversalReason.FRAUD_CONFIRMED)

        replayed = self.service.replay_scores()

        self.assertEqual(100, replayed[("user-1", "season-1")])
        self.assertEqual(replayed[("user-1", "season-1")], self.service.points_for("user-1", "season-1"))

    def test_missing_or_reversal_target_is_rejected_without_mutation(self) -> None:
        with self.assertRaisesRegex(PointsError, "찾을 수 없습니다"):
            self.service.reverse_approval("missing", ReversalReason.APPROVAL_CANCELLED)

        _, original = self.approve("checkin-1")
        reversal = self.service.reverse_approval(
            original.event_key, ReversalReason.APPROVAL_CANCELLED
        )
        with self.assertRaisesRegex(PointsError, "다시 역분개"):
            self.service.reverse_approval(reversal.event_key, ReversalReason.APPROVAL_CANCELLED)
        self.assertEqual(2, len(self.service.ledger_by_event_key))


if __name__ == "__main__":
    unittest.main()
