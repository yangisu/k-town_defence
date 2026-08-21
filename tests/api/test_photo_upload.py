from pathlib import Path


JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"real-camera-bytes"


async def _create_session(member_client, public_place) -> str:
    response = await member_client.post(
        "/api/v1/checkins", json={"placeId": str(public_place.id)}
    )
    return response.json()["id"]


async def test_photo_upload_derives_metadata_and_stores_privately(
    member_client, public_place, upload_dir: Path
) -> None:
    session_id = await _create_session(member_client, public_place)

    response = await member_client.post(
        f"/api/v1/checkins/{session_id}/photo",
        files={"file": ("camera.jpg", JPEG_BYTES, "image/jpeg")},
        data={"capturedAt": "2026-08-21T10:00:00Z"},
    )

    assert response.status_code == 201
    storage_key = response.json()["storageKey"]
    assert "camera.jpg" not in storage_key
    assert ".." not in storage_key
    assert (upload_dir / storage_key).read_bytes() == JPEG_BYTES


async def test_photo_upload_rejects_mime_magic_mismatch_without_file(
    member_client, public_place, upload_dir: Path
) -> None:
    session_id = await _create_session(member_client, public_place)

    response = await member_client.post(
        f"/api/v1/checkins/{session_id}/photo",
        files={"file": ("fake.jpg", b"not-a-jpeg", "image/jpeg")},
        data={"capturedAt": "2026-08-21T10:00:00Z"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_PHOTO"
    assert not upload_dir.exists() or not list(upload_dir.rglob("*"))
