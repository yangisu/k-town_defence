from datetime import date, datetime, timezone
import inspect
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ktown_defense.infrastructure.models import (
    CatalogSyncRunModel,
    OpenApiCallLogModel,
)
from ktown_defense.api.expedition_routes import recommended_expedition


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


async def test_member_can_persist_restore_and_abandon_verified_recommendation(
    member_client, place_factory, session_factory
) -> None:
    await _seed_logs(session_factory)
    for index in range(3):
        await place_factory(
            content_id=f"persistent-{index}",
            name_ko=f"부산 원정지 {index}",
            address_ko="부산광역시 중구",
            source="KTOUR_API",
            latitude=35.0 + index * 0.001,
            synced_at=NOW,
        )
    await member_client.put(
        "/api/v1/me/season-membership",
        json={"fandomId": "10000000-0000-4000-8000-000000000001"},
    )
    recommended = await member_client.get(
        "/api/v1/expeditions/recommended?regionCode=6&travelDate=2026-08-22&limit=3"
    )

    created = await member_client.post(
        "/api/v1/expeditions",
        json={
            "recommendationId": recommended.json()["id"],
            "regionCode": "6",
            "travelDate": "2026-08-22",
            "limit": 3,
        },
    )
    current = await member_client.get("/api/v1/expeditions/current")

    assert created.status_code == 201
    assert current.status_code == 200
    assert current.json() == created.json()
    assert current.json()["status"] == "active"
    assert current.json()["territoryId"] == "busan"
    assert len(current.json()["stops"]) == 3

    checkin = await member_client.post(
        "/api/v1/checkins",
        json={
            "placeId": current.json()["stops"][0]["place"]["id"],
            "verificationType": "demo",
            "expeditionId": created.json()["id"],
        },
    )
    submitted = await member_client.post(
        f"/api/v1/checkins/{checkin.json()['id']}/submit",
        headers={"Idempotency-Key": str(uuid4())},
    )
    progressed = await member_client.get("/api/v1/expeditions/current")
    assert submitted.json()["decision"] == "approved"
    assert progressed.json()["stops"][0]["completedAt"] is not None
    assert progressed.json()["stops"][1]["completedAt"] is None

    abandoned = await member_client.post(
        f"/api/v1/expeditions/{created.json()['id']}/abandon"
    )
    assert abandoned.status_code == 200
    assert abandoned.json()["status"] == "abandoned"
    assert (await member_client.get("/api/v1/expeditions/current")).json() is None


async def test_persisted_expedition_rejects_a_stale_recommendation_id(
    member_client, place_factory, session_factory
) -> None:
    await _seed_logs(session_factory)
    for index in range(3):
        await place_factory(
            content_id=f"stale-{index}", source="KTOUR_API", latitude=35.0 + index * 0.001
        )
    await member_client.put(
        "/api/v1/me/season-membership",
        json={"fandomId": "10000000-0000-4000-8000-000000000001"},
    )

    response = await member_client.post(
        "/api/v1/expeditions",
        json={
            "recommendationId": "stale-client-id",
            "regionCode": "6",
            "travelDate": "2026-08-22",
            "limit": 3,
        },
    )

    assert response.status_code == 409
    assert response.json()["code"] == "EXPEDITION_RECOMMENDATION_CHANGED"


def test_recommended_expedition_date_default_is_calculated_per_request() -> None:
    assert inspect.signature(recommended_expedition).parameters["travel_date"].default is None
