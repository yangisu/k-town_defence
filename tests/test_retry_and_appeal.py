from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from ktown_defense.auth import OperatorRole, Principal
from ktown_defense.review import (
    AppealStatus,
    CheckInDecisionStatus,
    RetryLimiter,
    ReviewAppealService,
    ReviewedCheckIn,
    ReviewError,
)


class MutableClock:
    def __init__(self, now: datetime) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now


class RetryAndAppealTests(unittest.TestCase):
    def setUp(self) -> None:
        self.clock = MutableClock(datetime(2026, 8, 12, 0, 0, tzinfo=timezone.utc))
        self.reviewer = Principal.operator("reviewer-1", [OperatorRole.REVIEWER])
        self.member = Principal.member("user-1", adult_verified=True)

    def assert_code(self, code, callback):
        with self.assertRaises(ReviewError) as caught:
            callback()
        self.assertEqual(code, caught.exception.code)

    def test_retry_limit_is_per_user_place_and_korean_local_date(self) -> None:
        limiter = RetryLimiter(self.clock)
        self.assertEqual([1, 2, 3], [limiter.record_retry("user-1", "place-1").attempt_number for _ in range(3)])
        self.assert_code("DAILY_RETRY_LIMIT_EXCEEDED", lambda: limiter.record_retry("user-1", "place-1"))
        self.assertEqual(1, limiter.record_retry("user-1", "place-2").attempt_number)
        self.assertEqual(1, limiter.record_retry("user-2", "place-1").attempt_number)

        # 15:00 UTC is midnight in Korea: the same pair receives a fresh quota.
        self.clock.now = datetime(2026, 8, 12, 15, 0, tzinfo=timezone.utc)
        self.assertEqual(1, limiter.record_retry("user-1", "place-1").attempt_number)

    def test_appeal_is_allowed_once_through_the_exact_48_hour_boundary(self) -> None:
        service = ReviewAppealService(self.clock)
        checkin = ReviewedCheckIn("checkin-1", "user-1")
        service.decide_checkin(checkin, operator=self.reviewer, decision="rejected", reason_ko="현장 인증 조건이 불충분합니다.")
        self.clock.now += timedelta(hours=48)
        appeal = service.submit_appeal(checkin, member=self.member, reason_ko="현장에서 정상적으로 촬영하고 위치를 확인했습니다.")
        self.assertEqual(AppealStatus.SUBMITTED, appeal.status)
        self.assertEqual(self.clock.now + timedelta(hours=72), appeal.due_at)
        self.assert_code("APPEAL_ALREADY_SUBMITTED", lambda: service.submit_appeal(checkin, member=self.member, reason_ko="다시 제출합니다."))

    def test_appeal_after_48_hours_is_rejected_using_server_time(self) -> None:
        service = ReviewAppealService(self.clock)
        checkin = ReviewedCheckIn("checkin-2", "user-1")
        service.decide_checkin(checkin, operator=self.reviewer, decision="rejected", reason_ko="위치 확인이 불가능합니다.")
        self.clock.now += timedelta(hours=48, microseconds=1)
        self.assert_code("APPEAL_WINDOW_EXPIRED", lambda: service.submit_appeal(checkin, member=self.member, reason_ko="현장에 실제로 방문했습니다."))

    def test_only_owner_active_adult_member_can_appeal(self) -> None:
        service = ReviewAppealService(self.clock)
        checkin = ReviewedCheckIn("checkin-3", "user-1", CheckInDecisionStatus.REJECTED, decided_at=self.clock.now)
        other = Principal.member("other", adult_verified=True)
        self.assert_code("FORBIDDEN", lambda: service.submit_appeal(checkin, member=other, reason_ko="다른 사용자의 요청입니다."))

    def test_only_reviewer_can_make_each_final_decision_and_attempt_is_audited(self) -> None:
        service = ReviewAppealService(self.clock)
        checkin = ReviewedCheckIn("checkin-4", "user-1")
        place_manager = Principal.operator("place-operator", [OperatorRole.PLACE_MANAGER])
        self.assert_code("FORBIDDEN", lambda: service.decide_checkin(checkin, operator=place_manager, decision="rejected", reason_ko="판정 시도입니다."))
        self.assertFalse(service.audit_log[-1].allowed)
        service.decide_checkin(checkin, operator=self.reviewer, decision="rejected", reason_ko="현장 조건이 불충분합니다.")
        service.submit_appeal(checkin, member=self.member, reason_ko="현장 조건을 다시 확인해 주세요.")
        self.assert_code("FORBIDDEN", lambda: service.decide_appeal(checkin, operator=place_manager, decision="overturned"))
        decided = service.decide_appeal(checkin, operator=self.reviewer, decision="overturned")
        self.assertEqual(AppealStatus.OVERTURNED, decided.status)
        self.assertEqual(CheckInDecisionStatus.REJECTED, checkin.status)
        self.assertEqual("reviewer-1", decided.reviewer_id)

    def test_final_decisions_cannot_be_repeated(self) -> None:
        service = ReviewAppealService(self.clock)
        checkin = ReviewedCheckIn("checkin-5", "user-1")
        service.decide_checkin(checkin, operator=self.reviewer, decision="approved", reason_ko="검수 조건을 충족했습니다.")
        self.assert_code("INVALID_REVIEW_TRANSITION", lambda: service.decide_checkin(checkin, operator=self.reviewer, decision="rejected", reason_ko="판정을 변경합니다."))


if __name__ == "__main__":
    unittest.main()
