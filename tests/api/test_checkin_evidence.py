GPS_PAYLOAD = {
    "sequence": 1,
    "latitude": 35.0975,
    "longitude": 129.0106,
    "accuracyMeters": 20,
    "capturedAt": "2026-08-21T10:00:00Z",
}

PHOTO_BYTES = b"\xff\xd8\xff\xe0checkin-photo"


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


async def test_photo_endpoint_rejects_client_supplied_metadata_json(
    member_client, public_place
) -> None:
    session_id = await _create_session(member_client, public_place)

    response = await member_client.post(
        f"/api/v1/checkins/{session_id}/photo",
        json={"storageKey": "private/client-controlled.jpg", "sha256": "bad"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


async def test_session_becomes_ready_only_after_gps_and_photo(
    member_client, public_place
) -> None:
    session_id = await _create_session(member_client, public_place)

    gps = await member_client.post(
        f"/api/v1/checkins/{session_id}/gps", json=GPS_PAYLOAD
    )
    after_gps = await member_client.get(f"/api/v1/checkins/{session_id}")
    photo = await member_client.post(
        f"/api/v1/checkins/{session_id}/photo",
        files={"file": ("camera.jpg", PHOTO_BYTES, "image/jpeg")},
        data={"capturedAt": "2026-08-21T10:00:01Z"},
    )
    after_photo = await member_client.get(f"/api/v1/checkins/{session_id}")

    assert gps.status_code == 201
    assert after_gps.json()["status"] == "collecting"
    assert photo.status_code == 201
    assert after_photo.json()["status"] == "ready"


async def test_client_photo_filename_cannot_control_storage_key(member_client, public_place) -> None:
    session_id = await _create_session(member_client, public_place)

    response = await member_client.post(
        f"/api/v1/checkins/{session_id}/photo",
        files={"file": ("../../public/photo.jpg", PHOTO_BYTES, "image/jpeg")},
        data={"capturedAt": "2026-08-21T10:00:01Z"},
    )

    assert response.status_code == 201
    assert ".." not in response.json()["storageKey"]
    assert "public/photo.jpg" not in response.json()["storageKey"]
