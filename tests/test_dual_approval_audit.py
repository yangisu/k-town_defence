from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ktown_defense.auth import OperatorRole, Principal
from ktown_defense.governance import (
    ApprovalAction,
    ApprovalStatus,
    GovernanceError,
    OperatorGovernanceService,
)


NOW = datetime(2026, 8, 12, 3, 0, tzinfo=timezone.utc)


class DualApprovalAuditTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = OperatorGovernanceService(clock=lambda: NOW)
        self.requester = Principal.operator("operator-1", [OperatorRole.SEASON_ADMIN])
        self.approver = Principal.operator("operator-2", [OperatorRole.SEASON_ADMIN])

    def test_point_adjustment_requires_approved_request_from_distinct_operator(self) -> None:
        applied: list[int] = []
        approval = self.service.request_approval(
            ApprovalAction.POINT_ADJUSTMENT,
            "adjustment-1",
            requester=self.requester,
        )

        with self.assertRaisesRegex(GovernanceError, "DUAL_APPROVAL_REQUIRED"):
            self.service.execute_point_adjustment(
                "adjustment-1", approval.dual_approval_id, lambda: applied.append(100)
            )
        with self.assertRaisesRegex(GovernanceError, "DISTINCT_APPROVER_REQUIRED"):
            self.service.approve(approval.dual_approval_id, approver=self.requester)
        self.assertEqual([], applied)

        approved = self.service.approve(
            approval.dual_approval_id, approver=self.approver
        )
        result = self.service.execute_point_adjustment(
            "adjustment-1", approved.dual_approval_id, lambda: applied.append(100) or "ok"
        )

        self.assertEqual(ApprovalStatus.EXECUTED, approved.status)
        self.assertEqual("ok", result)
        self.assertEqual([100], applied)
        self.assertEqual(
            [
                "POINT_ADJUSTMENT_REQUESTED",
                "POINT_ADJUSTMENT_APPROVED",
                "POINT_ADJUSTMENT_EXECUTED",
            ],
            [entry.action for entry in self.service.audit_logs],
        )

    def test_season_finalization_rejects_missing_or_wrong_subject_approval(self) -> None:
        finalized: list[str] = []
        approval = self.service.request_approval(
            ApprovalAction.SEASON_FINALIZATION,
            "season-1",
            requester=self.requester,
        )
        self.service.approve(approval.dual_approval_id, approver=self.approver)

        with self.assertRaisesRegex(GovernanceError, "DUAL_APPROVAL_REQUIRED"):
            self.service.execute_season_finalization(
                "season-2", approval.dual_approval_id, lambda: finalized.append("season-2")
            )
        with self.assertRaisesRegex(GovernanceError, "DUAL_APPROVAL_REQUIRED"):
            self.service.execute_season_finalization(
                "season-1", "missing-approval", lambda: finalized.append("season-1")
            )
        self.assertEqual([], finalized)

        self.service.execute_season_finalization(
            "season-1", approval.dual_approval_id, lambda: finalized.append("season-1")
        )
        self.assertEqual(["season-1"], finalized)

    def test_sensitive_operations_are_role_limited_and_all_audited(self) -> None:
        reviewer = Principal.operator("reviewer", [OperatorRole.REVIEWER])
        place_manager = Principal.operator(
            "place-manager", [OperatorRole.PLACE_MANAGER]
        )
        super_admin = Principal.operator("super-admin", [OperatorRole.SUPER_ADMIN])
        operations: list[str] = []

        self.assertEqual(
            {"name": "비공개 사용자"},
            self.service.access_personal_data(
                "user-1", actor=reviewer, operation=lambda: {"name": "비공개 사용자"}
            ),
        )
        self.service.download_personal_data(
            "user-1", actor=reviewer, operation=lambda: operations.append("download")
        )
        self.service.change_rights(
            "artist-1", actor=place_manager, operation=lambda: operations.append("rights")
        )
        self.service.retry_dlq(
            "dlq-1", actor=super_admin, operation=lambda: operations.append("dlq")
        )

        self.assertEqual(["download", "rights", "dlq"], operations)
        self.assertEqual(
            [
                "PERSONAL_DATA_ACCESSED",
                "PERSONAL_DATA_DOWNLOADED",
                "RIGHTS_CHANGED",
                "DLQ_RETRIED",
            ],
            [entry.action for entry in self.service.audit_logs],
        )
        self.assertEqual(
            ["user-1", "user-1", "artist-1", "dlq-1"],
            [entry.subject_id for entry in self.service.audit_logs],
        )
        self.assertTrue(all(entry.occurred_at == NOW for entry in self.service.audit_logs))

    def test_unauthorized_sensitive_operation_neither_executes_nor_claims_success(self) -> None:
        reviewer = Principal.operator("reviewer", [OperatorRole.REVIEWER])
        called: list[bool] = []

        with self.assertRaisesRegex(GovernanceError, "FORBIDDEN"):
            self.service.retry_dlq(
                "dlq-1", actor=reviewer, operation=lambda: called.append(True)
            )

        self.assertEqual([], called)
        self.assertEqual((), self.service.audit_logs)


if __name__ == "__main__":
    unittest.main()
