from datetime import datetime, timezone

from sqlalchemy import select

from ktown_defense.infrastructure.models import ExpeditionStopModel
from ktown_defense.seed_demo import seed_bts_route_anchors


async def test_bts_route_falls_back_to_two_ordered_required_anchors(
    api_client, session_factory
) -> None:
    await seed_bts_route_anchors(session_factory)
    response = await api_client.get(
        "/api/v1/expeditions/recommended?routeKey=bts-busan&regionCode=6&limit=5&travelDate=2026-09-21"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["routeKey"] == "bts-busan"
    assert body["routeVersion"].endswith(":RELATED_UNAVAILABLE")
    assert [stop["place"]["nameKo"] for stop in body["stops"]] == [
        "부산아시아드주경기장", "감천문화마을"
    ]
    assert all(stop["required"] and stop["kind"] == "anchor" for stop in body["stops"])


async def test_selected_recommendation_is_persisted_but_not_required_for_completion(
    member_client, place_factory, session_factory
) -> None:
    await seed_bts_route_anchors(session_factory)
    recommended_place = await place_factory(
        source="KTOUR_API", content_id="bts-related-1", name_ko="부산 추천 명소",
        content_type_id="12", latitude=35.16, longitude=129.045,
        intro_json={"routeObservations": [{
            "source": "KTOUR_RELATED_ATTRACTION",
            "anchorContentId": "operator:bts-busan-asiad",
            "relatedRank": 1, "baseYm": "202504", "distanceKm": 1.0,
        }]},
    )
    await member_client.put(
        "/api/v1/me/season-membership",
        json={"fandomId": "10000000-0000-4000-8000-000000000001"},
    )
    preview = (await member_client.get(
        "/api/v1/expeditions/recommended?routeKey=bts-busan&regionCode=6&limit=5&travelDate=2026-09-21"
    )).json()
    assert len(preview["stops"]) == 3
    recommendation = next(stop for stop in preview["stops"] if not stop["required"])
    assert recommendation["selectedByDefault"] is False
    created = await member_client.post("/api/v1/expeditions", json={
        "recommendationId": preview["id"], "routeKey": "bts-busan",
        "routeVersion": preview["routeVersion"],
        "selectedRecommendationPlaceIds": [str(recommended_place.id)],
        "regionCode": "6", "travelDate": "2026-09-21", "limit": 5,
    })
    assert created.status_code == 201
    body = created.json()
    assert len(body["stops"]) == 3
    assert next(stop for stop in body["stops"] if not stop["required"])["selectedByDefault"] is True

    async with session_factory() as session:
        stops = (await session.execute(select(ExpeditionStopModel).where(
            ExpeditionStopModel.expedition_id == body["id"]
        ))).scalars().all()
        now = datetime.now(timezone.utc)
        for stop in stops:
            if stop.is_required:
                stop.completed_at = now
        await session.commit()
    completed = await member_client.post(f"/api/v1/expeditions/{body['id']}/complete")
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"
    optional = next(stop for stop in completed.json()["stops"] if not stop["required"])
    assert optional["completedAt"] is None


async def test_bts_route_rejects_missing_state_unknown_route_and_anchor_selection(
    api_client, member_client, session_factory
) -> None:
    await seed_bts_route_anchors(session_factory)
    assert (await api_client.get(
        "/api/v1/expeditions/recommended?routeKey=unknown&regionCode=6&limit=5"
    )).status_code == 404
    missing = await member_client.post("/api/v1/expeditions", json={
        "recommendationId": "x", "routeKey": "bts-busan",
        "regionCode": "6", "travelDate": "2026-09-21", "limit": 5,
    })
    assert missing.status_code == 422
