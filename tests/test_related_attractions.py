from ktown_defense.related_attractions import RelatedAttractionService


class StubTourClient:
    def __init__(self, nearby_by_radius):
        self.nearby_by_radius = nearby_by_radius
        self.search_calls = []
        self.location_calls = []

    def search_keyword(self, keyword, *, limit):
        self.search_calls.append((keyword, limit))
        return [{
            "contentid": "anchor-1",
            "title": "감천 문화마을",
            "mapx": "129.0104",
            "mapy": "35.0977",
        }]

    def location_based_list(self, *, longitude, latitude, radius, limit):
        self.location_calls.append((longitude, latitude, radius, limit))
        return self.nearby_by_radius.get(radius, [])


def candidate(content_id, title, longitude, latitude, content_type="12", **extra):
    return {
        "contentid": content_id,
        "title": title,
        "mapx": str(longitude),
        "mapy": str(latitude),
        "contenttypeid": content_type,
        **extra,
    }


async def test_location_based_recommendation_filters_sorts_and_uses_coordinates():
    client = StubTourClient({
        5000: [],
        10000: [
            candidate("anchor-1", "감천문화마을", 129.0104, 35.0977),
            candidate("far", "먼 관광지", 129.06, 35.14),
            candidate("near", "가까운 관광지", 129.011, 35.098, firstimage="https://image/near.jpg"),
            candidate("near", "중복 관광지", 129.011, 35.098),
            candidate("main-stop", "자갈치시장", 129.0303, 35.0968),
            candidate("not-tourism", "제외 콘텐츠", 129.011, 35.098, content_type="99"),
        ],
    })
    service = RelatedAttractionService(
        service_key="key",
        client_factory=lambda _: client,
    )

    result = await service.get_for_place(
        name_ko="감천문화마을",
        latitude=35.0977,
        longitude=129.0104,
        region_code="6",
        excluded_names=("감천문화마을", "자갈치시장"),
    )

    assert client.search_calls == [("감천문화마을", 50)]
    assert client.location_calls == [
        (129.0104, 35.0977, 5000, 50),
        (129.0104, 35.0977, 10000, 50),
    ]
    assert [item.content_id for item in result] == ["near"]
    assert result[0].name_ko == "가까운 관광지"
    assert result[0].distance_km > 0
    assert result[0].image_url == "https://image/near.jpg"
    assert result[0].source == "KTOUR_LOCATION_BASED"


async def test_location_based_failure_returns_empty_tuple():
    class FailingClient:
        def search_keyword(self, *args, **kwargs):
            raise RuntimeError("TourAPI unavailable")

        def location_based_list(self, **kwargs):
            raise AssertionError("location API should not run without an anchor")

    service = RelatedAttractionService(
        service_key="key",
        client_factory=lambda _: FailingClient(),
    )

    result = await service.get_for_place(
        name_ko="없는 장소",
        latitude=None,
        longitude=None,
    )

    assert result == ()


async def test_route_recommendations_choose_endpoint_candidates_and_rank_detour():
    class RouteClient:
        def location_based_list(self, *, longitude, latitude, radius, limit):
            if longitude < 129.025:
                return [
                    candidate("first-near", "첫 장소 주변", 129.005, 35.0),
                    candidate("first-two", "첫 장소 주변 둘", 129.010, 35.0),
                    candidate("first-three", "첫 장소 주변 셋", 129.015, 35.0),
                    candidate("first-four", "첫 장소 주변 넷", 129.020, 35.0),
                    candidate("on-route", "경로 중간", 129.05, 35.0),
                ]
            if longitude > 129.075:
                return [
                    candidate("second-near", "둘째 장소 주변", 129.095, 35.0),
                    candidate("second-two", "둘째 장소 주변 둘", 129.090, 35.0),
                    candidate("second-three", "둘째 장소 주변 셋", 129.085, 35.0),
                    candidate("second-four", "둘째 장소 주변 넷", 129.080, 35.0),
                    candidate("off-route", "많이 우회", 129.05, 35.04),
                ]
            return [
                candidate("on-route", "경로 중간", 129.05, 35.0),
                candidate("off-route", "많이 우회", 129.05, 35.04),
            ]

    service = RelatedAttractionService(
        service_key="key",
        client_factory=lambda _: RouteClient(),
        chooser=lambda values: values[-1],
    )

    result = await service.get_for_route(
        first_name_ko="첫 장소",
        first_latitude=35.0,
        first_longitude=129.0,
        second_name_ko="둘째 장소",
        second_latitude=35.0,
        second_longitude=129.1,
    )

    assert [item.placement for item in result] == [
        "before_first", "between", "after_second",
    ]
    assert result[0].attraction.content_id == "first-three"
    assert result[1].attraction.content_id == "on-route"
    assert result[1].detour_km == 0
    assert result[2].attraction.content_id == "second-three"
