from datetime import datetime, timezone


async def test_create_checkin_persists_a_thirty_minute_session(
    member_client, public_place
) -> None:
    response = await member_client.post(
        "/api/v1/checkins", json={"placeId": str(public_place.id)}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["placeId"] == str(public_place.id)
    assert body["status"] == "collecting"
    expires_at = datetime.fromisoformat(body["expiresAt"].replace("Z", "+00:00"))
    assert expires_at > datetime.now(timezone.utc)


async def test_second_create_reuses_active_user_place_session(
    member_client, public_place
) -> None:
    first = await member_client.post(
        "/api/v1/checkins", json={"placeId": str(public_place.id)}
    )
    second = await member_client.post(
        "/api/v1/checkins", json={"placeId": str(public_place.id)}
    )

    assert first.status_code == second.status_code == 201
    assert second.json()["id"] == first.json()["id"]


async def test_owner_can_retrieve_session(member_client, public_place) -> None:
    created = await member_client.post(
        "/api/v1/checkins", json={"placeId": str(public_place.id)}
    )

    response = await member_client.get(f"/api/v1/checkins/{created.json()['id']}")

    assert response.status_code == 200
    assert response.json() == created.json()


async def test_other_user_cannot_read_session(
    member_client, api_client, public_place
) -> None:
    created = await member_client.post(
        "/api/v1/checkins", json={"placeId": str(public_place.id)}
    )

    response = await api_client.get(
        f"/api/v1/checkins/{created.json()['id']}",
        headers={"X-KTown-User-Id": "other-user"},
    )

    assert response.status_code == 404
    assert response.json()["code"] == "CHECKIN_NOT_FOUND"


async def test_missing_identity_cannot_create_checkin(api_client, public_place) -> None:
    response = await api_client.post(
        "/api/v1/checkins",
        json={"placeId": str(public_place.id)},
        headers={"X-KTown-User-Id": ""},
    )

    assert response.status_code == 401
    assert response.json()["code"] == "IDENTITY_REQUIRED"
