"""Persistent check-in HTTP routes."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..checkin_application import CheckInApplication
from ..infrastructure.models import CheckInSessionModel
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


class PhotoRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    storage_key: str = Field(alias="storageKey", min_length=1, max_length=500)
    content_type: Literal["image/jpeg", "image/png", "image/webp"] = Field(
        alias="contentType"
    )
    size_bytes: int = Field(alias="sizeBytes", ge=1, le=10 * 1024 * 1024)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    captured_at: datetime = Field(alias="capturedAt")


class PhotoResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: UUID
    storage_key: str = Field(serialization_alias="storageKey")


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
    payload: PhotoRequest,
    session: Session,
    user_id: UserId,
) -> PhotoResponse:
    photo = await CheckInApplication(session).add_photo(
        user_id,
        session_id,
        storage_key=payload.storage_key,
        content_type=payload.content_type,
        size_bytes=payload.size_bytes,
        sha256=payload.sha256,
        captured_at=payload.captured_at,
    )
    return PhotoResponse(id=photo.id, storage_key=photo.storage_key)
