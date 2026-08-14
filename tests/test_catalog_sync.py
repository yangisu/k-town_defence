from __future__ import annotations

from datetime import datetime, timedelta, timezone
import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from ktown_defense import KTownDefenseApp
from ktown_defense.catalog import Artist, Fandom
from ktown_defense.catalog_sync import (
    CatalogSyncService,
    TourismPlaceRecord,
    TourismSnapshot,
)


NOW = datetime(2026, 8, 12, 3, 0, tzinfo=timezone.utc)


class MutableClock:
    def __init__(self, now: datetime) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now


class CatalogSyncTests(unittest.TestCase):
    def setUp(self) -> None:
        self.clock = MutableClock(NOW)
        self.service = CatalogSyncService(
            artists=[Artist("artist-a", "가상 별빛", "approved", NOW + timedelta(days=30), True)],
            fandoms=[Fandom("fandom-a", "artist-a", "별빛단")],
            clock=self.clock,
        )
        self.record = TourismPlaceRecord(
            place_id="place-a",
            artist_id="artist-a",
            name_ko="별빛 전망대",
            address_ko="강원특별자치도 별빛로 1",
            description_ko="가상 아티스트 관련 검증 장소입니다.",
            transit_guide_ko="별빛역 1번 출구에서 도보 5분",
            map_deep_link="https://map.example.test/place-a",
            latitude=37.123,
            longitude=128.456,
            admin_area_code="42760",
            place_type="official",
            place_evidence_uri="https://evidence.example.test/place-a",
            rights_evidence_uri="https://rights.example.test/place-a",
            rights_expires_at=NOW + timedelta(days=30),
        )

    def sync_successfully(self) -> None:
        result = self.service.sync(
            lambda: TourismSnapshot(
                snapshot_version="2026-08-12T03:00:00Z",
                snapshot_uri="s3://private-catalog/snapshot-1.json",
                records=(self.record,),
            )
        )
        self.assertEqual("succeeded", result.status)

    def test_success_updates_source_evidence_rights_and_snapshot_version(self) -> None:
        self.sync_successfully()

        place = self.service.catalog.places["place-a"]
        link = self.service.catalog.links[0]
        rights = self.service.rights_records["rights:place:place-a"]
        status = self.service.discovery_status()

        self.assertEqual("KTOUR_API", place.source)
        self.assertEqual("ko", place.source_locale)
        self.assertEqual("https://evidence.example.test/place-a", link.evidence_uri)
        self.assertEqual("approved", rights.status)
        self.assertEqual("https://rights.example.test/place-a", rights.evidence_uri)
        self.assertEqual("2026-08-12T03:00:00Z", status["snapshot_version"])
        self.assertFalse(status["stale"])

    def test_failed_sync_uses_last_good_through_24_hours_then_blocks_checkin(self) -> None:
        self.sync_successfully()

        def unavailable() -> TourismSnapshot:
            raise ConnectionError("tourism API unavailable")

        self.clock.now = NOW + timedelta(hours=23, minutes=59)
        failed = self.service.sync(unavailable)

        self.assertEqual("failed", failed.status)
        self.assertEqual(["place-a"], [item["place_id"] for item in self.service.list_places("artist-a")])
        self.assertTrue(self.service.can_start_checkin("place-a", "artist-a"))
        self.assertFalse(self.service.discovery_status()["stale"])

        self.clock.now = NOW + timedelta(hours=24)
        self.assertTrue(self.service.can_start_checkin("place-a", "artist-a"))

        self.clock.now = NOW + timedelta(hours=24, microseconds=1)
        self.assertEqual(["place-a"], [item["place_id"] for item in self.service.list_places("artist-a")])
        self.assertFalse(self.service.can_start_checkin("place-a", "artist-a"))
        self.assertTrue(self.service.discovery_status()["stale"])

    def test_rights_invalidation_immediately_hides_cached_place_and_blocks_checkin(self) -> None:
        self.sync_successfully()
        self.assertTrue(self.service.can_start_checkin("place-a", "artist-a"))

        self.service.invalidate_rights("place", "place-a", revoked_at=NOW + timedelta(minutes=1))

        self.assertEqual([], self.service.list_places("artist-a"))
        self.assertFalse(self.service.can_start_checkin("place-a", "artist-a"))
        rights = self.service.rights_records["rights:place:place-a"]
        self.assertEqual("revoked", rights.status)
        self.assertEqual(NOW + timedelta(minutes=1), rights.revoked_at)

        self.clock.now = NOW + timedelta(minutes=2)
        self.sync_successfully()
        self.assertEqual([], self.service.list_places("artist-a"))
        self.assertEqual(
            "revoked", self.service.rights_records["rights:place:place-a"].status
        )

    def test_public_place_response_marks_an_expired_snapshot_stale(self) -> None:
        self.sync_successfully()
        self.clock.now = NOW + timedelta(hours=25)

        response = KTownDefenseApp(catalog=self.service).request(
            "GET", "/api/v1/places?artist_id=artist-a"
        )

        self.assertEqual(200, response.status)
        self.assertEqual(["place-a"], [item["place_id"] for item in response.body["items"]])
        self.assertEqual("2026-08-12T03:00:00Z", response.body["snapshot_version"])
        self.assertTrue(response.body["stale"])


if __name__ == "__main__":
    unittest.main()
