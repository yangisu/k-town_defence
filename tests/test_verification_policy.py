from __future__ import annotations

from dataclasses import replace
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from ktown_defense.verification import (
    POLICY_VERSION,
    DecisionStatus,
    VerificationEvidence,
    VerificationPolicy,
    VerificationSample,
    classify_verification,
)


def sample(kind: str, *, accuracy: float = 50, distance: float = 50, speed=None):
    return VerificationSample(kind, accuracy, distance, speed)


def approved_boundary_evidence() -> VerificationEvidence:
    return VerificationEvidence(
        samples=(
            sample("start"),
            sample("middle", speed=200),
            sample("end", speed=200),
        ),
        active_dwell_seconds=300,
    )


class VerificationPolicyVectorTests(unittest.TestCase):
    def test_all_automatic_approval_boundaries_are_inclusive(self) -> None:
        decision = classify_verification(VerificationPolicy(radius_m=100), approved_boundary_evidence())

        self.assertEqual(DecisionStatus.APPROVED, decision.status)
        self.assertEqual((), decision.risk_codes)
        self.assertEqual(POLICY_VERSION, decision.policy_version)

    def test_each_defined_risk_vector_requires_review(self) -> None:
        base_policy = VerificationPolicy()
        base = approved_boundary_evidence()
        vectors = (
            (
                "BOUNDARY_OVERLAP",
                base_policy,
                replace(base, samples=(sample("start", distance=51), sample("middle"), sample("end"))),
            ),
            (
                "LOW_ACCURACY",
                base_policy,
                replace(base, samples=(sample("start", accuracy=50.01, distance=0), sample("middle"), sample("end"))),
            ),
            ("DUPLICATE_MEDIA", base_policy, replace(base, duplicate_media=True)),
            (
                "PHOTO_TARGET_REVIEW",
                replace(base_policy, photo_verification_mode="manual_target"),
                base,
            ),
            ("GPS_WEAK_PLACE", replace(base_policy, gps_weak=True), base),
            (
                "ABNORMAL_ROUTE",
                base_policy,
                replace(base, samples=(sample("start"), sample("middle", speed=200.01), sample("end"))),
            ),
            ("MULTI_ACCOUNT_SUSPECTED", base_policy, replace(base, multi_account_suspected=True)),
        )

        for expected_risk, policy, evidence in vectors:
            with self.subTest(expected_risk):
                decision = classify_verification(policy, evidence)
                self.assertEqual(DecisionStatus.REVIEW_REQUIRED, decision.status)
                self.assertEqual((expected_risk,), decision.risk_codes)
                self.assertEqual(POLICY_VERSION, decision.policy_version)

    def test_risk_codes_have_stable_contract_order(self) -> None:
        evidence = replace(
            approved_boundary_evidence(),
            samples=(
                sample("start", accuracy=75, distance=50),
                sample("middle", speed=201),
                sample("end"),
            ),
            duplicate_media=True,
            multi_account_suspected=True,
        )
        policy = VerificationPolicy(photo_verification_mode="manual_target", gps_weak=True)

        decision = classify_verification(policy, evidence)

        self.assertEqual(
            (
                "BOUNDARY_OVERLAP",
                "LOW_ACCURACY",
                "DUPLICATE_MEDIA",
                "PHOTO_TARGET_REVIEW",
                "GPS_WEAK_PLACE",
                "ABNORMAL_ROUTE",
                "MULTI_ACCOUNT_SUSPECTED",
            ),
            decision.risk_codes,
        )

    def test_missing_conditions_reject_before_risk_classification(self) -> None:
        incomplete = VerificationEvidence(
            samples=(sample("start"), sample("middle", accuracy=100.01)),
            active_dwell_seconds=299.99,
            image_decoded=False,
            captured_in_active_session=False,
            duplicate_media=True,
        )

        decision = classify_verification(VerificationPolicy(), incomplete)

        self.assertEqual(DecisionStatus.REJECTED, decision.status)
        self.assertEqual((), decision.risk_codes)
        self.assertEqual(
            (
                "GPS_SAMPLES_INCOMPLETE",
                "DWELL_TOO_SHORT",
                "IMAGE_DECODE_FAILED",
                "SESSION_CAMERA_REQUIRED",
            ),
            decision.rejection_codes,
        )

    def test_outside_is_rejected_but_geofence_equality_is_inside(self) -> None:
        boundary = approved_boundary_evidence()
        outside = replace(
            boundary,
            samples=(sample("start", accuracy=10, distance=110.01), sample("middle"), sample("end")),
        )

        self.assertEqual(
            DecisionStatus.REJECTED,
            classify_verification(VerificationPolicy(), outside).status,
        )
        self.assertEqual(
            DecisionStatus.APPROVED,
            classify_verification(VerificationPolicy(), boundary).status,
        )

    def test_policy_rejects_radius_and_photo_mode_outside_contract(self) -> None:
        for radius in (49.99, 200.01):
            with self.subTest(radius=radius), self.assertRaises(ValueError):
                VerificationPolicy(radius_m=radius)
        with self.assertRaises(ValueError):
            VerificationPolicy(photo_verification_mode="ai_target_recognition")


if __name__ == "__main__":
    unittest.main()
