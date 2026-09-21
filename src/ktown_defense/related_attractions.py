"""Read-only related-attraction enrichment with a bounded process cache."""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import logging
from math import asin, cos, radians, sin, sqrt
import secrets
from typing import Callable, Literal, Mapping

from .ktour_openapi import KTourOpenAPIClient


logger = logging.getLogger(__name__)

ALLOWED_CONTENT_TYPES = {"12", "14", "15", "25", "28"}


@dataclass(frozen=True)
class RelatedAttraction:
    content_id: str
    name_ko: str
    category: str | None
    latitude: float
    longitude: float
    distance_km: float
    image_url: str | None
    address_ko: str | None = None
    source: str = "KTOUR_LOCATION_BASED"


@dataclass(frozen=True)
class RouteAttractionRecommendation:
    placement: Literal["before_first", "between", "after_second"]
    attraction: RelatedAttraction
    detour_km: float | None
    via_distance_km: float | None
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class _CacheEntry:
    expires_at: datetime
    value: tuple[RelatedAttraction, ...]


class RelatedAttractionService:
    def __init__(
        self,
        *,
        service_key: str | None,
        base_ym: str = "202504",
        ttl_seconds: int = 300,
        max_cache_entries: int = 256,
        client_factory: Callable[[str], KTourOpenAPIClient] | None = None,
        clock: Callable[[], datetime] | None = None,
        chooser: Callable[[tuple[RelatedAttraction, ...]], RelatedAttraction] | None = None,
    ) -> None:
        if ttl_seconds <= 0 or max_cache_entries <= 0:
            raise ValueError("related attraction cache settings must be positive")
        if not base_ym.isdigit() or len(base_ym) != 6:
            raise ValueError("related attraction base_ym must use YYYYMM format")
        self._client = (
            (client_factory or self._default_client)(service_key)
            if service_key and service_key.strip()
            else None
        )
        self._ttl = timedelta(seconds=ttl_seconds)
        self._max_cache_entries = max_cache_entries
        self._base_ym = base_ym
        self._cache: OrderedDict[tuple[object, ...], _CacheEntry] = OrderedDict()
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._chooser = chooser or secrets.choice

    @staticmethod
    def _default_client(service_key: str) -> KTourOpenAPIClient:
        return KTourOpenAPIClient(service_key=service_key)

    async def get_for_place(
        self,
        *,
        name_ko: str,
        latitude: float | None,
        longitude: float | None,
        region_code: str | None = None,
        excluded_names: tuple[str, ...] = (),
    ) -> tuple[RelatedAttraction, ...]:
        del region_code
        if self._client is None:
            return ()
        normalized_name = _normalize(name_ko)
        cache_key = (
            normalized_name,
            round(latitude or 0, 5),
            round(longitude or 0, 5),
            5000,
            tuple(sorted(_normalize(value) for value in excluded_names)),
        )
        now = self._clock()
        entry = self._cache.get(cache_key)
        if entry is not None:
            self._cache.move_to_end(cache_key)
            if entry.expires_at > now:
                return entry.value

        try:
            anchor = await _resolve_anchor(
                self._client, name_ko=name_ko, latitude=latitude, longitude=longitude
            )
            if anchor is None:
                return ()
            candidates = await _nearby_candidates(self._client, anchor)
            if not candidates:
                candidates = await _nearby_candidates(self._client, anchor, radius=10000)
            value = _select_attractions(
                candidates,
                anchor=anchor,
                excluded_names=excluded_names,
            )[:1]
        except Exception:
            logger.warning("related attraction lookup failed for %s", name_ko, exc_info=True)
            if entry is not None:
                return entry.value
            return ()

        self._cache[cache_key] = _CacheEntry(now + self._ttl, value)
        self._cache.move_to_end(cache_key)
        while len(self._cache) > self._max_cache_entries:
            self._cache.popitem(last=False)
        return value

    async def get_for_route(
        self,
        *,
        first_name_ko: str,
        first_latitude: float,
        first_longitude: float,
        second_name_ko: str,
        second_latitude: float,
        second_longitude: float,
        excluded_names: tuple[str, ...] = (),
    ) -> tuple[RouteAttractionRecommendation, ...]:
        """Build before/between/after recommendations for two main stops."""
        if self._client is None:
            return ()
        first = {
            "title": first_name_ko,
            "mapy": first_latitude,
            "mapx": first_longitude,
        }
        second = {
            "title": second_name_ko,
            "mapy": second_latitude,
            "mapx": second_longitude,
        }
        direct_distance = _distance_between(first, second)
        midpoint = {
            "title": "route-midpoint",
            "mapy": (first_latitude + second_latitude) / 2,
            "mapx": (first_longitude + second_longitude) / 2,
        }
        midpoint_radius = min(20000, max(5000, int(direct_distance * 500 + 3000)))

        try:
            import asyncio

            first_records, midpoint_records, second_records = await asyncio.gather(
                _nearby_candidates(self._client, first, radius=5000, limit=100),
                _nearby_candidates(
                    self._client, midpoint, radius=midpoint_radius, limit=100
                ),
                _nearby_candidates(self._client, second, radius=5000, limit=100),
            )
            base_exclusions = tuple(
                dict.fromkeys(
                    (*excluded_names, first_name_ko, second_name_ko)
                )
            )
            first_top_three = _select_attractions(
                first_records, anchor=first, excluded_names=base_exclusions
            )[:3]
            before = self._chooser(first_top_three) if first_top_three else None

            second_exclusions = (
                *base_exclusions,
                *((before.name_ko,) if before is not None else ()),
            )
            second_top_three = _select_attractions(
                second_records, anchor=second, excluded_names=second_exclusions
            )[:3]
            after = self._chooser(second_top_three) if second_top_three else None

            route_exclusions = (
                *second_exclusions,
                *((after.name_ko,) if after is not None else ()),
                *(item.name_ko for item in first_top_three),
                *(item.name_ko for item in second_top_three),
            )
            between = _select_route_attractions(
                midpoint_records,
                first=first,
                second=second,
                excluded_names=route_exclusions,
            )
        except Exception:
            logger.warning(
                "route attraction lookup failed for %s -> %s",
                first_name_ko,
                second_name_ko,
                exc_info=True,
            )
            return ()

        output: list[RouteAttractionRecommendation] = []
        if before is not None:
            output.append(
                RouteAttractionRecommendation(
                    placement="before_first",
                    attraction=before,
                    detour_km=None,
                    via_distance_km=None,
                    reasons=(
                        "첫 번째 메인 관광지 주변 거리 상위 3곳 중 추천",
                        f"메인 관광지에서 직선거리 {before.distance_km:.1f}km",
                    ),
                )
            )
        if between is not None:
            attraction, detour_km, via_distance_km = between
            output.append(
                RouteAttractionRecommendation(
                    placement="between",
                    attraction=attraction,
                    detour_km=detour_km,
                    via_distance_km=via_distance_km,
                    reasons=(
                        "두 메인 관광지 사이 최소 우회 후보",
                        f"예상 직선 우회거리 +{detour_km:.1f}km",
                    ),
                )
            )
        if after is not None:
            output.append(
                RouteAttractionRecommendation(
                    placement="after_second",
                    attraction=after,
                    detour_km=None,
                    via_distance_km=None,
                    reasons=(
                        "두 번째 메인 관광지 주변 거리 상위 3곳 중 추천",
                        f"메인 관광지에서 직선거리 {after.distance_km:.1f}km",
                    ),
                )
            )
        return tuple(output)


