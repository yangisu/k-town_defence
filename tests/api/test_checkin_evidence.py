GPS_PAYLOAD = {
    "sequence": 1,
    "latitude": 35.0975,
    "longitude": 129.0106,
    "accuracyMeters": 20,
    "capturedAt": "2026-08-21T10:00:00Z",
}

PHOTO_PAYLOAD = {
    "storageKey": "private/member-1/session/photo.jpg",
    "contentType": "image/jpeg",
    "sizeBytes": 1024,
    "sha256": "a" * 64,
    "capturedAt": "2026-08-21T10:00:01Z",
}


async def _create_session(member_client, public_place) -> str:
    response = await member_client.post(
        "/api/v1/checkins", json={"placeId": str(public_place.id)}
    )
    assert response.status_code == 201
    return response.json()["id"]


async def test_gps_sequence_must_increase(member_client, public_place) -> None:
    session_id = await _create_session(member_client, public_place)

    first = await member_client.post(
        f"/api/v1/checkins/{session_id}/gps", json=GPS_PAYLOAD
    )
    duplicate = await member_client.post(
        f"/api/v1/checkins/{session_id}/gps", json=GPS_PAYLOAD
    )

    assert first.status_code == 201
    assert first.json()["sequence"] == 1
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "GPS_SEQUENCE_CONFLICT"


async def test_photo_metadata_rejects_invalid_sha256(
    member_client, public_place
) -> None:
    session_id = await _create_session(member_client, public_place)

    response = await member_client.post(
        f"/api/v1/checkins/{session_id}/photo",
        json={**PHOTO_PAYLOAD, "sha256": "bad"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"
    assert response.json()["field"] == "sha256"


async def test_session_becomes_ready_only_after_gps_and_photo(
    member_client, public_place
) -> None:
    session_id = await _create_session(member_client, public_place)

    gps = await member_client.post(
        f"/api/v1/checkins/{session_id}/gps", json=GPS_PAYLOAD
    )
    after_gps = await member_client.get(f"/api/v1/checkins/{session_id}")
    photo = await member_client.post(
        f"/api/v1/checkins/{session_id}/photo", json=PHOTO_PAYLOAD
    )
    after_photo = await member_client.get(f"/api/v1/checkins/{session_id}")

    assert gps.status_code == 201
    assert after_gps.json()["status"] == "collecting"
    assert photo.status_code == 201
    assert after_photo.json()["status"] == "ready"


async def test_storage_key_traversal_is_rejected(member_client, public_place) -> None:
    session_id = await _create_session(member_client, public_place)

    response = await member_client.post(
        f"/api/v1/checkins/{session_id}/photo",
        json={**PHOTO_PAYLOAD, "storageKey": "../public/photo.jpg"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_STORAGE_KEY"
