ARMY_ID = "10000000-0000-4000-8000-000000000001"


async def test_territory_board_comes_from_backend_contract(api_client) -> None:
    response = await api_client.get("/api/v1/territories")

    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 23
    busan = next(item for item in items if item["id"] == "busan")
    assert busan["nameKo"] == "부산"
    assert busan["ownerFandomId"] == ARMY_ID
    assert busan["strongholdStage"] == "seed"
    # Every active fandom stands on every territory, so the board grew with the
    # catalog; the three seeded first still lead it in id order.
    assert [standing["fandomName"] for standing in busan["standings"]][:3] == [
        "ARMY", "BLINK", "CARAT"
    ]
    assert len(busan["standings"]) == 15
    assert all(standing["validPoints"] == 0 for standing in busan["standings"])
