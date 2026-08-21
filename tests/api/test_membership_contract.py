ARMY_ID = "10000000-0000-4000-8000-000000000001"
BLINK_ID = "10000000-0000-4000-8000-000000000002"


async def test_membership_routes_require_a_trusted_identity(api_client) -> None:
    response = await api_client.get("/api/v1/me/season-membership")

    assert response.status_code == 401
    assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


async def test_active_fandoms_are_listed_for_selection(api_client) -> None:
    response = await api_client.get("/api/v1/fandoms")

    assert response.status_code == 200
    assert response.json() == {
        "items": [
            {"id": ARMY_ID, "name": "ARMY", "artistName": "방탄소년단"},
            {"id": BLINK_ID, "name": "BLINK", "artistName": "BLACKPINK"},
            {
                "id": "10000000-0000-4000-8000-000000000003",
                "name": "CARAT",
                "artistName": "SEVENTEEN",
            },
        ]
    }


async def test_member_can_select_once_and_read_the_persisted_membership(
    member_client,
) -> None:
    empty = await member_client.get("/api/v1/me/season-membership")
    selected = await member_client.put(
        "/api/v1/me/season-membership", json={"fandomId": ARMY_ID}
    )
    repeated = await member_client.put(
        "/api/v1/me/season-membership", json={"fandomId": ARMY_ID}
    )
    restored = await member_client.get("/api/v1/me/season-membership")

    assert empty.status_code == 200
    assert empty.json() is None
    assert selected.status_code == repeated.status_code == restored.status_code == 200
    assert repeated.json() == selected.json() == restored.json()
    assert selected.json()["userId"]
    assert selected.json()["seasonId"] == "20000000-0000-4000-8000-000000000001"
    assert selected.json()["fandomId"] == ARMY_ID
    assert selected.json()["lockedAt"] is not None


async def test_locked_membership_rejects_a_different_fandom(member_client) -> None:
    await member_client.put(
        "/api/v1/me/season-membership", json={"fandomId": ARMY_ID}
    )

    response = await member_client.put(
        "/api/v1/me/season-membership", json={"fandomId": BLINK_ID}
    )

    assert response.status_code == 422
    assert response.json()["code"] == "FANDOM_LOCKED"


async def test_unknown_fandom_is_rejected(member_client) -> None:
    response = await member_client.put(
        "/api/v1/me/season-membership",
        json={"fandomId": "90000000-0000-4000-8000-000000000009"},
    )

    assert response.status_code == 404
    assert response.json()["code"] == "FANDOM_NOT_FOUND"
