"""Rights deletion and production release safeguards."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Iterable, Protocol
from uuid import uuid4

from .catalog import Artist


class RightsCatalog(Protocol):
    @property
    def artists(self) -> dict[str, Artist]: ...

    def hide_subject(self, subject_type: str, subject_id: str) -> None: ...


@dataclass(frozen=True)
class RightsDeletionRequest:
    rights_deletion_request_id: str
    requester_reference: str
    received_at: datetime
    public_hidden_at: datetime
    status: str
    artist_id: str | None = None
    place_id: str | None = None
    handled_by: str | None = None
    resolved_at: datetime | None = None


@dataclass(frozen=True)
class ReleaseGate:
    release_gate_id: str
    gate_type: str
    status: str
    approver_id: str | None
    evidence_uri: str
    approved_at: datetime | None
    expires_at: datetime | None
    artist_id: str | None = None


@dataclass(frozen=True)
class ReleaseDecision:
    allowed: bool
    blockers: tuple[str, ...]


class ReleaseBlockedError(RuntimeError):
    def __init__(self, blockers: tuple[str, ...]) -> None:
        super().__init__("production release blocked: " + ", ".join(blockers))
        self.blockers = blockers


class RightsGovernanceService:
    """Commits a deletion request and visibility revocation as one operation."""

    def __init__(
        self, catalog: RightsCatalog, *, clock: Callable[[], datetime] | None = None
    ) -> None:
        self.catalog = catalog
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._deletion_requests: list[RightsDeletionRequest] = []

    @property
    def deletion_requests(self) -> tuple[RightsDeletionRequest, ...]:
        return tuple(self._deletion_requests)

    def register_deletion_request(
        self, *, subject_type: str, subject_id: str, requester_reference: str
    ) -> RightsDeletionRequest:
        if not requester_reference.strip():
            raise ValueError("requester_reference is required")
        if subject_type not in {"artist", "place"}:
            raise ValueError("subject_type must be artist or place")

        committed_at = self._clock()
        request = RightsDeletionRequest(
            rights_deletion_request_id=str(uuid4()),
            requester_reference=requester_reference,
            received_at=committed_at,
            public_hidden_at=committed_at,
            status="received",
            artist_id=subject_id if subject_type == "artist" else None,
            place_id=subject_id if subject_type == "place" else None,
        )
        self.catalog.hide_subject(subject_type, subject_id)
        self._deletion_requests.append(request)
        return request


class ProductionReleasePolicy:
    """Fail-closed production gate for legal, privacy, and artist rights."""

    REQUIRED_GLOBAL_GATES = ("legal", "privacy")

    def __init__(
        self,
        catalog: RightsCatalog,
        gates: Iterable[ReleaseGate],
        *,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.catalog = catalog
        self.gates = tuple(gates)
        self._clock = clock or (lambda: datetime.now(timezone.utc))

    @staticmethod
    def _gate_is_valid(gate: ReleaseGate, now: datetime) -> bool:
        return bool(
            gate.status == "approved"
            and gate.approver_id
            and gate.evidence_uri
            and gate.approved_at is not None
            and gate.approved_at <= now
            and (gate.expires_at is None or gate.expires_at > now)
        )

    def evaluate(self, environment: str) -> ReleaseDecision:
        if environment != "production":
            return ReleaseDecision(True, ())

        now = self._clock()
        blockers: list[str] = []
        for gate_type in self.REQUIRED_GLOBAL_GATES:
            if not any(
                gate.gate_type == gate_type
                and gate.artist_id is None
                and self._gate_is_valid(gate, now)
                for gate in self.gates
            ):
                blockers.append(f"MISSING_OR_INVALID_{gate_type.upper()}_GATE")

        for artist in sorted(self.catalog.artists.values(), key=lambda item: item.artist_id):
            if not artist.public_visible:
                continue
            rights_valid = (
                artist.rights_status == "approved"
                and (artist.rights_expires_at is None or artist.rights_expires_at > now)
            )
            if not rights_valid:
                blockers.append(f"INVALID_ARTIST_RIGHTS:{artist.artist_id}")
                continue
            if not any(
                gate.gate_type == "artist_rights"
                and gate.artist_id == artist.artist_id
                and self._gate_is_valid(gate, now)
                for gate in self.gates
            ):
                blockers.append(f"MISSING_OR_INVALID_ARTIST_RIGHTS_GATE:{artist.artist_id}")

        return ReleaseDecision(not blockers, tuple(blockers))

    def assert_deployable(self, environment: str = "production") -> None:
        decision = self.evaluate(environment)
        if not decision.allowed:
            raise ReleaseBlockedError(decision.blockers)
