"""Two-person approval and immutable operator audit controls."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from hashlib import sha256
from threading import RLock
from typing import Callable, TypeVar
from uuid import uuid4

from .auth import OperatorRole, Principal


T = TypeVar("T")


class GovernanceError(RuntimeError):
    """Stable error raised when an operator governance rule is violated."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code


class ApprovalAction(StrEnum):
    POINT_ADJUSTMENT = "POINT_ADJUSTMENT"
    SEASON_FINALIZATION = "SEASON_FINALIZATION"


class ApprovalStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    EXECUTED = "executed"


@dataclass
class DualApproval:
    dual_approval_id: str
    action_type: ApprovalAction
    subject_id: str
    requester_id: str
    requested_at: datetime
    status: ApprovalStatus = ApprovalStatus.PENDING
    approver_id: str | None = None
    approved_at: datetime | None = None
    executed_at: datetime | None = None


@dataclass(frozen=True)
class AuditLog:
    audit_log_id: str
    actor_id: str
    action: str
    subject_type: str
    subject_id: str
    occurred_at: datetime
    before_hash: str
    after_hash: str


class OperatorGovernanceService:
    """Enforce dual control and keep privacy-safe operator audit records."""

    def __init__(self, *, clock: Callable[[], datetime]) -> None:
        self._clock = clock
        self._approvals: dict[str, DualApproval] = {}
        self._audit_logs: list[AuditLog] = []
        self._lock = RLock()

    @property
    def approvals(self) -> tuple[DualApproval, ...]:
        return tuple(self._approvals.values())

    @property
    def audit_logs(self) -> tuple[AuditLog, ...]:
        return tuple(self._audit_logs)

    def request_approval(
        self,
        action_type: ApprovalAction | str,
        subject_id: str,
        *,
        requester: Principal,
    ) -> DualApproval:
        self._require_role(requester, OperatorRole.SEASON_ADMIN)
        action = ApprovalAction(action_type)
        now = self._now()
        with self._lock:
            approval = DualApproval(
                dual_approval_id=str(uuid4()),
                action_type=action,
                subject_id=subject_id,
                requester_id=requester.subject_id,
                requested_at=now,
            )
            self._approvals[approval.dual_approval_id] = approval
            self._audit(
                requester.subject_id,
                f"{action.value}_REQUESTED",
                action.value.lower(),
                subject_id,
                "absent",
                ApprovalStatus.PENDING,
                now,
            )
            return approval

    def approve(self, dual_approval_id: str, *, approver: Principal) -> DualApproval:
        self._require_role(approver, OperatorRole.SEASON_ADMIN)
        with self._lock:
            approval = self._approval(dual_approval_id)
            if approval.requester_id == approver.subject_id:
                raise GovernanceError(
                    "DISTINCT_APPROVER_REQUIRED",
                    "요청자와 다른 운영자가 승인해야 합니다.",
                )
            if approval.status is not ApprovalStatus.PENDING:
                return approval
            now = self._now()
            approval.approver_id = approver.subject_id
            approval.approved_at = now
            approval.status = ApprovalStatus.APPROVED
            self._audit(
                approver.subject_id,
                f"{approval.action_type.value}_APPROVED",
                approval.action_type.value.lower(),
                approval.subject_id,
                ApprovalStatus.PENDING,
                ApprovalStatus.APPROVED,
                now,
            )
            return approval

    def execute_point_adjustment(
        self, subject_id: str, dual_approval_id: str, operation: Callable[[], T]
    ) -> T:
        return self._execute_approved(
            ApprovalAction.POINT_ADJUSTMENT, subject_id, dual_approval_id, operation
        )

    def execute_season_finalization(
        self, subject_id: str, dual_approval_id: str, operation: Callable[[], T]
    ) -> T:
        return self._execute_approved(
            ApprovalAction.SEASON_FINALIZATION, subject_id, dual_approval_id, operation
        )

    def access_personal_data(
        self, subject_id: str, *, actor: Principal, operation: Callable[[], T]
    ) -> T:
        return self._execute_audited(
            actor,
            (OperatorRole.REVIEWER,),
            "PERSONAL_DATA_ACCESSED",
            "user",
            subject_id,
            operation,
        )

    def download_personal_data(
        self, subject_id: str, *, actor: Principal, operation: Callable[[], T]
    ) -> T:
        return self._execute_audited(
            actor,
            (OperatorRole.REVIEWER,),
            "PERSONAL_DATA_DOWNLOADED",
            "user",
            subject_id,
            operation,
        )

    def change_rights(
        self, subject_id: str, *, actor: Principal, operation: Callable[[], T]
    ) -> T:
        return self._execute_audited(
            actor,
            (OperatorRole.PLACE_MANAGER,),
            "RIGHTS_CHANGED",
            "rights_record",
            subject_id,
            operation,
        )

    def retry_dlq(
        self, subject_id: str, *, actor: Principal, operation: Callable[[], T]
    ) -> T:
        return self._execute_audited(
            actor,
            (OperatorRole.SUPER_ADMIN,),
            "DLQ_RETRIED",
            "dlq_item",
            subject_id,
            operation,
        )

    def _execute_approved(
        self,
        action: ApprovalAction,
        subject_id: str,
        dual_approval_id: str,
        operation: Callable[[], T],
    ) -> T:
        with self._lock:
            approval = self._approvals.get(dual_approval_id)
            if (
                approval is None
                or approval.action_type is not action
                or approval.subject_id != subject_id
                or approval.status is not ApprovalStatus.APPROVED
                or approval.approver_id is None
                or approval.approver_id == approval.requester_id
            ):
                raise GovernanceError(
                    "DUAL_APPROVAL_REQUIRED", "유효한 2인 승인이 필요합니다."
                )
            result = operation()
            now = self._now()
            approval.status = ApprovalStatus.EXECUTED
            approval.executed_at = now
            self._audit(
                approval.approver_id,
                f"{action.value}_EXECUTED",
                action.value.lower(),
                subject_id,
                ApprovalStatus.APPROVED,
                ApprovalStatus.EXECUTED,
                now,
            )
            return result

    def _execute_audited(
        self,
        actor: Principal,
        roles: tuple[OperatorRole, ...],
        action: str,
        subject_type: str,
        subject_id: str,
        operation: Callable[[], T],
    ) -> T:
        self._require_any_role(actor, roles)
        with self._lock:
            result = operation()
            self._audit(
                actor.subject_id,
                action,
                subject_type,
                subject_id,
                "not_executed",
                "executed",
                self._now(),
            )
            return result

    def _approval(self, dual_approval_id: str) -> DualApproval:
        try:
            return self._approvals[dual_approval_id]
        except KeyError as exc:
            raise GovernanceError(
                "DUAL_APPROVAL_NOT_FOUND", "2인 승인 요청을 찾을 수 없습니다."
            ) from exc

    @staticmethod
    def _require_role(actor: Principal, role: OperatorRole) -> None:
        OperatorGovernanceService._require_any_role(actor, (role,))

    @staticmethod
    def _require_any_role(
        actor: Principal, allowed_roles: tuple[OperatorRole, ...]
    ) -> None:
        allowed = bool(
            actor.kind == "operator"
            and actor.status == "active"
            and (
                OperatorRole.SUPER_ADMIN in actor.roles
                or actor.roles.intersection(allowed_roles)
            )
        )
        if not allowed:
            raise GovernanceError("FORBIDDEN", "이 작업을 수행할 권한이 없습니다.")

    def _audit(
        self,
        actor_id: str,
        action: str,
        subject_type: str,
        subject_id: str,
        before: object,
        after: object,
        occurred_at: datetime,
    ) -> None:
        self._audit_logs.append(
            AuditLog(
                audit_log_id=str(uuid4()),
                actor_id=actor_id,
                action=action,
                subject_type=subject_type,
                subject_id=subject_id,
                occurred_at=occurred_at,
                before_hash=self._state_hash(before),
                after_hash=self._state_hash(after),
            )
        )

    @staticmethod
    def _state_hash(value: object) -> str:
        return sha256(str(value).encode("utf-8")).hexdigest()

    def _now(self) -> datetime:
        now = self._clock()
        if now.tzinfo is None or now.utcoffset() is None:
            raise ValueError("server clock must return a timezone-aware datetime")
        return now
