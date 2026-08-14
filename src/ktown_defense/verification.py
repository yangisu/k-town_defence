"""Versioned, deterministic check-in verification policy."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Final, Iterable


POLICY_VERSION: Final = "verification-policy-v1"
REQUIRED_SAMPLE_KINDS: Final = ("start", "middle", "end")
RISK_CODE_ORDER: Final = (
    "BOUNDARY_OVERLAP",
    "LOW_ACCURACY",
    "DUPLICATE_MEDIA",
    "PHOTO_TARGET_REVIEW",
    "GPS_WEAK_PLACE",
    "ABNORMAL_ROUTE",
    "MULTI_ACCOUNT_SUSPECTED",
)


class DecisionStatus(StrEnum):
    APPROVED = "approved"
    REVIEW_REQUIRED = "review_required"
    REJECTED = "rejected"


@dataclass(frozen=True)
class VerificationPolicy:
    """The policy snapshot attached to a check-in session."""

    radius_m: float = 100.0
    min_dwell_seconds: float = 300.0
    photo_verification_mode: str = "capture_only"
    gps_weak: bool = False
    version: str = POLICY_VERSION

    def __post_init__(self) -> None:
        if not 50 <= self.radius_m <= 200:
            raise ValueError("radius_m must be between 50 and 200")
        if self.photo_verification_mode not in {"capture_only", "manual_target"}:
            raise ValueError("unsupported photo_verification_mode")


@dataclass(frozen=True)
class VerificationSample:
    """A server-derived GPS sample used by the policy classifier.

    ``distance_m`` is the great-circle distance to the place centre and
    ``speed_from_previous_kmh`` is calculated from the preceding valid sample.
    """

    sample_kind: str
    accuracy_m: float
    distance_m: float
    speed_from_previous_kmh: float | None = None


@dataclass(frozen=True)
class VerificationEvidence:
    samples: tuple[VerificationSample, ...]
    active_dwell_seconds: float
    image_decoded: bool = True
    captured_in_active_session: bool = True
    duplicate_media: bool = False
    multi_account_suspected: bool = False


@dataclass(frozen=True)
class VerificationDecision:
    status: DecisionStatus
    risk_codes: tuple[str, ...]
    policy_version: str
    rejection_codes: tuple[str, ...] = ()


def classify_verification(
    policy: VerificationPolicy,
    evidence: VerificationEvidence,
) -> VerificationDecision:
    """Classify evidence in the contract's fixed reject/risk/approve order."""

    valid_samples = tuple(sample for sample in evidence.samples if sample.accuracy_m <= 100)
    rejection_codes = _required_condition_failures(policy, evidence, valid_samples)
    if rejection_codes:
        return VerificationDecision(
            DecisionStatus.REJECTED,
            (),
            policy.version,
            rejection_codes,
        )

    risks: set[str] = set()
    for sample in valid_samples:
        if sample.distance_m + sample.accuracy_m <= policy.radius_m:
            pass
        elif sample.distance_m - sample.accuracy_m > policy.radius_m:
            # Outside samples were rejected in the required-condition pass.
            pass
        else:
            risks.add("BOUNDARY_OVERLAP")
        if sample.accuracy_m > 50:
            risks.add("LOW_ACCURACY")
        if (
            sample.speed_from_previous_kmh is not None
            and sample.speed_from_previous_kmh > 200
        ):
            risks.add("ABNORMAL_ROUTE")

    if evidence.duplicate_media:
        risks.add("DUPLICATE_MEDIA")
    if policy.photo_verification_mode == "manual_target":
        risks.add("PHOTO_TARGET_REVIEW")
    if policy.gps_weak:
        risks.add("GPS_WEAK_PLACE")
    if evidence.multi_account_suspected:
        risks.add("MULTI_ACCOUNT_SUSPECTED")

    ordered_risks = tuple(code for code in RISK_CODE_ORDER if code in risks)
    status = DecisionStatus.REVIEW_REQUIRED if ordered_risks else DecisionStatus.APPROVED
    return VerificationDecision(status, ordered_risks, policy.version)


def _required_condition_failures(
    policy: VerificationPolicy,
    evidence: VerificationEvidence,
    valid_samples: Iterable[VerificationSample],
) -> tuple[str, ...]:
    samples = tuple(valid_samples)
    failures: list[str] = []
    available_kinds = {sample.sample_kind for sample in samples}
    if not set(REQUIRED_SAMPLE_KINDS) <= available_kinds:
        failures.append("GPS_SAMPLES_INCOMPLETE")
    if any(sample.distance_m - sample.accuracy_m > policy.radius_m for sample in samples):
        failures.append("OUTSIDE_GEOFENCE")
    if evidence.active_dwell_seconds < policy.min_dwell_seconds:
        failures.append("DWELL_TOO_SHORT")
    if not evidence.image_decoded:
        failures.append("IMAGE_DECODE_FAILED")
    if not evidence.captured_in_active_session:
        failures.append("SESSION_CAMERA_REQUIRED")
    return tuple(failures)
