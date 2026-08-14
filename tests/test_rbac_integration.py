from __future__ import annotations

import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from ktown_defense import KTownDefenseApp, Principal
from ktown_defense.auth import Audience, OperatorRole, ROUTE_POLICIES


PUBLIC_ROUTES = (
    ("GET", "/api/v1/places"),
    ("GET", "/api/v1/places/resource-id"),
    ("GET", "/api/v1/fandoms"),
    ("GET", "/api/v1/seasons/current/strongholds"),
    ("GET", "/api/v1/seasons/current/leaderboards"),
)

MEMBER_ROUTES = (
    ("GET", "/api/v1/me/season-membership"),
    ("PUT", "/api/v1/me/season-membership"),
    ("POST", "/api/v1/checkin-sessions"),
    ("POST", "/api/v1/checkin-sessions/resource-id/gps-samples"),
    ("POST", "/api/v1/checkin-sessions/resource-id/photo"),
    ("POST", "/api/v1/checkin-sessions/resource-id/submit"),
    ("GET", "/api/v1/checkins/resource-id"),
    ("POST", "/api/v1/checkins/resource-id/appeals"),
    ("GET", "/api/v1/me/ledger"),
)

OPERATOR_ROUTES = {
    ("GET", "/api/v1/admin/review-tasks/resource-id"): OperatorRole.REVIEWER,
    ("PATCH", "/api/v1/admin/review-tasks/resource-id"): OperatorRole.REVIEWER,
    ("GET", "/api/v1/admin/places"): OperatorRole.PLACE_MANAGER,
    ("POST", "/api/v1/admin/places"): OperatorRole.PLACE_MANAGER,
    ("PATCH", "/api/v1/admin/places/resource-id"): OperatorRole.PLACE_MANAGER,
    ("POST", "/api/v1/admin/catalog-sync-runs"): OperatorRole.PLACE_MANAGER,
    ("POST", "/api/v1/admin/dual-approvals"): OperatorRole.SEASON_ADMIN,
    ("POST", "/api/v1/admin/dual-approvals/resource-id/approve"): OperatorRole.SEASON_ADMIN,
    ("POST", "/api/v1/admin/point-adjustments"): OperatorRole.SEASON_ADMIN,
    ("POST", "/api/v1/admin/seasons/resource-id/finalize"): OperatorRole.SEASON_ADMIN,
    ("POST", "/api/v1/admin/dlq/resource-id/retry"): OperatorRole.SUPER_ADMIN,
}


class RbacIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = KTownDefenseApp()
        self.adult = Principal.member("adult", adult_verified=True)
        self.minor = Principal.member("minor", adult_verified=False)
        self.suspended = Principal.member(
            "suspended", adult_verified=True, status="suspended"
        )

    def request(self, policy, principal=None):
        path = policy.pattern.pattern.removeprefix("^").removesuffix("$")
        path = path.replace("[^/]+", "resource-id").replace("\\", "")
        return self.app.request(policy.method, path, principal)

    def test_declared_route_policies_match_the_independent_access_matrix(self) -> None:
        declared = {
            (policy.method, self.representative_path(policy)): (
                policy.audience,
                policy.roles,
            )
            for policy in ROUTE_POLICIES
        }
        expected = {
            **{route: (Audience.PUBLIC, frozenset()) for route in PUBLIC_ROUTES},
            **{route: (Audience.MEMBER, frozenset()) for route in MEMBER_ROUTES},
            **{
                route: (Audience.OPERATOR, frozenset((role,)))
                for route, role in OPERATOR_ROUTES.items()
            },
        }
        self.assertEqual(expected, declared)

    @staticmethod
    def representative_path(policy):
        path = policy.pattern.pattern.removeprefix("^").removesuffix("$")
        return path.replace("[^/]+", "resource-id").replace("\\", "")

    def test_guests_can_only_use_public_discovery(self) -> None:
        for policy in ROUTE_POLICIES:
            with self.subTest(method=policy.method, route=policy.pattern.pattern):
                response = self.request(policy)
                if policy.audience is Audience.PUBLIC:
                    self.assertEqual(200, response.status)
                else:
                    self.assertEqual(401, response.status)
                    self.assertEqual("AUTHENTICATION_REQUIRED", response.body["code"])

    def test_only_active_adult_members_can_use_member_functions(self) -> None:
        member_policies = [p for p in ROUTE_POLICIES if p.audience is Audience.MEMBER]
        for policy in member_policies:
            with self.subTest(route=policy.pattern.pattern, actor="adult"):
                self.assertEqual(200, self.request(policy, self.adult).status)
            for actor in (self.minor, self.suspended):
                with self.subTest(route=policy.pattern.pattern, actor=actor.subject_id):
                    response = self.request(policy, actor)
                    self.assertEqual(403, response.status)
                    self.assertEqual("FORBIDDEN", response.body["code"])

    def test_member_cannot_use_operator_functions(self) -> None:
        for policy in (p for p in ROUTE_POLICIES if p.audience is Audience.OPERATOR):
            with self.subTest(route=policy.pattern.pattern):
                self.assertEqual(403, self.request(policy, self.adult).status)

    def test_each_operator_role_is_limited_to_its_matrix(self) -> None:
        for role in OperatorRole:
            actor = Principal.operator(role.value, [role])
            for (method, path), required_role in OPERATOR_ROUTES.items():
                expected = 200 if (
                    role is OperatorRole.SUPER_ADMIN or role is required_role
                ) else 403
                with self.subTest(role=role.value, method=method, path=path):
                    response = self.app.request(method, path, actor)
                    self.assertEqual(expected, response.status)
                    if expected == 403:
                        self.assertEqual("FORBIDDEN", response.body["code"])

    def test_disabled_operator_is_forbidden_even_with_matching_role(self) -> None:
        actor = Principal.operator(
            "disabled-reviewer", [OperatorRole.REVIEWER], status="disabled"
        )
        policy = next(
            p
            for p in ROUTE_POLICIES
            if p.audience is Audience.OPERATOR
            and OperatorRole.REVIEWER in p.roles
        )
        self.assertEqual(403, self.request(policy, actor).status)

    def test_operator_does_not_inherit_member_access(self) -> None:
        operator = Principal.operator("admin", [OperatorRole.SUPER_ADMIN])
        member_policy = next(
            p for p in ROUTE_POLICIES if p.audience is Audience.MEMBER
        )
        self.assertEqual(403, self.request(member_policy, operator).status)

    def test_public_routes_remain_available_to_authenticated_actors(self) -> None:
        public_policies = [p for p in ROUTE_POLICIES if p.audience is Audience.PUBLIC]
        actors = (
            self.adult,
            Principal.operator("reviewer", [OperatorRole.REVIEWER]),
        )
        for policy in public_policies:
            for actor in actors:
                with self.subTest(route=policy.pattern.pattern, actor=actor.subject_id):
                    self.assertEqual(200, self.request(policy, actor).status)

    def test_unknown_route_is_not_accidentally_authorized(self) -> None:
        self.assertEqual(404, self.app.request("GET", "/api/v1/admin/unknown").status)


if __name__ == "__main__":
    unittest.main()
