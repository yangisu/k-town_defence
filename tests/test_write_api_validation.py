from __future__ import annotations

import sys
from pathlib import Path
import unittest
import base64

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from ktown_defense import KTownDefenseApp, Principal
from ktown_defense.auth import OperatorRole, ROUTE_POLICIES
from ktown_defense.validation import WRITE_CONTRACTS


UUID = "123e4567-e89b-42d3-a456-426614174000"
KEY = "223e4567-e89b-42d3-a456-426614174000"


class WriteApiContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = KTownDefenseApp()
        self.member = Principal.member("member", adult_verified=True)
        self.admin = Principal.operator("admin", [OperatorRole.SUPER_ADMIN])

    def call(
        self,
        method: str,
        path: str,
        body: object,
        *,
        headers: dict[str, object] | None = None,
        content_type: str | None = "application/json",
        files: list[object] | None = None,
        resource_state: str | None = None,
        semantic_context: dict[str, object] | None = None,
    ):
        principal = self.admin if "/admin/" in path else self.member
        return self.app.request(
            method,
            path,
            principal,
            body=body,
            headers=headers,
            content_type=content_type,
            files=files,
            resource_state=resource_state,
            semantic_context=semantic_context,
        )

    def valid_cases(self):
        return (
            ("PUT", "/api/v1/me/season-membership", {"fandom_id": UUID}, None, None),
            ("POST", "/api/v1/checkin-sessions", {"place_id": UUID, "season_id": UUID}, {"Idempotency-Key": KEY}, None),
            ("POST", f"/api/v1/checkin-sessions/{UUID}/gps-samples", {"sample_sequence": 1, "sample_kind": "start", "latitude": -90, "longitude": 180, "accuracy_m": 0, "captured_at": "2026-08-12T00:00:00Z"}, None, None),
            ("POST", f"/api/v1/checkin-sessions/{UUID}/submit", {}, {"idempotency-key": KEY}, "ready_to_submit"),
            ("POST", f"/api/v1/checkins/{UUID}/appeals", {"reason_ko": "현장 확인을 다시 요청합니다"}, None, "rejected"),
            ("PATCH", f"/api/v1/admin/review-tasks/{UUID}", {"decision": "approved", "reason_ko": "승인 사유"}, None, None),
            ("POST", "/api/v1/admin/places", {"name_ko": "장소", "address_ko": "한국 주소", "description_ko": "장소 설명", "transit_guide_ko": "버스 이용", "map_deep_link": "https://example.test/map", "artist_id": UUID, "evidence_tier": "official", "latitude": 90, "longitude": -180, "radius_m": 50}, None, None),
            ("PATCH", f"/api/v1/admin/places/{UUID}", {"radius_m": 200}, None, None),
            ("POST", "/api/v1/admin/catalog-sync-runs", {"source": "KTOUR_API"}, None, None),
            ("POST", "/api/v1/admin/dual-approvals", {"action_type": "POINT_ADJUSTMENT", "subject_id": UUID}, None, None),
            ("POST", f"/api/v1/admin/dual-approvals/{UUID}/approve", {}, None, "pending"),
            ("POST", "/api/v1/admin/point-adjustments", {"user_id": UUID, "fandom_id": UUID, "place_id": UUID, "season_id": UUID, "points": -10000, "reason_ko": "정당한 점수 조정 사유입니다", "dual_approval_id": UUID}, None, None),
            ("POST", f"/api/v1/admin/dlq/{UUID}/retry", {}, None, "open"),
            ("POST", f"/api/v1/admin/seasons/{UUID}/finalize", {"dual_approval_id": UUID}, None, "review_grace_ended"),
        )

    def test_every_json_write_contract_accepts_boundary_valid_input(self) -> None:
        for method, path, body, headers, state in self.valid_cases():
            with self.subTest(method=method, path=path):
                response = self.call(method, path, body, headers=headers, resource_state=state)
                self.assertEqual(200, response.status, response.body)

    def test_every_declared_write_route_has_a_validation_contract(self) -> None:
        routed_writes = {
            (policy.method, policy.pattern.pattern.removeprefix("^").removesuffix("$")
             .replace(r"\{id\}", "{id}"))
            for policy in ROUTE_POLICIES
            if policy.method in {"POST", "PUT", "PATCH"}
        }
        # RoutePolicy compiles escaped literals. Compare through representative
        # paths instead of coupling this assertion to regex escaping details.
        for method, template in WRITE_CONTRACTS:
            representative = template.replace("{id}", UUID)
            self.assertTrue(
                any(policy.matches(method, representative) for policy in ROUTE_POLICIES),
                (method, template),
            )
        self.assertEqual(len(routed_writes), len(WRITE_CONTRACTS))

    def test_every_json_write_contract_rejects_missing_required_or_empty_patch(self) -> None:
        for method, path, _body, headers, state in self.valid_cases():
            with self.subTest(method=method, path=path):
                response = self.call(method, path, {}, headers=headers, resource_state=state)
                if _body == {} and method == "POST":
                    self.assertEqual(200, response.status)
                else:
                    self.assertEqual(422, response.status)
                    self.assertEqual("VALIDATION_FAILED", response.body["code"])

    def test_malformed_json_wrong_top_level_and_wrong_field_type_are_400(self) -> None:
        cases = (
            "{broken",
            [],
            {"fandom_id": 123},
        )
        for body in cases:
            with self.subTest(body=body):
                response = self.call("PUT", "/api/v1/me/season-membership", body)
                self.assertEqual(400, response.status)
                self.assertEqual("MALFORMED_REQUEST", response.body["code"])

    def test_oversized_text_and_idempotency_key_are_413(self) -> None:
        response = self.call(
            "POST",
            f"/api/v1/checkins/{UUID}/appeals",
            {"reason_ko": "가" * 1001},
            resource_state="rejected",
        )
        self.assertEqual((413, "PAYLOAD_TOO_LARGE"), (response.status, response.body["code"]))
        response = self.call(
            "PUT",
            "/api/v1/me/season-membership",
            {"fandom_id": "a" * 37},
        )
        self.assertEqual((413, "PAYLOAD_TOO_LARGE"), (response.status, response.body["code"]))
        response = self.call(
            "POST",
            "/api/v1/checkin-sessions",
            {"place_id": UUID, "season_id": UUID},
            headers={"Idempotency-Key": "x" * 37},
        )
        self.assertEqual((413, "PAYLOAD_TOO_LARGE"), (response.status, response.body["code"]))

    def test_ranges_formats_enums_korean_nfc_and_states_are_422(self) -> None:
        cases = (
            ("POST", "/api/v1/admin/places", {"name_ko": "Place", "address_ko": "주소", "description_ko": "설명", "transit_guide_ko": "안내", "map_deep_link": "http://example.test", "artist_id": UUID, "evidence_tier": "official", "latitude": 91, "longitude": 0, "radius_m": 49}, None),
            ("POST", f"/api/v1/checkin-sessions/{UUID}/gps-samples", {"sample_sequence": 0, "sample_kind": "invalid", "latitude": 0, "longitude": 0, "accuracy_m": 0, "captured_at": "2026-08-12T00:00:00+09:00"}, None),
            ("POST", f"/api/v1/checkin-sessions/{UUID}/submit", {}, "collecting"),
            ("POST", f"/api/v1/admin/dlq/{UUID}/retry", {}, "resolved"),
        )
        for method, path, body, state in cases:
            headers = {"Idempotency-Key": KEY} if path.endswith("/submit") else None
            with self.subTest(path=path):
                response = self.call(method, path, body, headers=headers, resource_state=state)
                self.assertEqual(422, response.status)
                self.assertEqual("VALIDATION_FAILED", response.body["code"])

    def test_idempotency_key_is_required_and_must_be_uuid_v4(self) -> None:
        body = {"place_id": UUID, "season_id": UUID}
        for headers in (None, {"Idempotency-Key": "not-a-uuid"}):
            with self.subTest(headers=headers):
                response = self.call("POST", "/api/v1/checkin-sessions", body, headers=headers)
                self.assertEqual(422, response.status)

    def test_json_and_multipart_media_types_are_enforced_as_415(self) -> None:
        response = self.call("PUT", "/api/v1/me/season-membership", {"fandom_id": UUID}, content_type="text/plain")
        self.assertEqual((415, "UNSUPPORTED_MEDIA_TYPE"), (response.status, response.body["code"]))
        response = self.call("PUT", "/api/v1/me/season-membership", {"fandom_id": UUID}, content_type=None)
        self.assertEqual((415, "UNSUPPORTED_MEDIA_TYPE"), (response.status, response.body["code"]))
        response = self.call(
            "POST", f"/api/v1/checkin-sessions/{UUID}/photo", {},
            headers={"Idempotency-Key": KEY}, content_type="application/json", files=[]
        )
        self.assertEqual(415, response.status)
        response = self.call(
            "POST", f"/api/v1/checkin-sessions/{UUID}/photo", {},
            headers={"Idempotency-Key": KEY}, content_type=None, files=[]
        )
        self.assertEqual(415, response.status)

    def test_photo_contract_enforces_count_size_mime_and_magic_bytes(self) -> None:
        path = f"/api/v1/checkin-sessions/{UUID}/photo"
        kwargs = {"headers": {"Idempotency-Key": KEY}, "content_type": "multipart/form-data; boundary=x"}
        png_1x1 = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        )
        valid = self.call("POST", path, {}, files=[{"content": png_1x1, "mime_type": "image/png"}], **kwargs)
        self.assertEqual(200, valid.status)

        cases = (
            ([], 422),
            ([{"content": b"x" * 10_485_761, "mime_type": "image/png"}], 413),
            ([{"content": b"GIF89a", "mime_type": "image/gif"}], 415),
            ([{"content": b"not png", "mime_type": "image/png"}], 415),
            ([{"content": b"\x89PNG\r\n\x1a\ncorrupt", "mime_type": "image/png"}], 415),
        )
        for files, status in cases:
            with self.subTest(status=status):
                response = self.call("POST", path, {}, files=files, **kwargs)
                self.assertEqual(status, response.status)

    def test_validation_error_precedence_is_deterministic(self) -> None:
        response = self.call(
            "POST", "/api/v1/checkin-sessions", "{broken",
            headers={"Idempotency-Key": "x" * 37}, content_type="text/plain"
        )
        self.assertEqual(415, response.status)

    def test_stateful_contract_facts_are_enforced_when_supplied(self) -> None:
        cases = (
            ("PUT", "/api/v1/me/season-membership", {"fandom_id": UUID}, None, {"membership_locked": True}),
            ("POST", "/api/v1/checkin-sessions", {"place_id": UUID, "season_id": UUID}, {"Idempotency-Key": KEY}, {"daily_attempt_count": 3}),
            ("POST", f"/api/v1/checkin-sessions/{UUID}/gps-samples", {"sample_sequence": 3, "sample_kind": "middle", "latitude": 0, "longitude": 0, "accuracy_m": 50, "captured_at": "2026-08-12T00:00:00Z"}, None, {"sample_sequence": 3, "previous_sequence": 1}),
            ("POST", f"/api/v1/checkins/{UUID}/appeals", {"reason_ko": "현장 확인을 다시 요청합니다"}, None, {"appeal_count": 1}),
            ("PATCH", f"/api/v1/admin/places/{UUID}", {"active": True}, None, {"reenabling": True, "rights_valid": False}),
            ("POST", f"/api/v1/admin/dual-approvals/{UUID}/approve", {}, None, {"same_requester_and_approver": True}),
            ("POST", f"/api/v1/admin/seasons/{UUID}/finalize", {"dual_approval_id": UUID}, None, {"review_grace_ended": False}),
        )
        for method, path, body, headers, context in cases:
            if path.endswith("/submit"):
                headers = {"Idempotency-Key": KEY}
            state = "pending" if "/dual-approvals/" in path and path.endswith("/approve") else None
            with self.subTest(path=path, context=context):
                response = self.call(
                    method, path, body, headers=headers,
                    resource_state=state, semantic_context=context,
                )
                self.assertEqual((422, "VALIDATION_FAILED"), (response.status, response.body["code"]))

    def test_gps_sequence_uses_request_value_and_authoritative_previous_value(self) -> None:
        response = self.call(
            "POST",
            f"/api/v1/checkin-sessions/{UUID}/gps-samples",
            {
                "sample_sequence": 3,
                "sample_kind": "middle",
                "latitude": 0,
                "longitude": 0,
                "accuracy_m": 50,
                "captured_at": "2026-08-12T00:00:00Z",
            },
            semantic_context={"previous_sequence": 1},
        )
        self.assertEqual((422, "VALIDATION_FAILED"), (response.status, response.body["code"]))
        self.assertEqual("sample_sequence", response.body["field"])


if __name__ == "__main__":
    unittest.main()
