"""Persistent check-in HTTP routes."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Header, Request, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..checkin_application import CheckInApplication
from ..infrastructure.models import CheckInSessionModel, SubmissionModel
from ..photo_storage import PrivatePhotoStorage
from .dependencies import get_session, get_user_id


router = APIRouter(prefix="/api/v1/checkins", tags=["check-ins"])
Session = Annotated[AsyncSession, Depends(get_session)]
UserId = Annotated[str, Depends(get_user_id)]


class CreateCheckInRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    place_id: UUID = Field(alias="placeId")


class CheckInResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    place_id: UUID = Field(serialization_alias="placeId")
    status: str
    expires_at: str = Field(serialization_alias="expiresAt")

    @classmethod
    def from_model(cls, model: CheckInSessionModel) -> "CheckInResponse":
        return cls(
            id=model.id,
            place_id=model.place_id,
            status=model.status,
            expires_at=model.expires_at.isoformat().replace("+00:00", "Z"),
        )


class GpsRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sequence: int = Field(gt=0)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy_meters: float = Field(alias="accuracyMeters", ge=0)
    captured_at: datetime = Field(alias="capturedAt")


class GpsResponse(BaseModel):
    id: UUID
    sequence: int


class PhotoResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: UUID
    storage_key: str = Field(serialization_alias="storageKey")


class SubmissionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    session_id: UUID = Field(serialization_alias="sessionId")
    decision: Literal["pending"]
    submitted_at: str = Field(serialization_alias="submittedAt")

    @classmethod
    def from_model(cls, model: SubmissionModel) -> "SubmissionResponse":
        return cls(
            id=model.id,
            session_id=model.session_id,
            decision="pending",
            submitted_at=model.submitted_at.isoformat().replace("+00:00", "Z"),
        )


@router.post("", response_model=CheckInResponse, status_code=status.HTTP_201_CREATED)
async def create_checkin(
    payload: CreateCheckInRequest,
    session: Session,
    user_id: UserId,
) -> CheckInResponse:
    checkin = await CheckInApplication(session).create_session(user_id, payload.place_id)
    return CheckInResponse.from_model(checkin)


@router.get("/{session_id}", response_model=CheckInResponse)
async def get_checkin(
    session_id: UUID,
    session: Session,
    user_id: UserId,
) -> CheckInResponse:
    checkin = await CheckInApplication(session).get_session(user_id, session_id)
    return CheckInResponse.from_model(checkin)


@router.post(
    "/{session_id}/gps", response_model=GpsResponse, status_code=status.HTTP_201_CREATED
)
async def add_gps(
    session_id: UUID,
    payload: GpsRequest,
    session: Session,
    user_id: UserId,
) -> GpsResponse:
    sample = await CheckInApplication(session).add_gps(
        user_id,
        session_id,
        sequence=payload.sequence,
        latitude=payload.latitude,
        longitude=payload.longitude,
        accuracy_meters=payload.accuracy_meters,
        captured_at=payload.captured_at,
    )
    return GpsResponse(id=sample.id, sequence=sample.sequence)


@router.post(
    "/{session_id}/photo",
    response_model=PhotoResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_photo(
    session_id: UUID,
    request: Request,
    session: Session,
    user_id: UserId,
    file: Annotated[UploadFile, File()],
    captured_at: Annotated[datetime, Form(alias="capturedAt")],
) -> PhotoResponse:
    storage: PrivatePhotoStorage = request.app.state.photo_storage
    stored = await storage.store(session_id, file)
    try:
        photo = await CheckInApplication(session).add_photo(
            user_id,
            session_id,
            storage_key=stored.storage_key,
            content_type=stored.content_type,
            size_bytes=stored.size_bytes,
            sha256=stored.sha256,
            captured_at=captured_at,
        )
    except Exception:
        storage.delete(stored.storage_key)
        raise
    return PhotoResponse(id=photo.id, storage_key=photo.storage_key)


@router.post(
    "/{session_id}/submit",
    response_model=SubmissionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_checkin(
    session_id: UUID,
    session: Session,
    user_id: UserId,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key")],
) -> SubmissionResponse:
    submission = await CheckInApplication(session).submit(
        user_id, session_id, idempotency_key
    )
    return SubmissionResponse.from_model(submission)
