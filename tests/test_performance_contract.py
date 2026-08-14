from __future__ import annotations

import sys
import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ktown_defense.performance import (  # noqa: E402
    ApiTiming,
    EventTiming,
    MeasurementContractError,
    PerformanceContractEvaluator,
    PerformanceRun,
    PhotoTiming,
)


START = datetime(2026, 8, 12, 0, 0, tzinfo=timezone.utc)
CORE_ENDPOINTS = (
    "GET /api/v1/places",
    "GET /api/v1/places/{placeId}",
    "POST /api/v1/checkin-sessions",
    "POST /api/v1/checkin-sessions/{id}/submit",
    "GET /api/v1/checkins/{id}",
    "GET /api/v1/seasons/current/strongholds",
    "GET /api/v1/seasons/current/leaderboards",
)
FAILURE_STAGES = (
    "before_db_commit",
    "before_outbox_publish",
    "before_ledger_commit",
    "before_projection_commit",
)


def passing_run() -> PerformanceRun:
    observed_from = START + timedelta(minutes=5)
    api_timings = tuple(
        ApiTiming(
            endpoint=endpoint,
            received_at=observed_from + timedelta(seconds=index),
            completed_at=observed_from + timedelta(seconds=index, milliseconds=1000),
            status_code=200,
        )
        for endpoint in CORE_ENDPOINTS
        for index in range(100)
    )
    photo_timings = tuple(
        PhotoTiming(
            request_id=f"photo-{index}",
            bytes_received_at=observed_from + timedelta(milliseconds=index),
            completed_at=observed_from + timedelta(seconds=2, milliseconds=index),
            successful=True,
        )
        for index in range(100)
    )
    events = []
    # 10,000 approvals makes exactly 1,000 injected failures at the fixed 10%
    # rate. Each stage receives exactly one quarter of that denominator.
    for index in range(10_000):
        approved_at = observed_from + timedelta(milliseconds=index)
        failed = index < 1_000
        stage = FAILURE_STAGES[index % 4] if failed else None
        first_failed_at = approved_at if failed else None
        events.append(
            EventTiming(
                event_key=f"checkin:{index}:approved:v1",
                approved_processing_at=approved_at,
                ledger_committed_at=approved_at + timedelta(seconds=3),
                stronghold_projected_at=approved_at + timedelta(seconds=33),
                leaderboard_projected_at=approved_at + timedelta(seconds=33),
                first_failed_at=first_failed_at,
                applied_at=(first_failed_at + timedelta(minutes=5) if failed else approved_at + timedelta(seconds=30)),
                injected_failure_stage=stage,
            )
        )
    return PerformanceRun(
        contract_version="ktown-defense.seed.ouroboros-0.51.2",
        random_seed=20260812,
        arrival_model="seeded Poisson arrivals",
        requests_per_second=20,
        concurrent_users=100,
        traffic_mix_percent=(30, 15, 10, 10, 10, 10, 15),
        photo_distribution_percent=(50, 40, 10),
        run_started_at=START,
        observed_from=observed_from,
        observed_until=observed_from + timedelta(minutes=30),
        api_timings=api_timings,
        photo_timings=photo_timings,
        event_timings=tuple(events),
    )


class PerformanceContractTests(unittest.TestCase):
    def test_version_pinned_run_meets_all_four_latency_and_three_reliability_targets(self) -> None:
        report = PerformanceContractEvaluator().evaluate(passing_run())

        self.assertTrue(report.passed)
        self.assertEqual(report.contract_version, "ktown-defense.seed.ouroboros-0.51.2")
        self.assertEqual(set(report.latency_seconds), set(CORE_ENDPOINTS) | {
            "photo_upload_to_submit",
            "approval_to_ledger",
            "ledger_to_projections",
        })
        for endpoint in CORE_ENDPOINTS:
            self.assertEqual(report.latency_seconds[endpoint], 1.0)
        self.assertEqual(report.latency_seconds["photo_upload_to_submit"], 2.0)
        self.assertEqual(report.latency_seconds["approval_to_ledger"], 3.0)
        self.assertEqual(report.latency_seconds["ledger_to_projections"], 30.0)
        self.assertEqual(report.reliability_rates, {
            "approval_ledger_within_3s": 1.0,
            "both_projections_within_30s": 1.0,
            "failed_event_recovery_within_5m": 1.0,
        })

    def test_rejects_a_report_that_changes_the_common_load_or_observation_window(self) -> None:
        evaluator = PerformanceContractEvaluator()

        for changed in (
            replace(passing_run(), requests_per_second=19),
            replace(passing_run(), observed_until=START + timedelta(minutes=34, seconds=59)),
        ):
            with self.subTest(changed=changed.requests_per_second, until=changed.observed_until):
                with self.assertRaises(MeasurementContractError):
                    evaluator.evaluate(changed)

    def test_latency_uses_successful_requests_per_endpoint_and_enforces_sample_minimum(self) -> None:
        run = passing_run()
        slow_failure = ApiTiming(
            endpoint=CORE_ENDPOINTS[0],
            received_at=run.observed_from,
            completed_at=run.observed_from + timedelta(seconds=99),
            status_code=503,
        )
        report = PerformanceContractEvaluator().evaluate(
            replace(run, api_timings=run.api_timings + (slow_failure,))
        )
        self.assertEqual(report.latency_seconds[CORE_ENDPOINTS[0]], 1.0)

        missing_one_success = tuple(
            timing for index, timing in enumerate(run.api_timings) if index != 0
        )
        with self.assertRaises(MeasurementContractError):
            PerformanceContractEvaluator().evaluate(replace(run, api_timings=missing_one_success))

    def test_unique_event_denominators_expose_a_reliability_target_miss(self) -> None:
        run = passing_run()
        events = list(run.event_timings)
        # Six late ledger commits out of 1,000 approvals would miss 99.5%; the
        # full common denominator of 10,000 keeps the rate at 99.94%.
        for index in range(6):
            events[index] = replace(
                events[index],
                ledger_committed_at=events[index].approved_processing_at + timedelta(seconds=4),
            )
        report = PerformanceContractEvaluator().evaluate(replace(run, event_timings=tuple(events)))
        self.assertTrue(report.targets["approval_ledger_reliability"])
        self.assertEqual(report.denominators["approval_events"], 10_000)

        events[6:51] = [
            replace(event, ledger_committed_at=event.approved_processing_at + timedelta(seconds=4))
            for event in events[6:51]
        ]
        failed = PerformanceContractEvaluator().evaluate(replace(run, event_timings=tuple(events)))
        self.assertFalse(failed.targets["approval_ledger_reliability"])
        self.assertFalse(failed.passed)

        duplicate = replace(events[0], ledger_committed_at=events[0].approved_processing_at)
        with self.assertRaises(MeasurementContractError):
            PerformanceContractEvaluator().evaluate(
                replace(run, event_timings=tuple(events) + (duplicate,))
            )


if __name__ == "__main__":
    unittest.main()
