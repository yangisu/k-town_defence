from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from ktown_defense import KTownDefenseApp
from ktown_defense.catalog import Artist, Fandom, Place, PlaceArtistLink, PlaceCatalog
from ktown_defense.rights import (
    ProductionReleasePolicy,
    ReleaseBlockedError,
    ReleaseGate,
    RightsGovernanceService,
)


NOW = datetime(2026, 8, 12, 3, 0, tzinfo=timezone.utc)
FUTURE = NOW + timedelta(days=30)


class RightsReleaseGateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.artist = Artist("artist-a", "가상 아티스트", "approved", FUTURE, True)
        self.place = Place(
            "place-a", "승인 장소", "강원특별자치도 별빛로 1", "검증된 장소입니다.",
            "별빛역에서 도보 5분", "https://map.example.test/place-a", "ko",
            37.123, 128.456, "approved", NOW, FUTURE, True, True,
        )
        self.catalog = PlaceCatalog(
            artists=[self.artist],
            fandoms=[Fandom("fandom-a", "artist-a", "별빛")],
            places=[self.place],
            links=[PlaceArtistLink("link-a", "place-a", "artist-a", "approved", FUTURE)],
            clock=lambda: NOW,
        )
        self.app = KTownDefenseApp(self.catalog)

    def gate(self, gate_type: str, *, artist_id: str | None = None, **changes: object) -> ReleaseGate:
        values = dict(
            release_gate_id=f"gate-{gate_type}-{artist_id or 'global'}",
            gate_type=gate_type,
            status="approved",
            approver_id="operator-a",
            evidence_uri="s3://private-evidence/approval.pdf",
            approved_at=NOW - timedelta(minutes=1),
            expires_at=FUTURE,
            artist_id=artist_id,
        )
        values.update(changes)
        return ReleaseGate(**values)

    def test_deletion_request_immediately_hides_content_from_public_apis(self) -> None:
        service = RightsGovernanceService(self.catalog, clock=lambda: NOW)
        self.assertEqual(200, self.app.request("GET", "/api/v1/places/place-a?artist_id=artist-a").status)

        request = service.register_deletion_request(
            subject_type="place", subject_id="place-a", requester_reference="rights-owner-42"
        )

        self.assertEqual(NOW, request.received_at)
        self.assertEqual(request.received_at, request.public_hidden_at)
        self.assertEqual("received", request.status)
        self.assertEqual([], self.app.request("GET", "/api/v1/places?artist_id=artist-a").body["items"])
        self.assertEqual(404, self.app.request("GET", "/api/v1/places/place-a?artist_id=artist-a").status)

    def test_failed_registration_does_not_create_a_request(self) -> None:
        service = RightsGovernanceService(self.catalog, clock=lambda: NOW)
        with self.assertRaises(KeyError):
            service.register_deletion_request(
                subject_type="place", subject_id="missing", requester_reference="owner"
            )
        self.assertEqual((), service.deletion_requests)

    def test_artist_deletion_hides_all_linked_places(self) -> None:
        service = RightsGovernanceService(self.catalog, clock=lambda: NOW)
        request = service.register_deletion_request(
            subject_type="artist", subject_id="artist-a", requester_reference="artist-agent"
        )

        self.assertEqual("artist-a", request.artist_id)
        self.assertIsNone(request.place_id)
        self.assertEqual([], self.app.request("GET", "/api/v1/places?artist_id=artist-a").body["items"])

    def test_production_requires_global_and_per_artist_approved_gates(self) -> None:
        valid = [
            self.gate("legal"), self.gate("privacy"),
            self.gate("artist_rights", artist_id="artist-a"),
        ]
        ProductionReleasePolicy(self.catalog, valid, clock=lambda: NOW).assert_deployable()

        for omitted_type in ("legal", "privacy", "artist_rights"):
            with self.subTest(omitted_type=omitted_type):
                gates = [gate for gate in valid if gate.gate_type != omitted_type]
                with self.assertRaises(ReleaseBlockedError):
                    ProductionReleasePolicy(self.catalog, gates, clock=lambda: NOW).assert_deployable()

    def test_expired_gate_or_artist_rights_blocks_production_but_not_nonproduction(self) -> None:
        gates = [
            self.gate("legal"), self.gate("privacy"),
            self.gate("artist_rights", artist_id="artist-a", expires_at=NOW),
        ]
        policy = ProductionReleasePolicy(self.catalog, gates, clock=lambda: NOW)
        self.assertTrue(policy.evaluate("staging").allowed)
        self.assertFalse(policy.evaluate("production").allowed)

        expired_catalog = PlaceCatalog(
            artists=[Artist("artist-a", "가상 아티스트", "approved", NOW, True)],
            clock=lambda: NOW,
        )
        decision = ProductionReleasePolicy(expired_catalog, gates, clock=lambda: NOW).evaluate("production")
        self.assertIn("INVALID_ARTIST_RIGHTS:artist-a", decision.blockers)


if __name__ == "__main__":
    unittest.main()
