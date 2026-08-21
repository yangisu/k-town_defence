"""Persistent check-in HTTP routes."""

from typing import Annotated
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
