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
from .bts_route import (
    BTS_ALGORITHM_VERSION,
    BTS_BUSAN_ROUTE,
    BTS_ROUTE_KEY,
    RouteCandidate,
    compose_bts_route,
    recommendation_digest,
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
    kind: str = "anchor"
    placement: str = "main"
    required: bool = True
    selected_by_default: bool = True
    evidence: dict[str, object] | None = None


@dataclass(frozen=True)
class RecommendedExpedition:
    id: str
    region_code: str
    keyword: str | None
    travel_date: date
    snapshot_version: str
    stops: tuple[RecommendedStop, ...]
    data_updated_at: datetime | None
    route_key: str | None = None
    route_version: str | None = None


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
        route_key: str | None = None,
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
        if route_key is not None and route_key != BTS_ROUTE_KEY:
            raise ValueError("route not supported")
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
        if route_key == BTS_ROUTE_KEY:
            anchors = (
                await session.scalars(
                    select(PlaceModel).where(
                        PlaceModel.content_id.in_(
                            [item.content_id for item in BTS_BUSAN_ROUTE.anchors]
                        ),
                        PlaceModel.source == "operator",
                        PlaceModel.is_public.is_(True),
                        PlaceModel.is_active.is_(True),
                    )
                )
            ).all()
            by_content_id = {item.content_id: item for item in anchors}
            try:
                ordered_anchors = tuple(
                    by_content_id[item.content_id] for item in BTS_BUSAN_ROUTE.anchors
                )
            except KeyError as exc:
                raise ValueError("BTS anchors are not seeded") from exc
            route_anchors = tuple(_route_candidate(item) for item in ordered_anchors)
            route_candidates = tuple(_route_candidate(place) for place, _ in rows)
            composed = compose_bts_route(
                route_anchors, route_candidates, recommendation_limit=min(3, limit - 2)
            )
            models.update({item.id: item for item in ordered_anchors})
            related_months = sorted(
                {
                    stop.candidate.related_base_ym
                    for stop in composed
                    if stop.kind == "recommendation"
                    and stop.candidate.related_base_ym
                    and "KTOUR_RELATED_ATTRACTION" in stop.candidate.sources
                },
                reverse=True,
            )
            related_state = related_months[0] if related_months else "RELATED_UNAVAILABLE"
            catalog_snapshot = (
                latest_run.snapshot_version
                if latest_run and latest_run.snapshot_version
                else _bts_fallback_snapshot(tuple(models.values()))
            )
            route_version = f"{BTS_ALGORITHM_VERSION}:{catalog_snapshot}:{related_state}"
            route_stops = tuple(
                RecommendedStop(
                    candidate=ExpeditionCandidate(
                        id=stop.candidate.id,
                        content_id=stop.candidate.content_id,
                        name_ko=stop.candidate.name_ko,
                        category=_category(stop.candidate.content_type_id),
                        latitude=stop.candidate.latitude,
                        longitude=stop.candidate.longitude,
                        discovery_keywords=(),
                        festival_start_date=None,
                        festival_end_date=None,
                        submitted_visit_count=0,
                        synced_at=models[stop.candidate.id].synced_at,
                    ),
                    distance_km=stop.distance_km,
                    reasons=stop.reasons,
                    kind=stop.kind,
                    placement=stop.placement,
                    required=stop.required,
                    selected_by_default=stop.selected_by_default,
                    evidence=stop.evidence,
                )
                for stop in composed
            )
            digest = recommendation_digest(route_version=route_version, stops=composed)
            return RecommendedExpedition(
                id=digest,
                region_code=region_code,
                keyword=keyword.strip() if keyword and keyword.strip() else None,
                travel_date=travel_date,
                snapshot_version=snapshot_version,
                stops=route_stops,
                data_updated_at=max(
                    (item.synced_at for item in models.values() if item.synced_at),
                    default=None,
                ),
                route_key=route_key,
                route_version=route_version,
            ), models
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


def _bts_fallback_snapshot(places: tuple[PlaceModel, ...]) -> str:
    values = [
        (
            place.content_id or str(place.id),
            (place.source_modified_at or place.synced_at).isoformat()
            if (place.source_modified_at or place.synced_at)
            else "none",
        )
        for place in sorted(places, key=lambda item: item.content_id or str(item.id))
        if place.region_code == "6" and place.is_public and place.is_active
    ]
    canonical = json.dumps(values, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]


def _route_candidate(place: PlaceModel) -> RouteCandidate:
    operations = set(place.source_operations or ())
    sources: list[str] = []
    if "related_attraction" in operations or "KTOUR_RELATED_ATTRACTION" in operations:
        sources.append("KTOUR_RELATED_ATTRACTION")
    if "locationBasedList2" in operations or "KTOUR_LOCATION_BASED" in operations:
        sources.append("KTOUR_LOCATION_BASED")
    # Catalog entries without explicit observation metadata remain usable as
    # deterministic location fallback candidates.
    if place.source == "KTOUR_API" and not sources:
        sources.append("KTOUR_LOCATION_BASED")
    intro = place.intro_json or {}
    rank = intro.get("relatedRank")
    try:
        related_rank = int(rank) if rank is not None else None
    except (TypeError, ValueError):
        related_rank = None
    return RouteCandidate(
        id=place.id,
        content_id=place.content_id or str(place.id),
        name_ko=place.name_ko,
        latitude=float(place.latitude),
        longitude=float(place.longitude),
        content_type_id=place.content_type_id,
        address_ko=place.address_ko,
        category_code=place.category_code,
        description_ko=place.description_ko,
        image_url=place.image_url,
        sources=tuple(sorted(sources)),
        related_rank=related_rank,
        related_base_ym=str(intro.get("relatedBaseYm") or "") or None,
    )
