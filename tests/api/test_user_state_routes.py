async def _create_user(api_client, subject: str = "google:user-1") -> None:
    response = await api_client.post(
        "/api/v1/auth/social/upsert",
        json={"platformSubject": subject, "displayName": "테스트 사용자"},
    )
    assert response.status_code == 200


async def test_game_state_round_trip_is_scoped_to_the_signed_in_user(api_client) -> None:
    await _create_user(api_client)
    api_client.headers["X-KTown-User-Id"] = "google:user-1"

    assert (await api_client.get("/api/v1/me/game-state")).json() is None
    state = {"version": 3, "activeTab": "explore", "points": 120}
    saved = await api_client.put("/api/v1/me/game-state", json={"state": state})

    assert saved.status_code == 200
    assert saved.json()["state"] == state
    loaded = await api_client.get("/api/v1/me/game-state")
    assert loaded.status_code == 200
    assert loaded.json()["state"] == state


async def test_game_state_requires_identity(api_client) -> None:
    response = await api_client.get("/api/v1/me/game-state")
    assert response.status_code == 401


async def test_game_state_requires_an_existing_social_user(api_client) -> None:
    api_client.headers["X-KTown-User-Id"] = "google:missing"
    response = await api_client.put(
        "/api/v1/me/game-state", json={"state": {"version": 3}}
    )
    assert response.status_code == 404
