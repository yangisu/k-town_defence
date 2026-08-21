"""Public explainable expedition and safe open-data status routes."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select

from ..expedition_recommendation import ExpeditionRecommendationService
from ..infrastructure.models import (
    CatalogSyncRunModel,
    OpenApiCallLogModel,
    PlaceModel,
)
from .dependencies import get_session
from .errors import ApiError
from .place_routes import PlaceResponse
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession


router = APIRouter(tags=["expeditions"])
Session = Annotated[AsyncSession, Depends(get_session)]


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
