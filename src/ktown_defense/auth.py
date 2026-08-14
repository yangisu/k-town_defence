"""Authentication and role-based access control for the HTTP API.

Authorization is intentionally centralized here so a newly added endpoint must
declare its audience before it can be served.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import re
from typing import FrozenSet, Iterable, Pattern


class OperatorRole(str, Enum):
    REVIEWER = "reviewer"
    PLACE_MANAGER = "place_manager"
    SEASON_ADMIN = "season_admin"
    SUPER_ADMIN = "super_admin"


class Audience(str, Enum):
    PUBLIC = "public"
    MEMBER = "member"
    OPERATOR = "operator"


@dataclass(frozen=True)
class Principal:
    """Identity facts established by the authentication layer.

    ``None`` represents an anonymous request. Member and operator privileges
    are separate: an operator account does not implicitly become a member.
    """

    subject_id: str
    kind: str
    adult_verified: bool = False
    status: str = "active"
    roles: FrozenSet[OperatorRole] = frozenset()

    @classmethod
    def member(
        cls, subject_id: str, *, adult_verified: bool, status: str = "active"
    ) -> "Principal":
        return cls(subject_id, "member", adult_verified, status)

    @classmethod
    def operator(
        cls,
        subject_id: str,
        roles: Iterable[OperatorRole | str],
        *,
        status: str = "active",
    ) -> "Principal":
        return cls(
            subject_id,
            "operator",
            False,
            status,
            frozenset(OperatorRole(role) for role in roles),
        )


@dataclass(frozen=True)
class AuthorizationDecision:
    allowed: bool
    status: int
    code: str | None = None


@dataclass(frozen=True)
class RoutePolicy:
    method: str
    pattern: Pattern[str]
    audience: Audience
    roles: FrozenSet[OperatorRole] = frozenset()

    @classmethod
    def define(
        cls,
        method: str,
        path_template: str,
        audience: Audience,
        roles: Iterable[OperatorRole] = (),
    ) -> "RoutePolicy":
        escaped = re.escape(path_template).replace(r"\{id\}", r"[^/]+")
        escaped = escaped.replace(r"\{placeId\}", r"[^/]+")
        return cls(method, re.compile(f"^{escaped}$"), audience, frozenset(roles))

    def matches(self, method: str, path: str) -> bool:
        return self.method == method.upper() and self.pattern.fullmatch(path) is not None


R = OperatorRole
P = RoutePolicy.define

# The complete AC-01 API surface. Public fandom discovery is included because
# fandoms are explicitly public in the product constraint.
ROUTE_POLICIES: tuple[RoutePolicy, ...] = (
    P("GET", "/api/v1/places", Audience.PUBLIC),
    P("GET", "/api/v1/places/{placeId}", Audience.PUBLIC),
    P("GET", "/api/v1/fandoms", Audience.PUBLIC),
    P("GET", "/api/v1/seasons/current/strongholds", Audience.PUBLIC),
    P("GET", "/api/v1/seasons/current/leaderboards", Audience.PUBLIC),
    P("GET", "/api/v1/me/season-membership", Audience.MEMBER),
    P("PUT", "/api/v1/me/season-membership", Audience.MEMBER),
    P("POST", "/api/v1/checkin-sessions", Audience.MEMBER),
    P("POST", "/api/v1/checkin-sessions/{id}/gps-samples", Audience.MEMBER),
    P("POST", "/api/v1/checkin-sessions/{id}/photo", Audience.MEMBER),
    P("POST", "/api/v1/checkin-sessions/{id}/submit", Audience.MEMBER),
    P("GET", "/api/v1/checkins/{id}", Audience.MEMBER),
    P("POST", "/api/v1/checkins/{id}/appeals", Audience.MEMBER),
    P("GET", "/api/v1/me/ledger", Audience.MEMBER),
    P("GET", "/api/v1/admin/review-tasks/{id}", Audience.OPERATOR, (R.REVIEWER,)),
    P("PATCH", "/api/v1/admin/review-tasks/{id}", Audience.OPERATOR, (R.REVIEWER,)),
    P("GET", "/api/v1/admin/places", Audience.OPERATOR, (R.PLACE_MANAGER,)),
    P("POST", "/api/v1/admin/places", Audience.OPERATOR, (R.PLACE_MANAGER,)),
    P("PATCH", "/api/v1/admin/places/{id}", Audience.OPERATOR, (R.PLACE_MANAGER,)),
    P("POST", "/api/v1/admin/catalog-sync-runs", Audience.OPERATOR, (R.PLACE_MANAGER,)),
    P("POST", "/api/v1/admin/dual-approvals", Audience.OPERATOR, (R.SEASON_ADMIN,)),
    P("POST", "/api/v1/admin/dual-approvals/{id}/approve", Audience.OPERATOR, (R.SEASON_ADMIN,)),
    P("POST", "/api/v1/admin/point-adjustments", Audience.OPERATOR, (R.SEASON_ADMIN,)),
    P("POST", "/api/v1/admin/seasons/{id}/finalize", Audience.OPERATOR, (R.SEASON_ADMIN,)),
    P("POST", "/api/v1/admin/dlq/{id}/retry", Audience.OPERATOR, (R.SUPER_ADMIN,)),
)


def policy_for(method: str, path: str) -> RoutePolicy | None:
    """Return the declared policy, ignoring a query string if present."""

    clean_path = path.partition("?")[0]
    return next(
        (policy for policy in ROUTE_POLICIES if policy.matches(method, clean_path)),
        None,
    )


def authorize(policy: RoutePolicy, principal: Principal | None) -> AuthorizationDecision:
    """Apply the 401/403 contract to a declared route policy."""

    if policy.audience is Audience.PUBLIC:
        return AuthorizationDecision(True, 200)
    if principal is None:
        return AuthorizationDecision(False, 401, "AUTHENTICATION_REQUIRED")

    if policy.audience is Audience.MEMBER:
        if (
            principal.kind != "member"
            or principal.status != "active"
            or not principal.adult_verified
        ):
            return AuthorizationDecision(False, 403, "FORBIDDEN")
        return AuthorizationDecision(True, 200)

    if principal.kind != "operator" or principal.status != "active":
        return AuthorizationDecision(False, 403, "FORBIDDEN")

    # super_admin is the emergency/oversight role and can perform every
    # management operation; other roles are deliberately non-hierarchical.
    has_permission = bool(
        R.SUPER_ADMIN in principal.roles or policy.roles.intersection(principal.roles)
    )
    if not has_permission:
        return AuthorizationDecision(False, 403, "FORBIDDEN")
    return AuthorizationDecision(True, 200)