async def _resolve_anchor(
    client: KTourOpenAPIClient,
    *,
    name_ko: str,
    latitude: float | None,
    longitude: float | None,
) -> dict[str, object] | None:
    import asyncio

    anchor: dict[str, object] = {}
    if latitude is not None and longitude is not None:
        anchor.update({"title": name_ko, "mapy": latitude, "mapx": longitude})
    try:
        matches = await asyncio.to_thread(client.search_keyword, name_ko, limit=50)
    except Exception:
        matches = []
    normalized_name = _normalize(name_ko)
    exact = next(
        (item for item in matches if _normalize(str(item.get("title", ""))) == normalized_name),
        None,
    )
    if exact is not None and _valid_coordinates(exact):
        anchor = dict(exact)
    elif not anchor:
        return None
    return anchor


async def _nearby_candidates(
    client: KTourOpenAPIClient,
    anchor: Mapping[str, object],
    radius: int = 5000,
    limit: int = 50,
) -> list[Mapping[str, object]]:
    import asyncio

    return await asyncio.to_thread(
        client.location_based_list,
        longitude=float(anchor["mapx"]),
        latitude=float(anchor["mapy"]),
        radius=radius,
        limit=limit,
    )


def _select_attractions(
    records: list[Mapping[str, object]],
    *,
    anchor: Mapping[str, object],
    excluded_names: tuple[str, ...],
) -> tuple[RelatedAttraction, ...]:
    anchor_id = str(anchor.get("contentid", "")).strip()
    anchor_name = _normalize(str(anchor.get("title", "")))
    excluded = {_normalize(value) for value in excluded_names}
    seen: set[str] = set()
    attractions: list[RelatedAttraction] = []
    anchor_latitude = float(anchor["mapy"])
    anchor_longitude = float(anchor["mapx"])
    for record in records:
        content_id = str(record.get("contentid", "")).strip()
        title = str(record.get("title", "")).strip()
        if not content_id or not title or content_id in seen or not _valid_coordinates(record):
            continue
        if content_id == anchor_id:
            continue
        if content_id not in seen and _normalize(title) in excluded:
            continue
        if not _allowed_content_type(record):
            continue
        if not anchor_id and _normalize(title) == anchor_name:
            distance = _haversine_km(anchor_latitude, anchor_longitude, record)
            if distance < 0.1:
                continue
        seen.add(content_id)
        distance = _haversine_km(anchor_latitude, anchor_longitude, record)
        attractions.append(
            RelatedAttraction(
                content_id=content_id,
                name_ko=title,
                category=str(record.get("cat3") or record.get("cat2") or record.get("contenttypeid") or "").strip() or None,
                latitude=float(record["mapy"]),
                longitude=float(record["mapx"]),
                distance_km=distance,
                image_url=_image_url(record),
                address_ko=str(record.get("addr1", "")).strip() or None,
            )
        )
    attractions.sort(key=lambda item: (item.distance_km, item.content_id))
    return tuple(attractions)


