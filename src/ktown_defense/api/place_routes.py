"""Public persistent place discovery routes."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
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
    content_type_id: str | None = Field(serialization_alias="contentTypeId")
    category_code: str | None = Field(serialization_alias="categoryCode")
    category: str
    image_url: str | None = Field(serialization_alias="imageUrl")
    synced_at: str | None = Field(serialization_alias="syncedAt")

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
            content_type_id=model.content_type_id,
            category_code=model.category_code,
            category=category_for(model.content_type_id),
            image_url=model.image_url,
            synced_at=(
                model.synced_at.isoformat().replace("+00:00", "Z")
                if model.synced_at
                else None
            ),
        )


class PlaceListResponse(BaseModel):
    items: list[PlaceResponse]
    total: int
    limit: int
    offset: int


def category_for(content_type_id: str | None) -> str:
    if content_type_id == "15":
        return "event"
    if content_type_id == "39":
        return "local_food"
    return "culture"


@router.get("", response_model=PlaceListResponse)
async def list_places(
    session: Session,
    region_code: Annotated[str | None, Query(alias="regionCode", max_length=20)] = None,
    category: Annotated[
        Literal["culture", "event", "local_food", "kpop"] | None, Query()
    ] = None,
    query: Annotated[str | None, Query(max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PlaceListResponse:
    cleaned_query = query.strip() if query and query.strip() else None
    places, total = await PlaceRepository(session).search_public(
        region_code=region_code,
        category=category,
        query=cleaned_query,
        limit=limit,
        offset=offset,
    )
    return PlaceListResponse(
        items=[PlaceResponse.from_model(place) for place in places],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{place_id}", response_model=PlaceResponse)
async def get_place(place_id: UUID, session: Session) -> PlaceResponse:
    place = await PlaceRepository(session).get_public(place_id)
    if place is None:
        raise ApiError(404, "PLACE_NOT_FOUND", "장소를 찾을 수 없습니다.")
    return PlaceResponse.from_model(place)
