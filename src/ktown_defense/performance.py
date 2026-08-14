"""Version-pinned load and SLI evaluation for the MVP measurement contract."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from math import ceil
from typing import Iterable


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


class MeasurementContractError(ValueError):
    """Raised when a run cannot be compared with the fixed contract."""


@dataclass(frozen=True)
class ApiTiming:
    endpoint: str
    received_at: datetime
    completed_at: datetime
    status_code: int


@dataclass(frozen=True)
class PhotoTiming:
    request_id: str
    bytes_received_at: datetime
    completed_at: datetime
    successful: bool


@dataclass(frozen=True)
class EventTiming:
    event_key: str
    approved_processing_at: datetime
    ledger_committed_at: datetime | None
    stronghold_projected_at: datetime | None
    leaderboard_projected_at: datetime | None
    first_failed_at: datetime | None = None
    applied_at: datetime | None = None
    injected_failure_stage: str | None = None


@dataclass(frozen=True)
class PerformanceRun:
    """Raw observations from one fixed-version, fixed-load staging run."""

    contract_version: str
    random_seed: int
    arrival_model: str
    requests_per_second: int
    concurrent_users: int
    traffic_mix_percent: tuple[int, ...]
    photo_distribution_percent: tuple[int, ...]
    run_started_at: datetime
    observed_from: datetime
    observed_until: datetime
    api_timings: tuple[ApiTiming, ...]
    photo_timings: tuple[PhotoTiming, ...]
    event_timings: tuple[EventTiming, ...]


@dataclass(frozen=True)
class PerformanceReport:
    contract_version: str
    latency_seconds: dict[str, float]
    reliability_rates: dict[str, float]
    denominators: dict[str, int]
    targets: dict[str, bool]

    @property
    def passed(self) -> bool:
        return all(self.targets.values())


class PerformanceContractEvaluator:
    """Evaluate every latency and reliability target from one denominator set."""

    CONTRACT_VERSION = "ktown-defense.seed.ouroboros-0.51.2"
    RANDOM_SEED = 20260812
    ARRIVAL_MODEL = "seeded Poisson arrivals"
    REQUESTS_PER_SECOND = 20
    CONCURRENT_USERS = 100
    TRAFFIC_MIX_PERCENT = (30, 15, 10, 10, 10, 10, 15)
    PHOTO_DISTRIBUTION_PERCENT = (50, 40, 10)
    WARMUP = timedelta(minutes=5)
    OBSERVATION = timedelta(minutes=30)

    def evaluate(self, run: PerformanceRun) -> PerformanceReport:
        self._validate_run_contract(run)
        events = self._unique_events(run.event_timings)

        api_latencies: dict[str, float] = {}
        for endpoint in CORE_ENDPOINTS:
            successful = [
                self._duration(timing.received_at, timing.completed_at)
                for timing in run.api_timings
                if timing.endpoint == endpoint
                and 200 <= timing.status_code < 300
                and self._in_window(timing.received_at, run)
            ]
            self._require_minimum(successful, 100, f"successful samples for {endpoint}")
            api_latencies[endpoint] = self._p95(successful)

        successful_photos = [
            self._duration(timing.bytes_received_at, timing.completed_at)
            for timing in run.photo_timings
            if timing.successful and self._in_window(timing.bytes_received_at, run)
        ]
        self._require_minimum(successful_photos, 1, "successful photo samples")

        approval_events = [
            event for event in events if self._in_window(event.approved_processing_at, run)
        ]
        self._require_minimum(approval_events, 1_000, "unique approval events")
        approval_successes = [event for event in approval_events if event.ledger_committed_at is not None]
        self._require_minimum(approval_successes, 1, "successful approval events")
        approval_latencies = [
            self._duration(event.approved_processing_at, event.ledger_committed_at)
            for event in approval_successes
            if event.ledger_committed_at is not None
        ]

        ledger_events = [
            event
            for event in events
            if event.ledger_committed_at is not None
            and self._in_window(event.ledger_committed_at, run)
        ]
        self._require_minimum(ledger_events, 1_000, "unique ledger events")
        projection_successes = [
            event
            for event in ledger_events
            if event.stronghold_projected_at is not None
            and event.leaderboard_projected_at is not None
        ]
        self._require_minimum(projection_successes, 1, "successful projection events")
        projection_latencies = [
            max(
                self._duration(event.ledger_committed_at, event.stronghold_projected_at),
                self._duration(event.ledger_committed_at, event.leaderboard_projected_at),
            )
            for event in projection_successes
            if event.ledger_committed_at is not None
            and event.stronghold_projected_at is not None
            and event.leaderboard_projected_at is not None
        ]

        injected_failures = [
            event for event in approval_events if event.injected_failure_stage is not None
        ]
        self._validate_failure_injection(approval_events, injected_failures)

        latency_seconds = {
            **api_latencies,
            "photo_upload_to_submit": self._p95(successful_photos),
            "approval_to_ledger": self._p95(approval_latencies),
            "ledger_to_projections": self._p95(projection_latencies),
        }
        reliability_rates = {
            "approval_ledger_within_3s": self._rate(
                approval_events,
                lambda event: event.ledger_committed_at is not None
                and self._duration(event.approved_processing_at, event.ledger_committed_at) <= 3,
            ),
            "both_projections_within_30s": self._rate(
                ledger_events,
                lambda event: event.stronghold_projected_at is not None
                and event.leaderboard_projected_at is not None
                and max(
                    self._duration(event.ledger_committed_at, event.stronghold_projected_at),
                    self._duration(event.ledger_committed_at, event.leaderboard_projected_at),
                ) <= 30,
            ),
            "failed_event_recovery_within_5m": self._rate(
                injected_failures,
                lambda event: event.first_failed_at is not None
                and event.applied_at is not None
                and event.applied_at <= event.first_failed_at + timedelta(minutes=5),
            ),
        }
        targets = {
            "core_api_latency": all(api_latencies[endpoint] <= 1 for endpoint in CORE_ENDPOINTS),
            "photo_latency": latency_seconds["photo_upload_to_submit"] <= 2,
            "approval_ledger_latency": latency_seconds["approval_to_ledger"] <= 3,
            "projection_latency": latency_seconds["ledger_to_projections"] <= 30,
            "approval_ledger_reliability": reliability_rates["approval_ledger_within_3s"] >= 0.995,
            "projection_reliability": reliability_rates["both_projections_within_30s"] >= 0.99,
            "recovery_reliability": reliability_rates["failed_event_recovery_within_5m"] >= 0.999,
        }
        denominators = {
            "approval_events": len(approval_events),
            "ledger_events": len(ledger_events),
            "injected_failure_events": len(injected_failures),
        }
        return PerformanceReport(
            contract_version=run.contract_version,
            latency_seconds=latency_seconds,
            reliability_rates=reliability_rates,
            denominators=denominators,
            targets=targets,
        )

    def _validate_run_contract(self, run: PerformanceRun) -> None:
        expected = {
            "contract_version": self.CONTRACT_VERSION,
            "random_seed": self.RANDOM_SEED,
            "arrival_model": self.ARRIVAL_MODEL,
            "requests_per_second": self.REQUESTS_PER_SECOND,
            "concurrent_users": self.CONCURRENT_USERS,
            "traffic_mix_percent": self.TRAFFIC_MIX_PERCENT,
            "photo_distribution_percent": self.PHOTO_DISTRIBUTION_PERCENT,
        }
        for name, value in expected.items():
            if getattr(run, name) != value:
                raise MeasurementContractError(f"{name} does not match the measurement contract")
        for name in ("run_started_at", "observed_from", "observed_until"):
            value = getattr(run, name)
            if value.tzinfo is None or value.utcoffset() is None:
                raise MeasurementContractError(f"{name} must be timezone-aware")
        if run.observed_from - run.run_started_at != self.WARMUP:
            raise MeasurementContractError("the run must have exactly five minutes of warmup")
        if run.observed_until - run.observed_from != self.OBSERVATION:
            raise MeasurementContractError("the observation window must be exactly thirty minutes")

    def _validate_failure_injection(
        self,
        approval_events: list[EventTiming],
        injected_failures: list[EventTiming],
    ) -> None:
        self._require_minimum(injected_failures, 1_000, "injected failure events")
        if len(injected_failures) * 10 != len(approval_events):
            raise MeasurementContractError("failure injection must be exactly 10% of approvals")
        per_stage = len(injected_failures) // 4
        if len(injected_failures) % 4:
            raise MeasurementContractError("failure events cannot be divided equally across four stages")
        counts = {
            stage: sum(event.injected_failure_stage == stage for event in injected_failures)
            for stage in FAILURE_STAGES
        }
        if any(count != per_stage for count in counts.values()):
            raise MeasurementContractError("each injection stage must have exactly 25% of failures")
        if any(event.first_failed_at is None for event in injected_failures):
            raise MeasurementContractError("injected failures require a first_failed_at timestamp")

    @staticmethod
    def _unique_events(events: Iterable[EventTiming]) -> list[EventTiming]:
        unique: dict[str, EventTiming] = {}
        for event in events:
            if event.event_key in unique:
                raise MeasurementContractError(f"duplicate event_key: {event.event_key}")
            unique[event.event_key] = event
        return list(unique.values())

    @staticmethod
    def _duration(start: datetime | None, end: datetime | None) -> float:
        if start is None or end is None:
            raise MeasurementContractError("latency endpoints require both timestamps")
        if start.tzinfo is None or end.tzinfo is None or start.utcoffset() is None or end.utcoffset() is None:
            raise MeasurementContractError("timing timestamps must be timezone-aware")
        duration = (end - start).total_seconds()
        if duration < 0:
            raise MeasurementContractError("completion timestamp cannot precede its start")
        return duration

    @staticmethod
    def _in_window(timestamp: datetime, run: PerformanceRun) -> bool:
        return run.observed_from <= timestamp < run.observed_until

    @staticmethod
    def _require_minimum(values: object, minimum: int, label: str) -> None:
        if len(values) < minimum:  # type: ignore[arg-type]
            raise MeasurementContractError(f"{label} requires at least {minimum} samples")

    @staticmethod
    def _p95(values: list[float]) -> float:
        ordered = sorted(values)
        return ordered[ceil(0.95 * len(ordered)) - 1]

    @staticmethod
    def _rate(values: list[EventTiming], predicate: object) -> float:
        if not values:
            raise MeasurementContractError("a reliability denominator cannot be zero")
        return sum(predicate(value) for value in values) / len(values)  # type: ignore[operator]
