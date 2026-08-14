import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ktown_defense.points import LedgerEvent, LedgerEventType
from ktown_defense.season import (
    DualApprovalStatus,
    Season,
    SeasonError,
    SeasonFinalizationService,
    SeasonStatus,
)
from ktown_defense.territory import TerritoryProjectionService


UTC = timezone.utc
START = datetime(2026, 8, 1, tzinfo=UTC)
END = datetime(2026, 9, 1, tzinfo=UTC)


class MutableClock:
    def __init__(self, now: datetime) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now


def score(event_id: str, fandom_id: str, *, created_at: datetime) -> LedgerEvent:
    return LedgerEvent(
        ledger_event_id=event_id,
        event_key=f"event:{event_id}",
        checkin_id=f"checkin:{event_id}",
        user_id=f"user:{event_id}",
        fandom_id=fandom_id,
        place_id="place-1",
        season_id="season-1",
        points=300,
        event_type=LedgerEventType.FIRST_SCORE,
        created_at=created_at,
    )


class SeasonFinalizationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.clock = MutableClock(END - timedelta(seconds=1))
        self.projection = TerritoryProjectionService(
            "season-1", fandom_ids=("fandom-a", "fandom-b")
        )
        self.service = SeasonFinalizationService(clock=self.clock)
        self.service.add_season(Season("season-1", START, END))

    def test_only_submissions_strictly_before_end_receive_72_hour_grace(self) -> None:
        self.service.record_submission("before", "season-1", END - timedelta(microseconds=1))
        self.service.record_submission("at-end", "season-1", END)
        self.service.record_submission("after", "season-1", END + timedelta(seconds=1))

        self.clock.now = END
        season = self.service.advance_season("season-1")

        self.assertEqual(SeasonStatus.REVIEW_GRACE, season.status)
        self.assertEqual(END + timedelta(hours=72), season.review_grace_ends_at)
        self.assertEqual(("before",), self.service.grace_checkin_ids("season-1"))

    def test_finalization_requires_elapsed_grace_and_a_distinct_second_approver(self) -> None:
        self.clock.now = END + timedelta(hours=71, minutes=59)
        with self.assertRaisesRegex(SeasonError, "REVIEW_GRACE_ACTIVE"):
            self.service.request_finalization("season-1", requester_id="operator-1")

        self.clock.now = END + timedelta(hours=72)
        approval = self.service.request_finalization("season-1", requester_id="operator-1")
        self.assertEqual(SeasonStatus.AWAITING_DUAL_APPROVAL, self.service.seasons["season-1"].status)

        with self.assertRaisesRegex(SeasonError, "DISTINCT_APPROVER_REQUIRED"):
            self.service.approve_finalization(approval.dual_approval_id, approver_id="operator-1")

        approval = self.service.approve_finalization(
            approval.dual_approval_id, approver_id="operator-2"
        )
        self.assertEqual(DualApprovalStatus.APPROVED, approval.status)

        finalized = self.service.finalize_season(
            "season-1", approval.dual_approval_id, self.projection.current
        )
        self.assertEqual(SeasonStatus.FINALIZED, finalized.status)
        self.assertEqual(self.clock.now, finalized.finalized_at)

    def test_results_are_preserved_and_new_season_projection_starts_empty(self) -> None:
        self.projection.apply(score("001", "fandom-a", created_at=END - timedelta(days=1)))
        self.clock.now = END + timedelta(hours=72)
        approval = self.service.request_finalization("season-1", requester_id="operator-1")
        self.service.approve_finalization(approval.dual_approval_id, approver_id="operator-2")
        self.service.finalize_season(
            "season-1", approval.dual_approval_id, self.projection.current
        )

        results = self.service.results_for("season-1")
        self.assertEqual(
            [(1, "fandom-a", 1, 300), (2, "fandom-b", 0, 0)],
            [(r.rank, r.fandom_id, r.stronghold_count, r.valid_points) for r in results],
        )

        new_projection = self.service.open_next_season(
            Season("season-2", self.clock.now, self.clock.now + timedelta(days=30)),
            fandom_ids=("fandom-a", "fandom-b"),
        )
        self.assertEqual((), new_projection.current.strongholds)
        self.assertTrue(all(row.valid_points == 0 for row in new_projection.current.leaderboard))
        self.assertEqual(results, self.service.results_for("season-1"))

        with self.assertRaisesRegex(SeasonError, "SEASON_ALREADY_FINALIZED"):
            self.service.finalize_season(
                "season-1", approval.dual_approval_id, self.projection.current
            )


if __name__ == "__main__":
    unittest.main()
