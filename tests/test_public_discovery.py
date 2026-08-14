from __future__ import annotations

from datetime import datetime, timedelta, timezone
import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from ktown_defense import KTownDefenseApp
from ktown_defense.catalog import (
    Artist,
    Fandom,
    LeaderboardProjection,
    Place,
    PlaceArtistLink,
    PlaceCatalog,
    StrongholdProjection,
)


NOW = datetime(2026, 8, 12, 3, 0, tzinfo=timezone.utc)
FUTURE = NOW + timedelta(days=30)
PAST = NOW - timedelta(seconds=1)


class PublicDiscoveryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.artist = Artist("artist-a", "가상 아티스트", "approved", FUTURE, True)
        self.other_artist = Artist("artist-b", "다른 가상 아티스트", "approved", FUTURE, True)
        self.fandom = Fandom("fandom-a", "artist-a", "별빛")
        self.other_fandom = Fandom("fandom-b", "artist-b", "달빛")
        self.visible = self.place("visible", "승인 장소")
        self.places = [
            self.visible,
            self.place("private", "비공개 장소", public_visible=False),
            self.place("inactive", "비활성 장소", active=False),
            self.place("expired", "권리 만료 장소", expires_at=PAST),
            self.place("revoked", "권리 취소 장소", rights_status="revoked"),
            self.place("unapproved", "미승인 장소", approved_at=None),
            self.place("other", "다른 아티스트 장소"),
        ]
        self.links = [
            PlaceArtistLink("link-visible", "visible", "artist-a", "approved", FUTURE),
            PlaceArtistLink("link-private", "private", "artist-a", "approved", FUTURE),
            PlaceArtistLink("link-inactive", "inactive", "artist-a", "approved", FUTURE),
            PlaceArtistLink("link-expired", "expired", "artist-a", "approved", FUTURE),
            PlaceArtistLink("link-revoked", "revoked", "artist-a", "approved", FUTURE),
            PlaceArtistLink("link-unapproved", "unapproved", "artist-a", "approved", FUTURE),
            PlaceArtistLink("link-other", "other", "artist-b", "approved", FUTURE),
        ]
        self.strongholds = [
            StrongholdProjection("stronghold-a", "visible", "season-1", "fandom-a", "tree", NOW, 7)
        ]
        self.leaderboard = [
            LeaderboardProjection("leader-b", "season-1", "fandom-b", 1, 900, NOW, 7),
            LeaderboardProjection("leader-a", "season-1", "fandom-a", 2, 1200, NOW, 7),
        ]
        self.catalog = PlaceCatalog(
            artists=[self.artist, self.other_artist],
            fandoms=[self.fandom, self.other_fandom],
            places=self.places,
            links=self.links,
            strongholds=self.strongholds,
            leaderboards=self.leaderboard,
            current_season_id="season-1",
            clock=lambda: NOW,
        )
        self.app = KTownDefenseApp(catalog=self.catalog)

    @staticmethod
    def place(place_id: str, name: str, **overrides: object) -> Place:
        values = {
            "place_id": place_id,
            "name_ko": name,
            "address_ko": "강원특별자치도 별빛로 1",
            "description_ko": "가상 아티스트 관련 검증 장소입니다.",
            "transit_guide_ko": "별빛역 1번 출구에서 도보 5분",
            "map_deep_link": f"https://map.example.test/{place_id}",
            "source_locale": "ko",
            "latitude": 37.123,
            "longitude": 128.456,
            "rights_status": "approved",
            "approved_at": NOW,
            "expires_at": FUTURE,
            "active": True,
            "public_visible": True,
        }
        values.update(overrides)
        return Place(**values)

    def test_map_lists_only_public_active_unexpired_places_linked_to_selected_artist(self) -> None:
        response = self.app.request("GET", "/api/v1/places?artist_id=artist-a")

        self.assertEqual(200, response.status)
        self.assertEqual(["visible"], [item["place_id"] for item in response.body["items"]])
        self.assertEqual("승인 장소", response.body["items"][0]["name_ko"])
        self.assertEqual({"latitude": 37.123, "longitude": 128.456}, response.body["items"][0]["location"])
        self.assertEqual("tree", response.body["items"][0]["stronghold"]["level"])

    def test_detail_exposes_korean_content_transit_and_stronghold(self) -> None:
        response = self.app.request("GET", "/api/v1/places/visible?artist_id=artist-a")

        self.assertEqual(200, response.status)
        self.assertEqual("ko", response.body["source_locale"])
        self.assertEqual("강원특별자치도 별빛로 1", response.body["address_ko"])
        self.assertEqual("가상 아티스트 관련 검증 장소입니다.", response.body["description_ko"])
        self.assertEqual("별빛역 1번 출구에서 도보 5분", response.body["transit_guide_ko"])
        self.assertEqual("https://map.example.test/visible", response.body["map_deep_link"])
        self.assertEqual("fandom-a", response.body["stronghold"]["owner_fandom_id"])

    def test_stronghold_map_keeps_competing_owner_for_selected_artist_place(self) -> None:
        catalog = PlaceCatalog(
            artists=[self.artist, self.other_artist],
            fandoms=[self.fandom, self.other_fandom],
            places=[self.visible],
            links=[PlaceArtistLink("link", "visible", "artist-a", "approved", FUTURE)],
            strongholds=[
                StrongholdProjection(
                    "captured", "visible", "season-1", "fandom-b", "seed", NOW, 8
                )
            ],
            current_season_id="season-1",
            clock=lambda: NOW,
        )

        response = KTownDefenseApp(catalog=catalog).request(
            "GET", "/api/v1/seasons/current/strongholds?artist_id=artist-a"
        )

        self.assertEqual(200, response.status)
        self.assertEqual("fandom-b", response.body["items"][0]["owner_fandom_id"])

    def test_hidden_places_return_not_found_from_detail(self) -> None:
        for place_id in ("private", "inactive", "expired", "revoked", "unapproved", "other"):
            with self.subTest(place_id=place_id):
                response = self.app.request("GET", f"/api/v1/places/{place_id}?artist_id=artist-a")
                self.assertEqual(404, response.status)
                self.assertEqual("NOT_FOUND", response.body["code"])

    def test_unapproved_or_expired_artist_link_exposes_zero_places(self) -> None:
        for status, expires_at in (("pending", FUTURE), ("approved", PAST)):
            catalog = PlaceCatalog(
                artists=[self.artist],
                fandoms=[self.fandom],
                places=[self.visible],
                links=[PlaceArtistLink("link", "visible", "artist-a", status, expires_at)],
                current_season_id="season-1",
                clock=lambda: NOW,
            )
            response = KTownDefenseApp(catalog=catalog).request(
                "GET", "/api/v1/places?artist_id=artist-a"
            )
            self.assertEqual([], response.body["items"])

    def test_leaderboard_is_ranked_and_contains_korean_fandom_and_artist_names(self) -> None:
        response = self.app.request("GET", "/api/v1/seasons/current/leaderboards")

        self.assertEqual(200, response.status)
        self.assertEqual(["fandom-a", "fandom-b"], [row["fandom_id"] for row in response.body["items"]])
        self.assertEqual([1, 2], [row["rank"] for row in response.body["items"]])
        self.assertEqual("별빛", response.body["items"][0]["fandom_name_ko"])
        self.assertEqual("가상 아티스트", response.body["items"][0]["artist_name_ko"])


if __name__ == "__main__":
    unittest.main()
