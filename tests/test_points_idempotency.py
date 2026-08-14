from __future__ import annotations

import sys
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ktown_defense.points import (  # noqa: E402
    ApprovedCheckIn,
    LedgerEventType,
    PointApplicationStatus,
    PointsLedgerService,
)


NOW = datetime(2026, 8, 12, 9, 0, tzinfo=timezone.utc)


class PointsIdempotencyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = PointsLedgerService(clock=lambda: NOW)
        self.membership = self.service.select_fandom("user-1", "season-1", "fandom-a")

    def checkin(self, checkin_id: str, *, place_id: str = "place-1") -> ApprovedCheckIn:
        return ApprovedCheckIn(checkin_id, "user-1", place_id, "season-1")

    def test_approval_commit_locks_membership_and_creates_one_outbox(self) -> None:
        checkin = self.checkin("checkin-1")

        first = self.service.commit_first_approval(checkin)
        duplicate = self.service.commit_first_approval(checkin)

        self.assertIs(first, duplicate)
        self.assertEqual("checkin:checkin-1:approved:v1", first.event_key)
        self.assertEqual(PointApplicationStatus.APPROVED_PROCESSING, checkin.point_status)
        self.assertEqual(NOW, self.membership.locked_at)
        self.assertEqual(1, len(self.service.outbox_by_event_key))
        with self.assertRaisesRegex(Exception, "팬덤을 변경"):
            self.service.select_fandom("user-1", "season-1", "fandom-b")

    def test_failure_before_commit_leaves_all_transaction_members_unchanged(self) -> None:
        checkin = self.checkin("checkin-failed")

        with self.assertRaisesRegex(RuntimeError, "injected"):
            self.service.commit_first_approval(
                checkin, before_commit=lambda: (_ for _ in ()).throw(RuntimeError("injected"))
            )

        self.assertEqual(PointApplicationStatus.NOT_STARTED, checkin.point_status)
        self.assertIsNone(self.membership.locked_at)
        self.assertEqual({}, self.service.outbox_by_event_key)

    def test_duplicate_delivery_and_reprocessing_return_one_100_point_event(self) -> None:
        outbox = self.service.commit_first_approval(self.checkin("checkin-1"))

        with ThreadPoolExecutor(max_workers=8) as pool:
            events = list(pool.map(lambda _: self.service.consume_approval(outbox.event_key), range(24)))

        self.assertEqual(1, len({event.ledger_event_id for event in events}))
        self.assertEqual(1, len(self.service.ledger_by_event_key))
        self.assertEqual(100, self.service.points_for("user-1", "season-1"))

    def test_concurrent_repeat_visit_records_zero_without_extra_points(self) -> None:
        first_outbox = self.service.commit_first_approval(self.checkin("checkin-first"))
        self.service.consume_approval(first_outbox.event_key)
        repeat_outbox = self.service.commit_first_approval(self.checkin("checkin-repeat"))

        with ThreadPoolExecutor(max_workers=8) as pool:
            repeats = list(pool.map(lambda _: self.service.consume_approval(repeat_outbox.event_key), range(16)))

        repeat = repeats[0]
        self.assertTrue(all(item is repeat for item in repeats))
        self.assertEqual(0, repeat.points)
        self.assertEqual(LedgerEventType.REPEAT_ZERO, repeat.event_type)
        self.assertEqual(2, len(self.service.ledger_by_event_key))
        self.assertEqual(100, self.service.points_for("user-1", "season-1"))

    def test_two_first_visit_candidates_racing_award_only_one_score(self) -> None:
        outboxes = [
            self.service.commit_first_approval(self.checkin("checkin-a")),
            self.service.commit_first_approval(self.checkin("checkin-b")),
        ]

        with ThreadPoolExecutor(max_workers=2) as pool:
            events = list(pool.map(lambda item: self.service.consume_approval(item.event_key), outboxes))

        self.assertEqual([0, 100], sorted(event.points for event in events))
        self.assertEqual(100, self.service.points_for("user-1", "season-1"))


if __name__ == "__main__":
    unittest.main()
