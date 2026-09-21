from uuid import UUID, uuid4

from sqlalchemy import select

from ktown_defense.infrastructure.database import create_engine_and_session_factory
from ktown_defense.infrastructure.models import SubmissionModel
from tests.conftest import DATABASE_URL


PLACE_LATITUDE = 35.0975
PLACE_LONGITUDE = 129.0106
PHOTO_BYTES = b"\xff\xd8\xff\xe0submission-photo"


async def _create_session(member_client, public_place) -> str:
    response = await member_client.post(
        "/api/v1/checkins", json={"placeId": str(public_place.id)}
    )
    return response.json()["id"]


async def _record_gps(
    member_client,
    session_id: str,
    *,
    latitude: float = PLACE_LATITUDE,
    longitude: float = PLACE_LONGITUDE,
    accuracy: float = 20,
) -> None:
    for sequence, captured_at in enumerate(
        ("2026-08-21T10:00:00Z", "2026-08-21T10:00:01Z", "2026-08-21T10:00:02Z"),
        start=1,
    ):
        response = await member_client.post(
            f"/api/v1/checkins/{session_id}/gps",
            json={
                "sequence": sequence,
                "latitude": latitude,
                "longitude": longitude,
                "accuracyMeters": accuracy,
                "capturedAt": captured_at,
            },
        )
        assert response.status_code == 201


async def _make_ready(
    member_client,
    session_id: str,
    *,
    latitude: float = PLACE_LATITUDE,
    longitude: float = PLACE_LONGITUDE,
    accuracy: float = 20,
    photo_bytes: bytes = PHOTO_BYTES,
) -> None:
    await _record_gps(
        member_client, session_id, latitude=latitude, longitude=longitude, accuracy=accuracy
    )
    assert (
        await member_client.post(
            f"/api/v1/checkins/{session_id}/photo",
            files={"file": ("camera.jpg", photo_bytes, "image/jpeg")},
            data={"capturedAt": "2026-08-21T10:00:03Z"},
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


async def test_demo_verification_bypasses_only_evidence_and_snapshots_membership(
    member_client, public_place, session_factory
) -> None:
    fandom_id = "10000000-0000-4000-8000-000000000001"
    membership = await member_client.put(
        "/api/v1/me/season-membership", json={"fandomId": fandom_id}
    )
    assert membership.status_code == 200
    created = await member_client.post(
        "/api/v1/checkins",
        json={"placeId": str(public_place.id), "verificationType": "demo"},
    )
    assert created.status_code == 201
    assert created.json()["status"] == "ready"
    assert created.json()["verificationType"] == "demo"

    response = await member_client.post(
        f"/api/v1/checkins/{created.json()['id']}/submit",
        headers={"Idempotency-Key": str(uuid4())},
    )

    assert response.status_code == 201
    assert response.json()["decision"] == "approved"
    assert response.json()["awardedPoints"] == 100
    async with session_factory() as session:
        persisted = await session.get(SubmissionModel, UUID(response.json()["id"]))
        assert persisted is not None
        assert str(persisted.fandom_id) == fandom_id
        assert persisted.season_id is not None
        assert persisted.territory_id == "busan"


async def test_practice_demo_uses_pipeline_without_awarding_points(member_client, public_place) -> None:
    created = await member_client.post(
        "/api/v1/checkins",
        json={"placeId": str(public_place.id), "verificationType": "demo", "practice": True},
    )
    response = await member_client.post(
        f"/api/v1/checkins/{created.json()['id']}/submit",
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert created.json()["practice"] is True
    assert response.json()["decision"] == "approved"
    assert response.json()["awardedPoints"] == 0


async def test_gps_inside_geofence_auto_approves_and_awards_first_visit_points(
    member_client, public_place
) -> None:
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
    assert first.json()["decision"] == "approved"
    assert first.json()["awardedPoints"] == 100
    assert first.json()["riskCodes"] == []


async def test_gps_far_from_place_is_rejected(member_client, public_place) -> None:
    session_id = await _create_session(member_client, public_place)
    await _make_ready(member_client, session_id, latitude=37.5665, longitude=126.9780)

    response = await member_client.post(
        f"/api/v1/checkins/{session_id}/submit",
        headers={"Idempotency-Key": str(uuid4())},
    )

    assert response.status_code == 201
    assert response.json()["decision"] == "rejected"
    assert response.json()["awardedPoints"] == 0
    assert "OUTSIDE_GEOFENCE" in response.json()["riskCodes"]


async def test_low_accuracy_gps_requires_review(member_client, public_place) -> None:
    session_id = await _create_session(member_client, public_place)
    await _make_ready(member_client, session_id, accuracy=80)

    response = await member_client.post(
        f"/api/v1/checkins/{session_id}/submit",
        headers={"Idempotency-Key": str(uuid4())},
    )

    assert response.status_code == 201
    assert response.json()["decision"] == "review_required"
    assert response.json()["awardedPoints"] == 0
    assert "LOW_ACCURACY" in response.json()["riskCodes"]


async def test_repeat_visit_to_same_place_awards_zero_points(
    member_client, public_place
) -> None:
    first_session = await _create_session(member_client, public_place)
    await _make_ready(member_client, first_session)
    first = await member_client.post(
        f"/api/v1/checkins/{first_session}/submit",
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert first.json()["decision"] == "approved"
    assert first.json()["awardedPoints"] == 100

    second_session = await _create_session(member_client, public_place)
    await _make_ready(
        member_client,
        second_session,
        photo_bytes=b"\xff\xd8\xff\xe0submission-photo-2",
    )
    second = await member_client.post(
        f"/api/v1/checkins/{second_session}/submit",
        headers={"Idempotency-Key": str(uuid4())},
    )

    assert second.json()["decision"] == "approved"
    assert second.json()["awardedPoints"] == 0


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
            assert persisted.decision == "approved"
            assert persisted.awarded_points == 100
    finally:
        await engine.dispose()
