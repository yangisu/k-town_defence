from uuid import UUID, uuid4

from sqlalchemy import select

from ktown_defense.infrastructure.database import create_engine_and_session_factory
from ktown_defense.infrastructure.models import CheckInSessionModel, SubmissionModel
from tests.conftest import DATABASE_URL


async def test_http_checkin_flow_survives_a_fresh_database_connection(
    member_client, public_place
) -> None:
    created = await member_client.post(
        "/api/v1/checkins", json={"placeId": str(public_place.id)}
    )
    session_id = created.json()["id"]
    assert created.status_code == 201

    for sequence, accuracy in enumerate((24, 22, 20), start=1):
        response = await member_client.post(
            f"/api/v1/checkins/{session_id}/gps",
            json={
                "sequence": sequence,
                "latitude": 35.0975,
                "longitude": 129.0106,
                "accuracyMeters": accuracy,
                "capturedAt": "2026-08-21T10:00:00Z",
            },
        )
        assert response.status_code == 201

    photo = await member_client.post(
        f"/api/v1/checkins/{session_id}/photo",
        json={
            "storageKey": f"private/{session_id}/photo.jpg",
            "contentType": "image/jpeg",
            "sizeBytes": 1024,
            "sha256": "c" * 64,
            "capturedAt": "2026-08-21T10:00:01Z",
        },
    )
    assert photo.status_code == 201

    submitted = await member_client.post(
        f"/api/v1/checkins/{session_id}/submit",
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert submitted.status_code == 201
    assert submitted.json()["decision"] == "pending"

    engine, sessions = create_engine_and_session_factory(DATABASE_URL)
    try:
        async with sessions() as session:
            checkin = await session.get(CheckInSessionModel, UUID(session_id))
            persisted_submission = await session.scalar(
                select(SubmissionModel).where(
                    SubmissionModel.session_id == UUID(session_id)
                )
            )
            assert checkin is not None
            assert checkin.status == "submitted"
            assert persisted_submission is not None
            assert persisted_submission.decision == "pending"
    finally:
        await engine.dispose()
