"""Public persistent place discovery routes."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..infrastructure.models import PlaceModel
from ..infrastructure.repositories import PlaceRepository
from .dependencies import get_session
from .errors import ApiError


router = APIRouter(prefix="/api/v1/places", tags=["places"])
Session = Annotated[AsyncSession, Depends(get_session)]


class PlaceResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    content_id: str | None = Field(serialization_alias="contentId")
    name_ko: str = Field(serialization_alias="nameKo")
    address_ko: str = Field(serialization_alias="addressKo")
    latitude: float
    longitude: float
    region_code: str = Field(serialization_alias="regionCode")
    description_ko: str = Field(serialization_alias="descriptionKo")

    @classmethod
    def from_model(cls, model: PlaceModel) -> "PlaceResponse":
        return cls(
            id=model.id,
            content_id=model.content_id,
            name_ko=model.name_ko,
            address_ko=model.address_ko,
            latitude=float(model.latitude),
            longitude=float(model.longitude),
            region_code=model.region_code,
            description_ko=model.description_ko,
        )


class PlaceListResponse(BaseModel):
    items: list[PlaceResponse]


@router.get("", response_model=PlaceListResponse)
async def list_places(session: Session) -> PlaceListResponse:
    places = await PlaceRepository(session).list_public()
    return PlaceListResponse(items=[PlaceResponse.from_model(place) for place in places])


@router.get("/{place_id}", response_model=PlaceResponse)
async def get_place(place_id: UUID, session: Session) -> PlaceResponse:
    place = await PlaceRepository(session).get_public(place_id)
    if place is None:
        raise ApiError(404, "PLACE_NOT_FOUND", "장소를 찾을 수 없습니다.")
    return PlaceResponse.from_model(place)
