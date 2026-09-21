"""Deterministic domain rules for the versioned BTS Busan route."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from math import asin, cos, radians, sin, sqrt
import re
import unicodedata
from uuid import UUID


ROUTE_KEY = "bts-busan"
ALGORITHM_VERSION = "bts-busan-v1"
ALLOWED_CONTENT_TYPES = frozenset({"12", "14", "15", "28", "38", "39"})


@dataclass(frozen=True)
class AnchorDefinition:
    content_id: str
    name_ko: str
    address_ko: str
    latitude: float
    longitude: float
    aliases: tuple[str, ...]
    homepage_url: str


@dataclass(frozen=True)
class RouteDefinition:
    route_key: str
    algorithm_version: str
    anchors: tuple[AnchorDefinition, AnchorDefinition]


BTS_BUSAN_ROUTE = RouteDefinition(
    route_key=ROUTE_KEY,
    algorithm_version=ALGORITHM_VERSION,
    anchors=(
        AnchorDefinition(
            "operator:bts-busan-asiad", "부산아시아드주경기장",
            "부산광역시 연제구 월드컵대로 344", 35.1901, 129.0584,
            ("부산아시아드경기장", "부산아시아드주경기장", "부산아시아드 주경기장"),
            "https://www.busan.go.kr/stadium/sfintro",
        ),
        AnchorDefinition(
            "operator:busan-gamcheon", "감천문화마을",
            "부산광역시 사하구 감내1로 200", 35.0977, 129.0104,
            ("감천문화마을", "감천 문화마을", "부산 감천문화마을"),
            "https://saha.go.kr/portalEn/contents.do?mId=0201000000",
        ),
    ),
)


@dataclass(frozen=True)
class Candidate:
    id: UUID
    content_id: str
    name_ko: str
    latitude: float
    longitude: float
    content_type_id: str
    image_url: str | None = None
    address_ko: str = ""
    category_code: str | None = None
    description_ko: str = ""


@dataclass(frozen=True)
class Observation:
    content_id: str
    source: str
    anchor_content_id: str
    distance_km: float | None = None
    related_rank: int | None = None
    base_ym: str | None = None


@dataclass(frozen=True)
class ComposedRecommendation:
    candidate: Candidate
    placement: str
    placement_cost: float
    evidence: dict[str, object]


def normalize_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return "".join(char for char in normalized if char.isalnum())


def haversine_km(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    earth_radius_km = 6371.0088
    lat1, lon1, lat2, lon2 = map(radians, (a_lat, a_lon, b_lat, b_lon))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    value = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * earth_radius_km * asin(sqrt(value))


def placement_for(candidate: Candidate) -> tuple[str, float] | None:
    first, second = BTS_BUSAN_ROUTE.anchors
    ab_lat = second.latitude - first.latitude
    ab_lon = (second.longitude - first.longitude) * cos(radians((first.latitude + second.latitude) / 2))
    ac_lat = candidate.latitude - first.latitude
    ac_lon = (candidate.longitude - first.longitude) * cos(radians((first.latitude + candidate.latitude) / 2))
    denominator = ab_lat * ab_lat + ab_lon * ab_lon
    projection = (ac_lat * ab_lat + ac_lon * ab_lon) / denominator
    distance_a = haversine_km(first.latitude, first.longitude, candidate.latitude, candidate.longitude)
    distance_b = haversine_km(second.latitude, second.longitude, candidate.latitude, candidate.longitude)
    detour = distance_a + distance_b - haversine_km(
        first.latitude, first.longitude, second.latitude, second.longitude
    )
    if 0 <= projection <= 1 and detour <= 5:
        return "between", detour
    before = distance_a <= 3
    after = distance_b <= 3
    if before and after:
        return ("before", 2 * distance_a) if distance_a <= distance_b else ("after", 2 * distance_b)
    if before:
        return "before", 2 * distance_a
    if after:
        return "after", 2 * distance_b
    return None


def compose_candidates(
    candidates: tuple[Candidate, ...], observations: tuple[Observation, ...], *, limit: int
) -> tuple[ComposedRecommendation, ...]:
    """Filter, deduplicate and score externally observed catalog candidates."""
    if limit < 3 or limit > 5:
        raise ValueError("limit must be between 3 and 5")
    by_content: dict[str, list[Observation]] = {}
    for observation in observations:
        by_content.setdefault(observation.content_id, []).append(observation)
    eligible: list[tuple[Candidate, str, float, list[Observation]]] = []
    anchor_ids = {anchor.content_id for anchor in BTS_BUSAN_ROUTE.anchors}
    for candidate in sorted(candidates, key=lambda item: item.content_id):
        if (
            not candidate.content_id or candidate.content_id in anchor_ids
            or not candidate.name_ko or candidate.content_type_id not in ALLOWED_CONTENT_TYPES
            or candidate.content_id not in by_content
        ):
            continue
        nearest = min(
            haversine_km(anchor.latitude, anchor.longitude, candidate.latitude, candidate.longitude)
            for anchor in BTS_BUSAN_ROUTE.anchors
        )
        placed = placement_for(candidate)
        if nearest > 5 or placed is None:
            continue
        eligible.append((candidate, placed[0], placed[1], by_content[candidate.content_id]))

    # Deterministic winner selection for all three duplicate definitions.
    winners: list[tuple[Candidate, str, float, list[Observation]]] = []
    for item in eligible:
        candidate = item[0]
        duplicate_index = next((
            index for index, existing in enumerate(winners)
            if existing[0].content_id == candidate.content_id
            or normalize_name(existing[0].name_ko) == normalize_name(candidate.name_ko)
            or (
                existing[0].content_type_id == candidate.content_type_id
                and haversine_km(existing[0].latitude, existing[0].longitude,
                                 candidate.latitude, candidate.longitude) <= 0.1
            )
        ), None)
        if duplicate_index is None:
            winners.append(item)
            continue
        if _duplicate_priority(item) < _duplicate_priority(winners[duplicate_index]):
            winners[duplicate_index] = item

    caps = {"before": 1, "between": 2, "after": 1}
    selected: list[ComposedRecommendation] = []
    used_types: set[str] = set()
    while winners and len(selected) < min(3, limit - 2):
        ranked = sorted(
            winners,
            key=lambda item: _score_key(item, used_types),
        )
        chosen = next((item for item in ranked if caps[item[1]] > 0), None)
        if chosen is None:
            break
        winners.remove(chosen)
        candidate, placement, cost, candidate_observations = chosen
        caps[placement] -= 1
        used_types.add(candidate.content_type_id)
        selected.append(ComposedRecommendation(
            candidate, placement, cost, _evidence(candidate_observations)
        ))
    placement_order = {"before": 0, "between": 1, "after": 2}
    return tuple(sorted(selected, key=lambda item: (
        placement_order[item.placement], _score_key(
            next(value for value in eligible if value[0].content_id == item.candidate.content_id), set()
        ), item.candidate.content_id,
    )))


def recommendation_digest(route_version: str, stops: list[dict[str, object]]) -> str:
    canonical = json.dumps(
        {"algorithmVersion": ALGORITHM_VERSION, "routeVersion": route_version, "stops": stops},
        ensure_ascii=False, sort_keys=True, separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def route_key_is_valid(value: str) -> bool:
    return bool(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value))


def _duplicate_priority(item: tuple[Candidate, str, float, list[Observation]]) -> tuple[object, ...]:
    candidate, _, _, observations = item
    related = any(observation.source == "KTOUR_RELATED_ATTRACTION" for observation in observations)
    location = any(observation.source == "KTOUR_LOCATION_BASED" for observation in observations)
    completeness = sum(bool(value) for value in (
        candidate.image_url, candidate.address_ko, candidate.category_code, candidate.description_ko
    ))
    return (-int(related), -int(location), -completeness, candidate.content_id)


def _score_key(
    item: tuple[Candidate, str, float, list[Observation]], used_types: set[str]
) -> tuple[object, ...]:
    candidate, placement, cost, observations = item
    ranks = [value.related_rank for value in observations if value.related_rank is not None]
    related = bool(ranks)
    rank_score = max(0, 21 - min(ranks, default=21)) / 20
    route_score = max(0, 1 - cost / (5 if placement == "between" else 6))
    content_score = sum(bool(value) for value in (
        candidate.image_url, candidate.address_ko, candidate.category_code, candidate.description_ko
    )) / 4
    diversity = int(candidate.content_type_id not in used_types)
    score = (0.45 * rank_score if related else 0) + 0.30 * route_score + 0.15 * content_score + 0.10 * diversity
    return (-score, -int(related), cost, candidate.content_id)


def _evidence(observations: list[Observation]) -> dict[str, object]:
    ordered = sorted(observations, key=lambda value: (
        value.source, value.anchor_content_id, value.base_ym is None,
        value.base_ym or "", value.related_rank is None,
        value.related_rank or 0, value.distance_km or 0,
    ))
    related = sorted(
        (value for value in ordered if value.source == "KTOUR_RELATED_ATTRACTION"),
        key=lambda value: (value.related_rank or 10**9, -(int(value.base_ym or "0"))),
    )
    representative = related[0] if related else ordered[0]
    reason = "실제 방문 데이터 기반 연관 관광지" if related else "동선 주변 추천"
    return {
        "source": representative.source,
        "reason": reason,
        "relatedRank": representative.related_rank,
        "baseYm": representative.base_ym,
        "sources": sorted({value.source for value in ordered}),
        "auxiliaryObservations": [
            {
                "source": value.source,
                "anchorContentId": value.anchor_content_id,
                "distanceKm": None if value.distance_km is None else round(value.distance_km, 3),
                "baseYm": value.base_ym,
                "relatedRank": value.related_rank,
            }
            for value in ordered if value != representative
        ],
    }