def _select_route_attractions(
    records: list[Mapping[str, object]],
    *,
    first: Mapping[str, object],
    second: Mapping[str, object],
    excluded_names: tuple[str, ...],
) -> tuple[RelatedAttraction, float, float] | None:
    excluded = {_normalize(value) for value in excluded_names}
    direct_distance = _distance_between(first, second)
    ranked: list[tuple[float, float, str, RelatedAttraction]] = []
    seen: set[str] = set()
    for record in records:
        content_id = str(record.get("contentid", "")).strip()
        title = str(record.get("title", "")).strip()
        if (
            not content_id
            or content_id in seen
            or not title
            or _normalize(title) in excluded
            or not _valid_coordinates(record)
            or not _allowed_content_type(record)
        ):
            continue
        seen.add(content_id)
        from_first = _distance_between(first, record)
        to_second = _distance_between(record, second)
        via_distance = from_first + to_second
        detour = max(0.0, via_distance - direct_distance)
        attraction = RelatedAttraction(
            content_id=content_id,
            name_ko=title,
            category=str(
                record.get("cat3")
                or record.get("cat2")
                or record.get("contenttypeid")
                or ""
            ).strip()
            or None,
            latitude=float(record["mapy"]),
            longitude=float(record["mapx"]),
            distance_km=round(from_first, 3),
            image_url=_image_url(record),
            address_ko=str(record.get("addr1", "")).strip() or None,
            source="KTOUR_ROUTE_DETOUR",
        )
        ranked.append((detour, via_distance, content_id, attraction))
    if not ranked:
        return None
    detour, via_distance, _, attraction = min(ranked)
    return attraction, round(detour, 3), round(via_distance, 3)


def _normalize(value: str) -> str:
    return "".join(value.split())


def _valid_coordinates(record: Mapping[str, object]) -> bool:
    try:
        latitude = float(record["mapy"])
        longitude = float(record["mapx"])
    except (KeyError, TypeError, ValueError):
        return False
    return -90 <= latitude <= 90 and -180 <= longitude <= 180


def _allowed_content_type(record: Mapping[str, object]) -> bool:
    content_type = str(record.get("contenttypeid", "")).strip()
    return not content_type or content_type in ALLOWED_CONTENT_TYPES


def _image_url(record: Mapping[str, object]) -> str | None:
    value = str(record.get("firstimage", "")).strip()
    if value.startswith("http://"):
        return f"https://{value.removeprefix('http://')}"
    return value if value.startswith("https://") else None


def _haversine_km(latitude: float, longitude: float, record: Mapping[str, object]) -> float:
    target_latitude = radians(float(record["mapy"]))
    target_longitude = radians(float(record["mapx"]))
    source_latitude = radians(latitude)
    source_longitude = radians(longitude)
    delta_latitude = target_latitude - source_latitude
    delta_longitude = target_longitude - source_longitude
    value = sin(delta_latitude / 2) ** 2 + cos(source_latitude) * cos(target_latitude) * sin(delta_longitude / 2) ** 2
    return 6371.0088 * 2 * asin(sqrt(value))


def _distance_between(
    first: Mapping[str, object], second: Mapping[str, object]
) -> float:
    return _haversine_km(
        float(first["mapy"]), float(first["mapx"]), second
    )
