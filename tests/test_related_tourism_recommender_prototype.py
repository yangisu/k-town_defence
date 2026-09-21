from prototypes.related_tourism_recommender import (
    StandaloneTourismRecommender,
    _search_queries,
)


class TourismStub:
    def search_keyword(self, keyword, *, limit):
        if keyword == "아시아드주경기장":
            return [{
                "contentid": "anchor",
                "title": "부산 아시아드주경기장",
                "contenttypeid": "14",
                "mapx": "129.0582",
                "mapy": "35.1901",
                "lDongRegnCd": "26",
                "lDongSignguCd": "470",
            }]
        if keyword == "추천 공원":
            return [{
                "contentid": "park",
                "title": "추천 공원",
                "contenttypeid": "12",
                "mapx": "129.0600",
                "mapy": "35.1910",
                "addr1": "부산",
                "firstimage": "https://example.com/park.jpg",
            }]
        return []

    def location_based_list(self, **kwargs):
        return [{
            "contentid": "nearby",
            "title": "가까운 문화시설",
            "contenttypeid": "14",
            "mapx": "129.0590",
            "mapy": "35.1905",
            "addr1": "부산",
        }]


class RelatedStub:
    def __init__(self, rows=()):
        self.rows = rows

    def search_related(self, **kwargs):
        return self.rows


def test_region_prefix_is_removed_for_anchor_lookup():
    assert _search_queries("부산아시아드주경기장") == (
        "부산아시아드주경기장",
        "아시아드주경기장",
    )


def test_falls_back_to_location_api_when_related_dataset_has_no_anchor():
    recommender = StandaloneTourismRecommender(
        "key",
        tourism_client=TourismStub(),
        related_client=RelatedStub(),
    )

    result = recommender.recommend("부산아시아드주경기장", limit=1)

    assert result[0].name == "가까운 문화시설"
    assert result[0].source == "KOREAN_TOURISM_LOCATION_API"
    assert result[0].distance_km is not None


class RouteTourismStub(TourismStub):
    def search_keyword(self, keyword, *, limit):
        places = {
            "출발지": {
                "contentid": "start",
                "title": "출발지",
                "contenttypeid": "12",
                "mapx": "129.0",
                "mapy": "35.0",
            },
            "도착지": {
                "contentid": "destination",
                "title": "도착지",
                "contenttypeid": "12",
                "mapx": "129.1",
                "mapy": "35.0",
            },
        }
        return [places[keyword]] if keyword in places else []

    def location_based_list(self, **kwargs):
        return [
            {
                "contentid": "on-route",
                "title": "경로 위 관광지",
                "contenttypeid": "14",
                "mapx": "129.05",
                "mapy": "35.0",
            },
            {
                "contentid": "off-route",
                "title": "우회 관광지",
                "contenttypeid": "12",
                "mapx": "129.05",
                "mapy": "35.02",
            },
        ]


def test_route_recommendations_are_ranked_by_added_detour_distance():
    recommender = StandaloneTourismRecommender(
        "key",
        tourism_client=RouteTourismStub(),
        related_client=RelatedStub(),
    )

    result = recommender.recommend_between("출발지", "도착지", limit=2)

    assert [item.content_id for item in result] == ["on-route", "off-route"]
    assert result[0].detour_km == 0
    assert result[1].detour_km > result[0].detour_km
