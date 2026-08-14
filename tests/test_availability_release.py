from __future__ import annotations

import sys
import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ktown_defense.availability import (  # noqa: E402
    CORE_E2E,
    SYNTHETIC_CHECKS,
    AvailabilityBucket,
    AvailabilityReleaseEvaluator,
    AvailabilityRun,
    CiTestResult,
    Defect,
    DefectSeverity,
    PlannedMaintenance,
    ReleaseContractError,
    SyntheticCheck,
)


START = datetime(2026, 7, 1, tzinfo=timezone.utc)
MINUTES_IN_FOUR_WEEKS = 4 * 7 * 24 * 60
PASSING_CHECKS = tuple(
    SyntheticCheck(
        check_name=name,
        status_code=200,
        duration_seconds=3.0,
        schema_valid=True,
    )
    for name in SYNTHETIC_CHECKS
)


def buckets() -> tuple[AvailabilityBucket, ...]:
    return tuple(
        AvailabilityBucket(started_at=START + timedelta(minutes=index), checks=PASSING_CHECKS)
        for index in range(MINUTES_IN_FOUR_WEEKS)
    )


def passing_run() -> AvailabilityRun:
    ci_results = tuple(
        CiTestResult(test_id=test_id, first_attempt_passed=True)
        for test_id in CORE_E2E
    ) + tuple(
        CiTestResult(test_id=f"regression-{index}", first_attempt_passed=index < 95)
        for index in range(100)
    )
    return AvailabilityRun(
        window_started_at=START,
        window_ended_at=START + timedelta(weeks=4),
        buckets=buckets(),
        planned_maintenance=(),
        ci_results=ci_results,
        defects=(),
    )


class AvailabilityReleaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.valid_run = passing_run()

    def test_four_week_report_meets_availability_and_release_boundaries(self) -> None:
        report = AvailabilityReleaseEvaluator().evaluate(self.valid_run)

        self.assertTrue(report.passed)
        self.assertEqual(MINUTES_IN_FOUR_WEEKS, report.total_buckets)
        self.assertEqual(MINUTES_IN_FOUR_WEEKS, report.included_buckets)
        self.assertEqual(1.0, report.availability_rate)
        self.assertEqual(0.95, report.regression_first_attempt_pass_rate)
        self.assertEqual(set(CORE_E2E), set(report.passed_core_e2e))

    def test_a_bucket_requires_each_check_once_with_2xx_schema_and_three_seconds(self) -> None:
        run = self.valid_run
        broken_checks = (
            replace(PASSING_CHECKS[0], status_code=500),
            replace(PASSING_CHECKS[1], duration_seconds=3.001),
            replace(PASSING_CHECKS[2], schema_valid=False),
            PASSING_CHECKS[3],
        )
        changed = list(run.buckets)
        changed[0] = replace(changed[0], checks=broken_checks)
        report = AvailabilityReleaseEvaluator().evaluate(
            replace(run, buckets=tuple(changed))
        )
        self.assertEqual(MINUTES_IN_FOUR_WEEKS - 1, report.successful_buckets)

        duplicate = replace(
            run,
            buckets=(replace(run.buckets[0], checks=PASSING_CHECKS + (PASSING_CHECKS[0],)),)
            + run.buckets[1:],
        )
        with self.assertRaisesRegex(ReleaseContractError, "exactly once"):
            AvailabilityReleaseEvaluator().evaluate(duplicate)

    def test_only_eligible_planned_maintenance_is_excluded_from_denominator(self) -> None:
        run = self.valid_run
        maintenances = (
            PlannedMaintenance("eligible-1", START + timedelta(hours=1), START + timedelta(hours=1, minutes=30), START - timedelta(hours=24)),
            PlannedMaintenance("eligible-2", START + timedelta(hours=3), START + timedelta(hours=3, minutes=30), START - timedelta(days=2)),
            PlannedMaintenance("third-in-month", START + timedelta(hours=5), START + timedelta(hours=5, minutes=30), START - timedelta(days=2)),
            PlannedMaintenance("short-notice", START + timedelta(hours=7), START + timedelta(hours=7, minutes=30), START - timedelta(hours=23, minutes=59)),
            PlannedMaintenance("too-long", START + timedelta(hours=9), START + timedelta(hours=9, minutes=31), START - timedelta(days=2)),
        )
        report = AvailabilityReleaseEvaluator().evaluate(
            replace(run, planned_maintenance=maintenances)
        )

        self.assertEqual(60, report.excluded_buckets)
        self.assertEqual(
            ("eligible-1", "eligible-2"), report.eligible_maintenance_ids
        )

    def test_availability_below_995_or_incomplete_four_week_series_blocks_release(self) -> None:
        run = self.valid_run
        changed = list(run.buckets)
        failed_checks = (replace(PASSING_CHECKS[0], status_code=503),) + PASSING_CHECKS[1:]
        for index in range(202):
            changed[index] = replace(changed[index], checks=failed_checks)
        report = AvailabilityReleaseEvaluator().evaluate(
            replace(run, buckets=tuple(changed))
        )
        self.assertLess(report.availability_rate, 0.995)
        self.assertFalse(report.targets["availability"])
        self.assertFalse(report.passed)

        with self.assertRaisesRegex(ReleaseContractError, "one-minute bucket"):
            AvailabilityReleaseEvaluator().evaluate(
                replace(run, buckets=run.buckets[:-1])
            )

    def test_core_e2e_regression_and_unresolved_defect_gates_are_all_required(self) -> None:
        run = self.valid_run
        failing_ci = tuple(
            replace(result, first_attempt_passed=False)
            if result.test_id in (CORE_E2E[0], "regression-0")
            else result
            for result in run.ci_results
        )
        defects = (
            Defect("p0-1", DefectSeverity.P0, resolved=False),
            Defect("p2-good", DefectSeverity.P2, resolved=False, owner="ops", workaround="기능 플래그 비활성화"),
            Defect("p2-bad", DefectSeverity.P2, resolved=False, owner="", workaround=""),
        )
        report = AvailabilityReleaseEvaluator().evaluate(
            replace(run, ci_results=failing_ci, defects=defects)
        )

        self.assertFalse(report.targets["core_e2e"])
        self.assertFalse(report.targets["regression"])
        self.assertFalse(report.targets["defects"])
        self.assertFalse(report.passed)


if __name__ == "__main__":
    unittest.main()
