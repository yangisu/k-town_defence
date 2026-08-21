from uuid import uuid4


async def test_places_list_only_public_active_rows(api_client, place_factory) -> None:
    visible = await place_factory(name_ko="감천문화마을")
    await place_factory(name_ko="숨김 장소", is_public=False)
    await place_factory(name_ko="운영 중단 장소", is_active=False)

    response = await api_client.get("/api/v1/places")

    assert response.status_code == 200
    assert response.json() == {
        "items": [
            {
                "id": str(visible.id),
                "contentId": visible.content_id,
                "nameKo": "감천문화마을",
                "addressKo": "부산광역시 사하구",
                "latitude": 35.0975,
                "longitude": 129.0106,
                "regionCode": "6",
                "descriptionKo": "부산의 산복도로 문화마을",
            }
        ]
    }


async def test_place_detail_returns_public_active_row(api_client, place_factory) -> None:
    place = await place_factory()

    response = await api_client.get(f"/api/v1/places/{place.id}")

    assert response.status_code == 200
    assert response.json()["id"] == str(place.id)


async def test_hidden_inactive_or_unknown_place_is_not_found(
    api_client, place_factory
) -> None:
    hidden = await place_factory(is_public=False)
    inactive = await place_factory(is_active=False)

    for place_id in (hidden.id, inactive.id, uuid4()):
        response = await api_client.get(f"/api/v1/places/{place_id}")
        assert response.status_code == 404
        assert response.json() == {
            "code": "PLACE_NOT_FOUND",
            "message": "장소를 찾을 수 없습니다.",
        }
