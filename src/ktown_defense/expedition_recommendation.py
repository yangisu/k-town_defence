"""Deterministic, explainable regional expedition recommendations."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
import hashlib
import json
from math import asin, cos, radians, sin, sqrt
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .infrastructure.models import (
    CatalogSyncRunModel,
    CheckInSessionModel,
    OpenApiCallLogModel,
    PlaceModel,
)


@dataclass(frozen=True)
class ExpeditionCandidate:
    id: UUID
    content_id: str
    name_ko: str
    category: str
    latitude: float
    longitude: float
    discovery_keywords: tuple[str, ...]
    festival_start_date: date | None
    festival_end_date: date | None
    submitted_visit_count: int
    synced_at: datetime | None


@dataclass(frozen=True)
class ExpeditionRequest:
    region_code: str
    keyword: str | None
    travel_date: date
    limit: int

    def __post_init__(self) -> None:
        if not self.region_code.strip():
            raise ValueError("region_code is required")
        if self.limit < 3 or self.limit > 5:
            raise ValueError("limit must be between 3 and 5")


@dataclass(frozen=True)
class RecommendedStop:
    candidate: ExpeditionCandidate
    distance_km: float
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class RecommendedExpedition:
    id: str
    region_code: str
    keyword: str | None
    travel_date: date
    snapshot_version: str
    stops: tuple[RecommendedStop, ...]
    data_updated_at: datetime | None


def select_expedition(
    candidates: tuple[ExpeditionCandidate, ...],
    request: ExpeditionRequest,
    *,
    snapshot_version: str,
) -> RecommendedExpedition:
    if not candidates:
        raise ValueError("no expedition candidates")
    if len(candidates) < 3:
        raise ValueError("at least three expedition candidates are required")

    normalized_keyword = (request.keyword or "").strip().casefold()
    anchor = next(
        (
            candidate
            for candidate in sorted(candidates, key=lambda item: item.content_id)
            if normalized_keyword
            and (
                normalized_keyword in {value.casefold() for value in candidate.discovery_keywords}
                or normalized_keyword in candidate.name_ko.casefold()
            )
        ),
        None,
    )
    keyword_matched = anchor is not None
    if anchor is None:
        anchor = min(
            candidates,
            key=lambda item: (item.submitted_visit_count, item.content_id),
        )

    chosen = [anchor]
    used_categories = {anchor.category}
    remaining = [candidate for candidate in candidates if candidate.id != anchor.id]
    while remaining and len(chosen) < request.limit:
        selected = min(
            remaining,
            key=lambda item: (
                item.category in used_categories,
                _distance_km(anchor, item),
                item.submitted_visit_count,
                item.content_id,
            ),
        )
        chosen.append(selected)
        used_categories.add(selected.category)
        remaining.remove(selected)

    stops: list[RecommendedStop] = []
    seen_categories: set[str] = set()
    for index, candidate in enumerate(chosen):
        distance = _distance_km(anchor, candidate)
        if index == 0:
            reasons = ("키워드 일치",) if keyword_matched else ("지역 원정 시작점",)
        else:
            reason_list = [f"시작점 반경 {distance:.1f}km"]
            if candidate.category not in seen_categories:
                reason_list.append("다른 유형의 지역 명소")
            if _active_festival(candidate, request.travel_date):
                reason_list.append("여행일에 열리는 행사")
            if candidate.submitted_visit_count == 0:
                reason_list.append("아직 방문 기록이 적은 장소")
            reasons = tuple(reason_list)
        seen_categories.add(candidate.category)
        stops.append(RecommendedStop(candidate, round(distance, 3), reasons))

    canonical = json.dumps(
        {
            "regionCode": request.region_code,
            "keyword": normalized_keyword,
            "travelDate": request.travel_date.isoformat(),
            "snapshotVersion": snapshot_version,
            "contentIds": [item.content_id for item in chosen],
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    expedition_id = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:24]
    updated_at = max(
        (item.synced_at for item in chosen if item.synced_at is not None),
        default=None,
    )
    return RecommendedExpedition(
        id=expedition_id,
        region_code=request.region_code,
        keyword=request.keyword.strip() if request.keyword and request.keyword.strip() else None,
        travel_date=request.travel_date,
        snapshot_version=snapshot_version,
        stops=tuple(stops),
        data_updated_at=updated_at,
    )


class ExpeditionRecommendationService:
    async def recommend(
        self,
        session: AsyncSession,
        *,
        region_code: str,
        keyword: str | None,
        travel_date: date,
        limit: int,
    ) -> tuple[RecommendedExpedition, dict[UUID, PlaceModel]]:
        visit_count = (
            select(func.count(CheckInSessionModel.id))
            .where(
                CheckInSessionModel.place_id == PlaceModel.id,
                CheckInSessionModel.status == "submitted",
            )
            .correlate(PlaceModel)
            .scalar_subquery()
        )
        rows = (
            await session.execute(
                select(PlaceModel, visit_count.label("submitted_visit_count"))
                .where(
                    PlaceModel.region_code == region_code,
                    PlaceModel.source == "KTOUR_API",
                    PlaceModel.is_public.is_(True),
                    PlaceModel.is_active.is_(True),
                )
                .order_by(PlaceModel.content_id, PlaceModel.id)
            )
        ).all()
        models = {place.id: place for place, _ in rows}
        candidates = tuple(
            ExpeditionCandidate(
                id=place.id,
                content_id=place.content_id or str(place.id),
                name_ko=place.name_ko,
                category=_category(place.content_type_id),
                latitude=float(place.latitude),
                longitude=float(place.longitude),
                discovery_keywords=tuple(place.discovery_keywords or ()),
                festival_start_date=place.festival_start_date,
                festival_end_date=place.festival_end_date,
                submitted_visit_count=int(count or 0),
                synced_at=place.synced_at,
            )
            for place, count in rows
        )
        latest_run = await session.scalar(
            select(CatalogSyncRunModel)
            .where(
                CatalogSyncRunModel.area_code == region_code,
                CatalogSyncRunModel.source == "KTOUR_API",
                CatalogSyncRunModel.status == "succeeded",
                CatalogSyncRunModel.id.in_(select(OpenApiCallLogModel.sync_run_id)),
            )
            .order_by(CatalogSyncRunModel.completed_at.desc())
            .limit(1)
        )
        snapshot_version = (
            latest_run.snapshot_version
            if latest_run and latest_run.snapshot_version
            else _fallback_snapshot(candidates)
        )
        return (
            select_expedition(
                candidates,
                ExpeditionRequest(region_code, keyword, travel_date, limit),
                snapshot_version=snapshot_version,
            ),
            models,
        )


def _category(content_type_id: str | None) -> str:
    if content_type_id == "15":
        return "event"
    if content_type_id == "39":
        return "local_food"
    return "culture"


def _distance_km(first: ExpeditionCandidate, second: ExpeditionCandidate) -> float:
    earth_radius_km = 6371.0088
    lat1, lon1, lat2, lon2 = map(
        radians,
        (first.latitude, first.longitude, second.latitude, second.longitude),
    )
    delta_lat = lat2 - lat1
    delta_lon = lon2 - lon1
    haversine = (
        sin(delta_lat / 2) ** 2
        + cos(lat1) * cos(lat2) * sin(delta_lon / 2) ** 2
    )
    return 2 * earth_radius_km * asin(sqrt(haversine))


def _active_festival(candidate: ExpeditionCandidate, travel_date: date) -> bool:
    if candidate.festival_start_date is None:
        return False
    end_date = candidate.festival_end_date or candidate.festival_start_date
    return candidate.festival_start_date <= travel_date <= end_date


def _fallback_snapshot(candidates: tuple[ExpeditionCandidate, ...]) -> str:
    newest = max(
        (item.synced_at for item in candidates if item.synced_at is not None),
        default=None,
    )
    return newest.isoformat() if newest else "unversioned"
