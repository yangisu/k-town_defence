"""Public explainable expedition and safe open-data status routes."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, ConfigDict, Field, StrictStr, field_validator, model_validator
from sqlalchemy import func, select

from ..expedition_recommendation import ExpeditionRecommendationService
from ..expedition_application import ExpeditionApplication
from ..infrastructure.models import (
    CatalogSyncRunModel,
    ExpeditionModel,
    OpenApiCallLogModel,
    PlaceModel,
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
    kind: str = "anchor"
    placement: str = "main"
    required: bool = True
    selected_by_default: bool = Field(default=True, serialization_alias="selectedByDefault")
    evidence: dict[str, object] | None = None


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
    route_key: str | None = Field(default=None, serialization_alias="routeKey")
    route_version: str | None = Field(default=None, serialization_alias="routeVersion")


class CreateExpeditionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    recommendation_id: str = Field(alias="recommendationId", min_length=1, max_length=64)
    region_code: str = Field(default="6", alias="regionCode", min_length=1, max_length=20)
    keyword: str | None = Field(default=None, max_length=100)
    travel_date: date = Field(alias="travelDate")
    limit: int = Field(default=5, ge=3, le=5)
    route_key: StrictStr | None = Field(default=None, alias="routeKey", min_length=1, max_length=64)
    route_version: StrictStr | None = Field(
        default=None, alias="routeVersion", min_length=1, max_length=200,
        pattern=r"^[A-Za-z0-9:._-]+$",
    )
    selected_recommendation_place_ids: list[UUID] | None = Field(
        default=None, alias="selectedRecommendationPlaceIds", max_length=3
    )

    @field_validator("route_key")
    @classmethod
    def validate_route_key(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized or not __import__("re").fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", normalized):
            raise ValueError("invalid routeKey")
        return normalized

    @field_validator("selected_recommendation_place_ids")
    @classmethod
    def unique_selections(cls, value: list[UUID] | None) -> list[UUID] | None:
        if value is not None and len(set(value)) != len(value):
            raise ValueError("selectedRecommendationPlaceIds must be unique")
        return value

    @model_validator(mode="after")
    def require_bts_fields(self):
        if self.route_key == "bts-busan" and (
            self.route_version is None or self.selected_recommendation_place_ids is None
        ):
            raise ValueError("routeVersion and selectedRecommendationPlaceIds are required")
        return self


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
    route_key: str | None = Field(default=None, serialization_alias="routeKey")
    route_version: str | None = Field(default=None, serialization_alias="routeVersion")


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
    route_key: Annotated[str | None, Query(alias="routeKey", min_length=1, max_length=64, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")] = None,
) -> RecommendedExpeditionResponse:
    try:
        recommendation, models = await ExpeditionRecommendationService().recommend(
            session,
            region_code=region_code,
            keyword=keyword,
            travel_date=travel_date or datetime.now(ZoneInfo("Asia/Seoul")).date(),
            limit=limit,
            route_key=route_key,
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
        if str(exc) == "route not supported":
            raise ApiError(404, "ROUTE_NOT_SUPPORTED", "지원하지 않는 원정 경로입니다.") from exc
        raise
    return RecommendedExpeditionResponse(
        id=recommendation.id,
        title="부산 로컬 원정" if region_code == "6" else "지역 로컬 원정",
        region_code=region_code,
        keyword=recommendation.keyword,
        travel_date=recommendation.travel_date,
        data_updated_at=_iso(recommendation.data_updated_at),
        route_key=recommendation.route_key,
        route_version=recommendation.route_version,
        stops=[
            ExpeditionStopResponse(
                order=index,
                distance_km=stop.distance_km,
                reasons=list(stop.reasons),
                place=ExpeditionPlaceResponse.from_model(models[stop.candidate.id]),
                kind=stop.kind,
                placement=stop.placement,
                required=stop.required,
                selected_by_default=stop.selected_by_default,
                evidence=stop.evidence,
            )
            for index, stop in enumerate(recommendation.stops, start=1)
        ],
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
            route_key=payload.route_key,
            route_version=payload.route_version,
            selected_recommendation_place_ids=payload.selected_recommendation_place_ids,
        )
    except ValueError as exc:
        if str(exc) == "route not supported":
            raise ApiError(404, "ROUTE_NOT_SUPPORTED", "지원하지 않는 원정 경로입니다.") from exc
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
        route_key=expedition.route_key,
        route_version=expedition.route_version,
        stops=[
            StoredExpeditionStopResponse(
                order=stop.stop_order,
                distance_km=float(stop.distance_km),
                reasons=list(stop.reasons),
                place=ExpeditionPlaceResponse.from_model(place),
                completed_at=_iso(stop.completed_at),
                kind=stop.stop_kind,
                placement=stop.placement,
                required=stop.is_required,
                selected_by_default=True,
                evidence=(stop.recommendation_metadata or None),
            )
            for stop, place in stops
        ],
    )
