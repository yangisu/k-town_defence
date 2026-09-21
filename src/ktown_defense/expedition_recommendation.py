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
from .bts_busan_route import (
    ALGORITHM_VERSION,
    BTS_BUSAN_ROUTE,
    Candidate as BtsCandidate,
    Observation,
    ROUTE_KEY,
    compose_candidates,
    haversine_km,
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
        if route_key is not None:
            if route_key != ROUTE_KEY:
                raise ValueError("route not supported")
            return await self._recommend_bts(
                session, region_code=region_code, keyword=keyword,
                travel_date=travel_date, limit=limit,
            )
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

    async def _recommend_bts(
        self,
        session: AsyncSession,
        *,
        region_code: str,
        keyword: str | None,
        travel_date: date,
        limit: int,
    ) -> tuple[RecommendedExpedition, dict[UUID, PlaceModel]]:
        if region_code != "6":
            raise ValueError("route not supported")
        anchor_content_ids = [anchor.content_id for anchor in BTS_BUSAN_ROUTE.anchors]
        anchor_rows = (await session.execute(
            select(PlaceModel).where(
                PlaceModel.content_id.in_(anchor_content_ids),
                PlaceModel.is_public.is_(True),
                PlaceModel.is_active.is_(True),
            )
        )).scalars().all()
        anchors_by_content = {place.content_id: place for place in anchor_rows}
        if any(content_id not in anchors_by_content for content_id in anchor_content_ids):
            raise ValueError("route anchors unavailable")
        anchor_models = [anchors_by_content[content_id] for content_id in anchor_content_ids]
        catalog = (await session.execute(
            select(PlaceModel).where(
                PlaceModel.region_code == "6",
                PlaceModel.source == "KTOUR_API",
                PlaceModel.is_public.is_(True),
                PlaceModel.is_active.is_(True),
            ).order_by(PlaceModel.content_id, PlaceModel.id)
        )).scalars().all()
        observations = tuple(
            observation
            for place in catalog
            for observation in _observations_for(place)
        )
        candidates = tuple(
            BtsCandidate(
                id=place.id,
                content_id=place.content_id or "",
                name_ko=place.name_ko,
                latitude=float(place.latitude),
                longitude=float(place.longitude),
                content_type_id=place.content_type_id or "",
                image_url=place.image_url,
                address_ko=place.address_ko,
                category_code=place.category_code,
                description_ko=place.description_ko,
            )
            for place in catalog
        )
        composed = compose_candidates(candidates, observations, limit=limit)
        snapshot = await _catalog_snapshot(session, catalog)
        related_months = sorted(
            {
                str(item.evidence["baseYm"])
                for item in composed
                if item.evidence.get("source") == "KTOUR_RELATED_ATTRACTION"
                and item.evidence.get("baseYm")
            },
            reverse=True,
        )
        related_state = related_months[0] if related_months else (
            "RELATED_NONE" if any(
                "KTOUR_RELATED_ATTRACTION_EMPTY" in (place.source_operations or [])
                for place in catalog
            ) else "RELATED_UNAVAILABLE"
        )
        route_version = f"{ALGORITHM_VERSION}:{snapshot}:{related_state}"

        def expedition_candidate(place: PlaceModel) -> ExpeditionCandidate:
            return ExpeditionCandidate(
                id=place.id, content_id=place.content_id or str(place.id),
                name_ko=place.name_ko, category=_category(place.content_type_id),
                latitude=float(place.latitude), longitude=float(place.longitude),
                discovery_keywords=tuple(place.discovery_keywords or ()),
                festival_start_date=place.festival_start_date,
                festival_end_date=place.festival_end_date,
                submitted_visit_count=0, synced_at=place.synced_at,
            )

        recommendations = {item.candidate.id: item for item in composed}
        ordered: list[RecommendedStop] = []
        for item in composed:
            if item.placement == "before":
                ordered.append(_recommended_from_composed(item, catalog))
        ordered.append(RecommendedStop(
            expedition_candidate(anchor_models[0]), 0, ("필수 메인 관광지",),
            kind="anchor", placement="main", required=True, selected_by_default=True,
        ))
        for item in composed:
            if item.placement == "between":
                ordered.append(_recommended_from_composed(item, catalog))
        ordered.append(RecommendedStop(
            expedition_candidate(anchor_models[1]), 0, ("필수 메인 관광지",),
            kind="anchor", placement="main", required=True, selected_by_default=True,
        ))
        for item in composed:
            if item.placement == "after":
                ordered.append(_recommended_from_composed(item, catalog))
        digest_stops = [
            {
                "contentId": stop.candidate.content_id,
                "kind": stop.kind,
                "placement": stop.placement,
                "required": stop.required,
                "evidence": stop.evidence,
            }
            for stop in ordered
        ]
        models = {place.id: place for place in [*anchor_models, *catalog]}
        return RecommendedExpedition(
            id=recommendation_digest(route_version, digest_stops),
            region_code="6", keyword=keyword.strip() if keyword and keyword.strip() else None,
            travel_date=travel_date, snapshot_version=snapshot,
            stops=tuple(ordered),
            data_updated_at=max(
                (place.synced_at for place in [*anchor_models, *catalog] if place.synced_at),
                default=None,
            ),
            route_key=ROUTE_KEY, route_version=route_version,
        ), models


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


def _observations_for(place: PlaceModel) -> tuple[Observation, ...]:
    raw = (place.intro_json or {}).get("routeObservations", [])
    parsed: list[Observation] = []
    if isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            source = str(item.get("source", ""))
            anchor_content_id = str(item.get("anchorContentId", ""))
            if source not in {"KTOUR_RELATED_ATTRACTION", "KTOUR_LOCATION_BASED"} or not anchor_content_id:
                continue
            try:
                parsed.append(Observation(
                    content_id=place.content_id or "", source=source,
                    anchor_content_id=anchor_content_id,
                    distance_km=float(item["distanceKm"]) if item.get("distanceKm") is not None else None,
                    related_rank=int(item["relatedRank"]) if item.get("relatedRank") is not None else None,
                    base_ym=str(item["baseYm"]) if item.get("baseYm") else None,
                ))
            except (TypeError, ValueError):
                continue
    return tuple(parsed)


def _recommended_from_composed(item, catalog: list[PlaceModel]) -> RecommendedStop:
    place = next(place for place in catalog if place.id == item.candidate.id)
    source = str(item.evidence["source"])
    reasons = (
        "방문 데이터 기반" if source == "KTOUR_RELATED_ATTRACTION" else "동선 주변 추천",
        f"우회 {item.placement_cost:.1f}km",
    )
    return RecommendedStop(
        ExpeditionCandidate(
            id=place.id, content_id=place.content_id or str(place.id),
            name_ko=place.name_ko, category=_category(place.content_type_id),
            latitude=float(place.latitude), longitude=float(place.longitude),
            discovery_keywords=tuple(place.discovery_keywords or ()),
            festival_start_date=place.festival_start_date,
            festival_end_date=place.festival_end_date,
            submitted_visit_count=0, synced_at=place.synced_at,
        ),
        round(item.placement_cost, 3), reasons,
        kind="recommendation", placement=item.placement,
        required=False, selected_by_default=False, evidence=item.evidence,
    )


async def _catalog_snapshot(session: AsyncSession, places: list[PlaceModel]) -> str:
    latest = await session.scalar(
        select(CatalogSyncRunModel).where(
            CatalogSyncRunModel.area_code == "6",
            CatalogSyncRunModel.source == "KTOUR_API",
            CatalogSyncRunModel.status == "succeeded",
        ).order_by(CatalogSyncRunModel.completed_at.desc()).limit(1)
    )
    if latest is not None and latest.snapshot_version:
        return latest.snapshot_version
    canonical = json.dumps([
        (
            place.content_id,
            (place.source_modified_at or place.synced_at).isoformat()
            if (place.source_modified_at or place.synced_at) else "none",
        )
        for place in sorted(places, key=lambda value: value.content_id or "")
    ], separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]
