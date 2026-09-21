"""Public explainable expedition and safe open-data status routes."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select

from ..expedition_recommendation import ExpeditionRecommendationService
from ..expedition_application import ExpeditionApplication
from ..infrastructure.models import (
    CatalogSyncRunModel,
    ExpeditionModel,
    OpenApiCallLogModel,
    PlaceModel,
)
from ..related_attractions import (
    RelatedAttraction,
    RelatedAttractionService,
    RouteAttractionRecommendation,
)
from .dependencies import get_session, get_user_id
from .errors import ApiError
from .place_routes import PlaceResponse
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession


router = APIRouter(tags=["expeditions"])
Session = Annotated[AsyncSession, Depends(get_session)]
UserId = Annotated[str, Depends(get_user_id)]


class ExpeditionStopResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    order: int
    distance_km: float = Field(serialization_alias="distanceKm")
    reasons: list[str]
    place: "ExpeditionPlaceResponse"


class ExpeditionPlaceResponse(PlaceResponse):
    homepage_url: str | None = Field(serialization_alias="homepageUrl")
    telephone: str | None
    open_time: str | None = Field(serialization_alias="openTime")
    rest_date: str | None = Field(serialization_alias="restDate")
    parking: str | None
    image_urls: list[str] = Field(serialization_alias="imageUrls")
    festival_start_date: date | None = Field(serialization_alias="festivalStartDate")
    festival_end_date: date | None = Field(serialization_alias="festivalEndDate")
    discovery_keywords: list[str] = Field(serialization_alias="discoveryKeywords")
    source_operations: list[str] = Field(serialization_alias="sourceOperations")

    @classmethod
    def from_model(cls, model: PlaceModel) -> "ExpeditionPlaceResponse":
        base = PlaceResponse.from_model(model)
        return cls(
            **base.model_dump(),
            homepage_url=model.homepage_url,
            telephone=model.telephone,
            open_time=model.open_time,
            rest_date=model.rest_date,
            parking=model.parking,
            image_urls=list(model.image_urls or ()),
            festival_start_date=model.festival_start_date,
            festival_end_date=model.festival_end_date,
            discovery_keywords=list(model.discovery_keywords or ()),
            source_operations=list(model.source_operations or ()),
        )


class RecommendedExpeditionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    title: str
    region_code: str = Field(serialization_alias="regionCode")
    keyword: str | None
    travel_date: date = Field(serialization_alias="travelDate")
    data_updated_at: str | None = Field(serialization_alias="dataUpdatedAt")
    stops: list[ExpeditionStopResponse]


class CreateExpeditionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    recommendation_id: str = Field(alias="recommendationId", min_length=1, max_length=64)
    region_code: str = Field(default="6", alias="regionCode", min_length=1, max_length=20)
    keyword: str | None = Field(default=None, max_length=100)
    travel_date: date = Field(alias="travelDate")
    limit: int = Field(default=5, ge=3, le=5)


class StoredExpeditionStopResponse(ExpeditionStopResponse):
    completed_at: str | None = Field(serialization_alias="completedAt")


class StoredExpeditionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    recommendation_id: str = Field(serialization_alias="recommendationId")
    region_code: str = Field(serialization_alias="regionCode")
    territory_id: str | None = Field(serialization_alias="territoryId")
    title: str
    keyword: str | None
    travel_date: date = Field(serialization_alias="travelDate")
    status: str
    created_at: str = Field(serialization_alias="createdAt")
    completed_at: str | None = Field(serialization_alias="completedAt")
    stops: list[StoredExpeditionStopResponse]


class OperationStatusResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    operation: str
    last_succeeded_at: str = Field(serialization_alias="lastSucceededAt")
    response_count: int = Field(serialization_alias="responseCount")


class OpenDataStatusResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    label: str
    last_successful_sync_at: str | None = Field(serialization_alias="lastSuccessfulSyncAt")
    active_place_count: int = Field(serialization_alias="activePlaceCount")
    operations: list[OperationStatusResponse]


class RelatedAttractionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    content_id: str = Field(serialization_alias="contentId")
    name_ko: str = Field(serialization_alias="nameKo")
    latitude: float
    longitude: float
    distance_km: float = Field(serialization_alias="distanceKm")
    category: str | None = None
    image_url: str | None = Field(default=None, serialization_alias="imageUrl")
    address_ko: str | None = Field(default=None, serialization_alias="addressKo")
    source: str


class RelatedAttractionsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    items: list[RelatedAttractionResponse]


class RouteAttractionResponse(RelatedAttractionResponse):
    placement: str
    detour_km: float | None = Field(default=None, serialization_alias="detourKm")
    via_distance_km: float | None = Field(default=None, serialization_alias="viaDistanceKm")
    reasons: list[str]


class RouteAttractionsResponse(BaseModel):
    items: list[RouteAttractionResponse]


@router.get(
    "/api/v1/expeditions/recommended",
    response_model=RecommendedExpeditionResponse,
)
async def recommended_expedition(
    session: Session,
    region_code: Annotated[str, Query(alias="regionCode", min_length=1, max_length=20)] = "6",
    keyword: Annotated[str | None, Query(max_length=100)] = None,
    travel_date: Annotated[date | None, Query(alias="travelDate")] = None,
    limit: Annotated[int, Query(ge=3, le=5)] = 5,
) -> RecommendedExpeditionResponse:
    try:
        recommendation, models = await ExpeditionRecommendationService().recommend(
            session,
            region_code=region_code,
            keyword=keyword,
            travel_date=travel_date or datetime.now(ZoneInfo("Asia/Seoul")).date(),
            limit=limit,
        )
    except ValueError as exc:
        if str(exc) in {
            "no expedition candidates",
            "at least three expedition candidates are required",
        }:
            raise ApiError(
                404,
                "EXPEDITION_NOT_AVAILABLE",
                "추천할 수 있는 지역 원정이 없습니다.",
            ) from exc
        raise
    return RecommendedExpeditionResponse(
        id=recommendation.id,
        title="부산 로컬 원정" if region_code == "6" else "지역 로컬 원정",
        region_code=region_code,
        keyword=recommendation.keyword,
        travel_date=recommendation.travel_date,
        data_updated_at=_iso(recommendation.data_updated_at),
        stops=[
            ExpeditionStopResponse(
                order=index,
                distance_km=stop.distance_km,
                reasons=list(stop.reasons),
                place=ExpeditionPlaceResponse.from_model(models[stop.candidate.id]),
            )
            for index, stop in enumerate(recommendation.stops, start=1)
        ],
    )


@router.get(
    "/api/v1/tourism/nearby-attractions",
    response_model=RelatedAttractionsResponse,
)
async def nearby_attractions(
    request: Request,
    name: Annotated[str, Query(min_length=1, max_length=200)],
    latitude: Annotated[float | None, Query(ge=-90, le=90)] = None,
    longitude: Annotated[float | None, Query(ge=-180, le=180)] = None,
    region_code: Annotated[str | None, Query(alias="regionCode", max_length=20)] = None,
    exclude_name: Annotated[list[str], Query(alias="excludeName", max_length=200)] = [],
) -> RelatedAttractionsResponse:
    service: RelatedAttractionService = request.app.state.related_attraction_service
    items: tuple[RelatedAttraction, ...] = await service.get_for_place(
        name_ko=name,
        latitude=latitude,
        longitude=longitude,
        region_code=region_code,
        excluded_names=tuple(exclude_name),
    )
    return RelatedAttractionsResponse(
        items=[RelatedAttractionResponse(**item.__dict__) for item in items],
    )


@router.get(
    "/api/v1/tourism/route-attractions",
    response_model=RouteAttractionsResponse,
)
async def route_attractions(
    request: Request,
    first_name: Annotated[str, Query(alias="firstName", min_length=1, max_length=200)],
    first_latitude: Annotated[float, Query(alias="firstLatitude", ge=-90, le=90)],
    first_longitude: Annotated[float, Query(alias="firstLongitude", ge=-180, le=180)],
    second_name: Annotated[str, Query(alias="secondName", min_length=1, max_length=200)],
    second_latitude: Annotated[float, Query(alias="secondLatitude", ge=-90, le=90)],
    second_longitude: Annotated[float, Query(alias="secondLongitude", ge=-180, le=180)],
    exclude_name: Annotated[list[str], Query(alias="excludeName", max_length=200)] = [],
) -> RouteAttractionsResponse:
    service: RelatedAttractionService = request.app.state.related_attraction_service
    items: tuple[RouteAttractionRecommendation, ...] = await service.get_for_route(
        first_name_ko=first_name,
        first_latitude=first_latitude,
        first_longitude=first_longitude,
        second_name_ko=second_name,
        second_latitude=second_latitude,
        second_longitude=second_longitude,
        excluded_names=tuple(exclude_name),
    )
    return RouteAttractionsResponse(
        items=[
            RouteAttractionResponse(
                **item.attraction.__dict__,
                placement=item.placement,
                detour_km=item.detour_km,
                via_distance_km=item.via_distance_km,
                reasons=list(item.reasons),
            )
            for item in items
        ]
    )


@router.post(
    "/api/v1/expeditions",
    response_model=StoredExpeditionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_expedition(
    payload: CreateExpeditionRequest,
    session: Session,
    user_id: UserId,
) -> StoredExpeditionResponse:
    try:
        application = ExpeditionApplication(session)
        expedition = await application.create(
            user_id,
            recommendation_id=payload.recommendation_id,
            region_code=payload.region_code,
            keyword=payload.keyword,
            travel_date=payload.travel_date,
            limit=payload.limit,
        )
    except ValueError as exc:
        raise ApiError(404, "EXPEDITION_NOT_AVAILABLE", "추천할 수 있는 지역 원정이 없습니다.") from exc
    return await _stored_response(application, expedition)


@router.get(
    "/api/v1/expeditions/current",
    response_model=StoredExpeditionResponse | None,
)
async def current_expedition(session: Session, user_id: UserId):
    application = ExpeditionApplication(session)
    expedition = await application.current(user_id)
    return None if expedition is None else await _stored_response(application, expedition)


@router.get(
    "/api/v1/expeditions/{expedition_id}",
    response_model=StoredExpeditionResponse,
)
async def get_expedition(expedition_id: UUID, session: Session, user_id: UserId):
    application = ExpeditionApplication(session)
    return await _stored_response(application, await application.get_owned(user_id, expedition_id))


@router.post(
    "/api/v1/expeditions/{expedition_id}/abandon",
    response_model=StoredExpeditionResponse,
)
async def abandon_expedition(expedition_id: UUID, session: Session, user_id: UserId):
    application = ExpeditionApplication(session)
    expedition = await application.finish(user_id, expedition_id, "abandoned")
    return await _stored_response(application, expedition)


@router.post(
    "/api/v1/expeditions/{expedition_id}/complete",
    response_model=StoredExpeditionResponse,
)
async def complete_expedition(expedition_id: UUID, session: Session, user_id: UserId):
    application = ExpeditionApplication(session)
    expedition = await application.finish(user_id, expedition_id, "completed")
    return await _stored_response(application, expedition)


@router.get("/api/v1/open-data/status", response_model=OpenDataStatusResponse)
async def open_data_status(session: Session) -> OpenDataStatusResponse:
    latest_run = await session.scalar(
        select(CatalogSyncRunModel)
        .where(
            CatalogSyncRunModel.source == "KTOUR_API",
            CatalogSyncRunModel.status == "succeeded",
            CatalogSyncRunModel.id.in_(select(OpenApiCallLogModel.sync_run_id)),
        )
        .order_by(CatalogSyncRunModel.completed_at.desc())
        .limit(1)
    )
    active_count = int(
        await session.scalar(
            select(func.count(PlaceModel.id)).where(
                PlaceModel.source == "KTOUR_API",
                PlaceModel.is_public.is_(True),
                PlaceModel.is_active.is_(True),
            )
        )
        or 0
    )
    operations: list[OperationStatusResponse] = []
    if latest_run is not None:
        rows = (
            await session.execute(
                select(
                    OpenApiCallLogModel.operation,
                    func.max(OpenApiCallLogModel.completed_at),
                    func.sum(OpenApiCallLogModel.response_count),
                )
                .where(
                    OpenApiCallLogModel.sync_run_id == latest_run.id,
                    OpenApiCallLogModel.status == "succeeded",
                )
                .group_by(OpenApiCallLogModel.operation)
                .order_by(OpenApiCallLogModel.operation)
            )
        ).all()
        operations = [
            OperationStatusResponse(
                operation=operation,
                last_succeeded_at=_iso(completed_at) or "",
                response_count=int(response_count or 0),
            )
            for operation, completed_at, response_count in rows
        ]
    return OpenDataStatusResponse(
        label="관광 OpenAPI",
        last_successful_sync_at=_iso(latest_run.completed_at) if latest_run else None,
        active_place_count=active_count,
        operations=operations,
    )


def _iso(value) -> str | None:
    return value.isoformat().replace("+00:00", "Z") if value else None


async def _stored_response(
    application: ExpeditionApplication, expedition: ExpeditionModel
) -> StoredExpeditionResponse:
    stops = await application.stops(expedition.id)
    return StoredExpeditionResponse(
        id=expedition.id,
        recommendation_id=expedition.recommendation_id,
        region_code=expedition.region_code,
        territory_id=expedition.territory_id,
        title=expedition.title,
        keyword=expedition.keyword,
        travel_date=expedition.travel_date,
        status=expedition.status,
        created_at=_iso(expedition.created_at) or "",
        completed_at=_iso(expedition.completed_at),
        stops=[
            StoredExpeditionStopResponse(
                order=stop.stop_order,
                distance_km=float(stop.distance_km),
                reasons=list(stop.reasons),
                place=ExpeditionPlaceResponse.from_model(place),
                completed_at=_iso(stop.completed_at),
            )
            for stop, place in stops
        ],
    )
