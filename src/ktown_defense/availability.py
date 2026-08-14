"""Four-week availability SLI and CI/defect release gates."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum


SYNTHETIC_CHECKS = (
    "public_discovery",
    "test_login",
    "checkin_submit",
    "leaderboard",
)
CORE_E2E = (
    "J1_public_discovery",
    "J2_join_and_lock",
    "J3_checkin_recovery",
    "J4_review_and_appeal",
    "J5_ledger_to_season",
    "J6_reconcile_recovery",
)


class ReleaseContractError(ValueError):
    """Raised when evidence does not follow the fixed measurement contract."""


class DefectSeverity(StrEnum):
    P0 = "P0"
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"


@dataclass(frozen=True)
class SyntheticCheck:
    check_name: str
    status_code: int
    duration_seconds: float
    schema_valid: bool

    @property
    def successful(self) -> bool:
        return (
            200 <= self.status_code < 300
            and 0 <= self.duration_seconds <= 3
            and self.schema_valid
        )


@dataclass(frozen=True)
class AvailabilityBucket:
    started_at: datetime
    checks: tuple[SyntheticCheck, ...]


@dataclass(frozen=True)
class PlannedMaintenance:
    maintenance_id: str
    started_at: datetime
    ended_at: datetime
    announced_at: datetime


@dataclass(frozen=True)
class CiTestResult:
    test_id: str
    first_attempt_passed: bool


@dataclass(frozen=True)
class Defect:
    defect_id: str
    severity: DefectSeverity
    resolved: bool
    owner: str | None = None
    workaround: str | None = None


@dataclass(frozen=True)
class AvailabilityRun:
    window_started_at: datetime
    window_ended_at: datetime
    buckets: tuple[AvailabilityBucket, ...]
    planned_maintenance: tuple[PlannedMaintenance, ...]
    ci_results: tuple[CiTestResult, ...]
    defects: tuple[Defect, ...]


@dataclass(frozen=True)
class AvailabilityReleaseReport:
    total_buckets: int
    excluded_buckets: int
    included_buckets: int
    successful_buckets: int
    availability_rate: float
    eligible_maintenance_ids: tuple[str, ...]
    passed_core_e2e: tuple[str, ...]
    regression_first_attempt_pass_rate: float
    targets: dict[str, bool]

    @property
    def passed(self) -> bool:
        return all(self.targets.values())


class AvailabilityReleaseEvaluator:
    """Evaluate availability and release evidence without retry masking."""

    WINDOW = timedelta(weeks=4)
    BUCKET = timedelta(minutes=1)
    MAX_CHECK_DURATION_SECONDS = 3
    MIN_AVAILABILITY = 0.995
    MIN_NOTICE = timedelta(hours=24)
    MAX_MAINTENANCE_DURATION = timedelta(minutes=30)
    MAX_MONTHLY_MAINTENANCES = 2
    MIN_REGRESSION_PASS_RATE = 0.95
    MAX_UNRESOLVED_P2 = 3

    def evaluate(self, run: AvailabilityRun) -> AvailabilityReleaseReport:
        self._validate_window(run)
        ordered_buckets = self._validate_buckets(run)
        eligible = self._eligible_maintenance(run)
        excluded_starts = {
            bucket.started_at
            for bucket in ordered_buckets
            if any(
                maintenance.started_at <= bucket.started_at < maintenance.ended_at
                for maintenance in eligible
            )
        }
        included = [
            bucket for bucket in ordered_buckets if bucket.started_at not in excluded_starts
        ]
        if not included:
            raise ReleaseContractError("availability denominator cannot be zero")
        successful = sum(
            all(check.successful for check in bucket.checks) for bucket in included
        )
        availability_rate = successful / len(included)

        ci_by_id = self._validate_ci_results(run.ci_results)
        passed_core = tuple(
            test_id
            for test_id in CORE_E2E
            if ci_by_id.get(test_id) is not None
            and ci_by_id[test_id].first_attempt_passed
        )
        regression = [
            result for result in run.ci_results if result.test_id not in CORE_E2E
        ]
        if not regression:
            raise ReleaseContractError("automated regression results cannot be empty")
        regression_rate = sum(result.first_attempt_passed for result in regression) / len(
            regression
        )

        defects_pass = self._defects_pass(run.defects)
        targets = {
            "availability": availability_rate >= self.MIN_AVAILABILITY,
            "core_e2e": len(passed_core) == len(CORE_E2E),
            "regression": regression_rate >= self.MIN_REGRESSION_PASS_RATE,
            "defects": defects_pass,
        }
        return AvailabilityReleaseReport(
            total_buckets=len(ordered_buckets),
            excluded_buckets=len(excluded_starts),
            included_buckets=len(included),
            successful_buckets=successful,
            availability_rate=availability_rate,
            eligible_maintenance_ids=tuple(item.maintenance_id for item in eligible),
            passed_core_e2e=passed_core,
            regression_first_attempt_pass_rate=regression_rate,
            targets=targets,
        )

    def _validate_window(self, run: AvailabilityRun) -> None:
        self._require_aware(run.window_started_at, "window_started_at")
        self._require_aware(run.window_ended_at, "window_ended_at")
        if run.window_ended_at - run.window_started_at != self.WINDOW:
            raise ReleaseContractError("availability window must be exactly four weeks")

    def _validate_buckets(
        self, run: AvailabilityRun
    ) -> tuple[AvailabilityBucket, ...]:
        expected_count = int(self.WINDOW / self.BUCKET)
        if len(run.buckets) != expected_count:
            raise ReleaseContractError("every one-minute bucket must be present for four weeks")
        ordered = tuple(sorted(run.buckets, key=lambda bucket: bucket.started_at))
        expected_names = set(SYNTHETIC_CHECKS)
        for index, bucket in enumerate(ordered):
            self._require_aware(bucket.started_at, "bucket.started_at")
            expected_start = run.window_started_at + index * self.BUCKET
            if bucket.started_at != expected_start:
                raise ReleaseContractError("every one-minute bucket must be present exactly once")
            names = [check.check_name for check in bucket.checks]
            if len(names) != len(SYNTHETIC_CHECKS) or set(names) != expected_names:
                raise ReleaseContractError(
                    "each synthetic check must occur exactly once in every bucket"
                )
        return ordered

    def _eligible_maintenance(
        self, run: AvailabilityRun
    ) -> tuple[PlannedMaintenance, ...]:
        candidates: list[PlannedMaintenance] = []
        seen_ids: set[str] = set()
        for maintenance in sorted(
            run.planned_maintenance, key=lambda item: (item.started_at, item.maintenance_id)
        ):
            if maintenance.maintenance_id in seen_ids:
                raise ReleaseContractError("maintenance_id must be unique")
            seen_ids.add(maintenance.maintenance_id)
            for name in ("started_at", "ended_at", "announced_at"):
                self._require_aware(getattr(maintenance, name), f"maintenance.{name}")
            duration = maintenance.ended_at - maintenance.started_at
            overlaps_window = (
                maintenance.started_at < run.window_ended_at
                and maintenance.ended_at > run.window_started_at
            )
            if (
                overlaps_window
                and timedelta(0) < duration <= self.MAX_MAINTENANCE_DURATION
                and maintenance.started_at - maintenance.announced_at >= self.MIN_NOTICE
            ):
                candidates.append(maintenance)

        accepted: list[PlannedMaintenance] = []
        monthly_counts: dict[tuple[int, int], int] = defaultdict(int)
        for maintenance in candidates:
            month = (maintenance.started_at.year, maintenance.started_at.month)
            if monthly_counts[month] < self.MAX_MONTHLY_MAINTENANCES:
                accepted.append(maintenance)
                monthly_counts[month] += 1
        return tuple(accepted)

    @staticmethod
    def _validate_ci_results(
        results: tuple[CiTestResult, ...]
    ) -> dict[str, CiTestResult]:
        indexed: dict[str, CiTestResult] = {}
        for result in results:
            if result.test_id in indexed:
                raise ReleaseContractError("CI test_id must be unique")
            indexed[result.test_id] = result
        return indexed

    def _defects_pass(self, defects: tuple[Defect, ...]) -> bool:
        unresolved = [defect for defect in defects if not defect.resolved]
        if any(defect.severity in (DefectSeverity.P0, DefectSeverity.P1) for defect in unresolved):
            return False
        p2_defects = [defect for defect in unresolved if defect.severity is DefectSeverity.P2]
        return len(p2_defects) <= self.MAX_UNRESOLVED_P2 and all(
            bool(defect.owner and defect.owner.strip())
            and bool(defect.workaround and defect.workaround.strip())
            for defect in p2_defects
        )

    @staticmethod
    def _require_aware(value: datetime, label: str) -> None:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ReleaseContractError(f"{label} must be timezone-aware")
