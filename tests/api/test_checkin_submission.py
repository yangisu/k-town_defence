from uuid import uuid4

from sqlalchemy import select

from ktown_defense.infrastructure.database import create_engine_and_session_factory
from ktown_defense.infrastructure.models import SubmissionModel
from tests.conftest import DATABASE_URL


GPS_PAYLOAD = {
    "sequence": 1,
    "latitude": 35.0975,
    "longitude": 129.0106,
    "accuracyMeters": 20,
    "capturedAt": "2026-08-21T10:00:00Z",
}
PHOTO_PAYLOAD = {
    "storageKey": "private/member-1/session/submission.jpg",
    "contentType": "image/jpeg",
    "sizeBytes": 1024,
    "sha256": "b" * 64,
    "capturedAt": "2026-08-21T10:00:01Z",
}


async def _create_session(member_client, public_place) -> str:
    response = await member_client.post(
        "/api/v1/checkins", json={"placeId": str(public_place.id)}
    )
    return response.json()["id"]


async def _make_ready(member_client, session_id: str) -> None:
    assert (
        await member_client.post(
            f"/api/v1/checkins/{session_id}/gps", json=GPS_PAYLOAD
        )
    ).status_code == 201
    assert (
        await member_client.post(
            f"/api/v1/checkins/{session_id}/photo", json=PHOTO_PAYLOAD
        )
    ).status_code == 201


async def test_collecting_session_cannot_submit(member_client, public_place) -> None:
    session_id = await _create_session(member_client, public_place)

    response = await member_client.post(
        f"/api/v1/checkins/{session_id}/submit",
        headers={"Idempotency-Key": str(uuid4())},
    )

    assert response.status_code == 409
    assert response.json()["code"] == "CHECKIN_NOT_READY"


async def test_ready_session_submits_once_as_pending(member_client, public_place) -> None:
    session_id = await _create_session(member_client, public_place)
    await _make_ready(member_client, session_id)
    key = str(uuid4())

    first = await member_client.post(
        f"/api/v1/checkins/{session_id}/submit",
        headers={"Idempotency-Key": key},
    )
    second = await member_client.post(
        f"/api/v1/checkins/{session_id}/submit",
        headers={"Idempotency-Key": key},
    )

    assert first.status_code == second.status_code == 201
    assert first.json() == second.json()
    assert first.json()["decision"] == "pending"
    assert "awardedPoints" not in first.json()


async def test_different_key_cannot_resubmit(member_client, public_place) -> None:
    session_id = await _create_session(member_client, public_place)
    await _make_ready(member_client, session_id)
    await member_client.post(
        f"/api/v1/checkins/{session_id}/submit",
        headers={"Idempotency-Key": str(uuid4())},
    )

    response = await member_client.post(
        f"/api/v1/checkins/{session_id}/submit",
        headers={"Idempotency-Key": str(uuid4())},
    )

    assert response.status_code == 409
    assert response.json()["code"] == "CHECKIN_ALREADY_SUBMITTED"


async def test_submission_survives_a_fresh_engine(member_client, public_place) -> None:
    session_id = await _create_session(member_client, public_place)
    await _make_ready(member_client, session_id)
    response = await member_client.post(
        f"/api/v1/checkins/{session_id}/submit",
        headers={"Idempotency-Key": str(uuid4())},
    )

    engine, sessions = create_engine_and_session_factory(DATABASE_URL)
    try:
        async with sessions() as database_session:
            persisted = await database_session.scalar(
                select(SubmissionModel).where(
                    SubmissionModel.id == response.json()["id"]
                )
            )
            assert persisted is not None
            assert persisted.decision == "pending"
    finally:
        await engine.dispose()
