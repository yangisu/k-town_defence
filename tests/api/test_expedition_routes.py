from datetime import date, datetime, timezone
import inspect
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ktown_defense.infrastructure.models import (
    CatalogSyncRunModel,
    OpenApiCallLogModel,
)
from ktown_defense.api.expedition_routes import recommended_expedition
from ktown_defense.related_attractions import (
    RelatedAttraction,
    RelatedAttractionService,
    RouteAttractionRecommendation,
)


NOW = datetime(2026, 8, 22, 3, 0, tzinfo=timezone.utc)


async def _seed_logs(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    run_id = uuid4()
    async with session_factory() as session:
        session.add(
            CatalogSyncRunModel(
                id=run_id,
                source="KTOUR_API",
                area_code="6",
                status="succeeded",
                snapshot_version="snapshot-1",
                fetched_count=3,
                active_count=3,
                started_at=NOW,
                completed_at=NOW,
            )
        )
        session.add_all(
            OpenApiCallLogModel(
                id=uuid4(),
                sync_run_id=run_id,
                operation=operation,
                feature="judge_demo",
                status="succeeded",
                response_count=count,
                started_at=NOW,
                completed_at=NOW,
            )
            for operation, count in (
                ("areaBasedList2", 3),
                ("detailCommon2", 3),
                ("detailImage2", 2),
            )
        )
        await session.commit()


async def test_recommended_expedition_returns_reasons_and_enriched_places(
    api_client, place_factory, session_factory
) -> None:
    await _seed_logs(session_factory)
    anchor = await place_factory(
        source="KTOUR_API",
        content_id="anchor",
        name_ko="감천문화마을",
        latitude=35.0000,
        longitude=129.0000,
        content_type_id="12",
        discovery_keywords=["BTS"],
        source_operations=["searchKeyword2", "detailCommon2"],
        image_urls=["https://images.example/anchor.jpg"],
        open_time="09:00~18:00",
        synced_at=NOW,
    )
    await place_factory(
        source="KTOUR_API",
        content_id="food",
        name_ko="부산 로컬 식당",
        latitude=35.0010,
        longitude=129.0000,
        content_type_id="39",
        synced_at=NOW,
    )
    await place_factory(
        source="KTOUR_API",
        content_id="festival",
        name_ko="부산 여름 축제",
        latitude=35.0020,
        longitude=129.0000,
        content_type_id="15",
        festival_start_date=date(2026, 8, 20),
        festival_end_date=date(2026, 8, 25),
        synced_at=NOW,
    )

    response = await api_client.get(
        "/api/v1/expeditions/recommended",
        params={
            "regionCode": "6",
            "keyword": "BTS",
            "travelDate": "2026-08-22",
            "limit": 3,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "부산 로컬 원정"
    assert len(body["stops"]) == 3
    assert body["stops"][0]["place"]["id"] == str(anchor.id)
    assert body["stops"][0]["reasons"] == ["키워드 일치"]
    assert body["stops"][0]["place"]["imageUrls"] == [
        "https://images.example/anchor.jpg"
    ]
    assert body["stops"][0]["place"]["openTime"] == "09:00~18:00"
    assert body["dataUpdatedAt"] == "2026-08-22T03:00:00Z"


async def test_open_data_status_is_safe_and_aggregated(
    api_client, place_factory, session_factory
) -> None:
    await place_factory(source="KTOUR_API", synced_at=NOW)
    await _seed_logs(session_factory)

    response = await api_client.get("/api/v1/open-data/status")

    assert response.status_code == 200
    body = response.json()
    assert body["label"] == "관광 OpenAPI"
    assert body["activePlaceCount"] == 1
    assert {item["operation"] for item in body["operations"]} == {
        "areaBasedList2",
        "detailCommon2",
        "detailImage2",
    }
    serialized = response.text
    assert "serviceKey" not in serialized
    assert "requestUrl" not in serialized
    assert "한국관광공사" not in serialized
    assert '"KTO"' not in serialized


async def test_open_data_status_ignores_newer_legacy_run_without_evidence(
    api_client, session_factory
) -> None:
    await _seed_logs(session_factory)
    async with session_factory() as session:
        session.add(
            CatalogSyncRunModel(
                id=uuid4(), source="KTOUR_API", area_code="6", status="succeeded",
                snapshot_version="legacy", fetched_count=1, active_count=1,
                started_at=NOW.replace(hour=4), completed_at=NOW.replace(hour=4),
            )
        )
        await session.commit()

    response = await api_client.get("/api/v1/open-data/status")

    assert response.status_code == 200
    assert {item["operation"] for item in response.json()["operations"]} == {
        "areaBasedList2", "detailCommon2", "detailImage2",
    }


async def test_recommendation_excludes_operator_demo_rows(
    api_client, place_factory, session_factory
) -> None:
    await _seed_logs(session_factory)
    await place_factory(content_id="demo", name_ko="운영자 데모", source="OPERATOR")
    for index in range(3):
        await place_factory(
            content_id=f"tour-{index}", name_ko=f"실제 관광지 {index}",
            source="KTOUR_API", latitude=35.0 + index * 0.001,
        )

    response = await api_client.get(
        "/api/v1/expeditions/recommended?regionCode=6&travelDate=2026-08-22&limit=3"
    )

    assert response.status_code == 200
    assert "운영자 데모" not in response.text


async def test_recommended_expedition_returns_not_found_without_places(api_client) -> None:
    response = await api_client.get(
        "/api/v1/expeditions/recommended?regionCode=6&travelDate=2026-08-22&limit=3"
    )

    assert response.status_code == 404
    assert response.json()["code"] == "EXPEDITION_NOT_AVAILABLE"


async def test_recommended_expedition_returns_not_found_with_only_two_places(
    api_client, place_factory, session_factory
) -> None:
    await _seed_logs(session_factory)
    for index in range(2):
        await place_factory(content_id=f"tour-{index}", source="KTOUR_API")

    response = await api_client.get(
        "/api/v1/expeditions/recommended?regionCode=6&travelDate=2026-08-22&limit=3"
    )

    assert response.status_code == 404
    assert response.json()["code"] == "EXPEDITION_NOT_AVAILABLE"


async def test_nearby_attractions_route_accepts_preview_coordinates(api_client) -> None:
    class StubRelatedService:
        async def get_for_place(self, **kwargs):
            assert kwargs["name_ko"] == "감천문화마을"
            assert kwargs["latitude"] == 35.0977
            assert kwargs["longitude"] == 129.0104
            return (
                RelatedAttraction(
                    content_id="nearby-1",
                    name_ko="부산시민공원",
                    category="문화시설",
                    latitude=35.16,
                    longitude=129.05,
                    distance_km=2.1,
                    image_url=None,
                ),
            )

    api_client._transport.app.state.related_attraction_service = StubRelatedService()
    response = await api_client.get(
        "/api/v1/tourism/nearby-attractions?name=%EA%B0%90%EC%B2%9C%EB%AC%B8%ED%99%94%EB%A7%88%EC%9D%84&latitude=35.0977&longitude=129.0104&regionCode=6"
    )

    assert response.status_code == 200
    assert response.json() == {
        "items": [{
            "contentId": "nearby-1",
            "nameKo": "부산시민공원",
            "latitude": 35.16,
            "longitude": 129.05,
            "distanceKm": 2.1,
            "category": "문화시설",
            "imageUrl": None,
            "addressKo": None,
            "source": "KTOUR_LOCATION_BASED",
        }],
    }


async def test_related_attraction_failure_is_isolated_from_main_expedition(api_client) -> None:

    class FailingClient:
        def search_keyword(self, *args, **kwargs):
            raise RuntimeError("related API unavailable")

    api_client._transport.app.state.related_attraction_service = RelatedAttractionService(
        service_key="service-key",
        client_factory=lambda key: FailingClient(),
    )
    response = await api_client.get(
        "/api/v1/tourism/nearby-attractions?name=%EA%B0%90%EC%B2%9C%EB%AC%B8%ED%99%94%EB%A7%88%EC%9D%84&latitude=35.0975&longitude=129.0106"
    )

    assert response.status_code == 200
    assert response.json()["items"] == []


async def test_route_attractions_returns_ordered_recommendation_cards(api_client) -> None:
    class StubRouteService:
        async def get_for_route(self, **kwargs):
            assert kwargs["first_name_ko"] == "부산아시아드주경기장"
            assert kwargs["second_name_ko"] == "감천문화마을"
            return (
                RouteAttractionRecommendation(
                    placement="before_first",
                    attraction=RelatedAttraction(
                        content_id="before-1", name_ko="사직공원", category="12",
                        latitude=35.19, longitude=129.05, distance_km=0.8,
                        image_url=None, address_ko="부산 동래구",
                    ),
                    detour_km=None, via_distance_km=None,
                    reasons=("첫 번째 메인 관광지 주변 거리 상위 3곳 중 추천",),
                ),
                RouteAttractionRecommendation(
                    placement="between",
                    attraction=RelatedAttraction(
                        content_id="between-1", name_ko="구덕민속예술관", category="14",
                        latitude=35.13, longitude=129.02, distance_km=8.2,
                        image_url=None, address_ko="부산 서구", source="KTOUR_ROUTE_DETOUR",
                    ),
                    detour_km=0.05, via_distance_km=11.2,
                    reasons=("두 메인 관광지 사이 최소 우회 후보",),
                ),
            )

    api_client._transport.app.state.related_attraction_service = StubRouteService()
    response = await api_client.get(
        "/api/v1/tourism/route-attractions",
        params={
            "firstName": "부산아시아드주경기장",
            "firstLatitude": 35.1901,
            "firstLongitude": 129.0584,
            "secondName": "감천문화마을",
            "secondLatitude": 35.0977,
            "secondLongitude": 129.0104,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert [item["placement"] for item in body["items"]] == [
        "before_first", "between",
    ]
    assert body["items"][0]["addressKo"] == "부산 동래구"
    assert body["items"][1]["detourKm"] == 0.05
    assert body["items"][1]["source"] == "KTOUR_ROUTE_DETOUR"


def test_recommended_expedition_date_default_is_calculated_per_request() -> None:
    assert inspect.signature(recommended_expedition).parameters["travel_date"].default is None
