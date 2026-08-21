async def test_live_places_filter_search_and_paginate(api_client, place_factory) -> None:
    first = await place_factory(
        name_ko="감천문화마을",
        address_ko="부산광역시 사하구",
        source="KTOUR_API",
        content_type_id="12",
        category_code="A01010100",
        image_url="https://images.example/gamcheon.jpg",
    )
    await place_factory(
        name_ko="부산문화회관",
        source="KTOUR_API",
        content_type_id="14",
    )
    await place_factory(
        name_ko="부산 음식점",
        source="KTOUR_API",
        content_type_id="39",
    )
    await place_factory(name_ko="서울 문화", region_code="1", content_type_id="12")

    response = await api_client.get(
        "/api/v1/places?regionCode=6&category=culture&query=문화&limit=1&offset=0"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert body["limit"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["id"] == str(first.id)
    assert body["items"][0]["category"] == "culture"
    assert body["items"][0]["imageUrl"].startswith("https://")


async def test_live_places_reject_invalid_pagination_and_category(api_client) -> None:
    for query in ("limit=0", "limit=101", "offset=-1", "category=unknown"):
        response = await api_client.get(f"/api/v1/places?{query}")
        assert response.status_code == 422
