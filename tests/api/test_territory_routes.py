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
    # The season opens on the demo's board rather than on zero: a fresh deploy
    # used to tie every fandom everywhere and hand ARMY all twenty-three.
    points = {standing["fandomName"]: standing["validPoints"] for standing in busan["standings"]}
    assert points["ARMY"] == 920
    assert points["BLINK"] == 840
    assert all(value == 0 for name, value in points.items() if name not in {"ARMY", "BLINK"})


async def test_a_fresh_board_is_not_one_fandom_everywhere(api_client) -> None:
    response = await api_client.get("/api/v1/territories")

    items = response.json()["items"]
    names = {
        standing["fandomId"]: standing["fandomName"]
        for standing in items[0]["standings"]
    }
    owners = {item["id"]: names[item["ownerFandomId"]] for item in items}
    # Twelve fandoms hold ground on the opening board, as in the demo.
    assert len(set(owners.values())) == 12
    assert owners["gwangju"] == "ONEDOOR"
    assert owners["seoul"] == "UAENA"
    assert owners["yeongwol"] == "ARMY"
    stages = {item["id"]: item["strongholdStage"] for item in items}
    assert stages["busan"] == "seed"
    assert stages["daegu"] == "tree"
    assert stages["yeongwol"] == "landmark"
