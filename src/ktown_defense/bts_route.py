"""Deterministic BTS Busan route composition.

The module is deliberately pure: network adapters may contribute observations,
but only catalog-backed candidates reach the composer.  Consequently a failed
adapter is represented by an empty observation set and still yields both
operator-managed anchors.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
import hashlib
import json
from math import asin, cos, radians, sin, sqrt
import re
import unicodedata
from uuid import UUID


BTS_ROUTE_KEY = "bts-busan"
BTS_ALGORITHM_VERSION = "bts-busan-v1"
ALLOWED_CONTENT_TYPES = frozenset({"12", "14", "15", "28", "38", "39"})


@dataclass(frozen=True)
class AnchorDefinition:
    content_id: str
    aliases: tuple[str, ...]
    order: int


@dataclass(frozen=True)
class RouteDefinition:
    route_key: str
    algorithm_version: str
    anchors: tuple[AnchorDefinition, ...]


BTS_BUSAN_ROUTE = RouteDefinition(
    route_key=BTS_ROUTE_KEY,
    algorithm_version=BTS_ALGORITHM_VERSION,
    anchors=(
        AnchorDefinition(
            "operator:bts-busan-asiad",
            ("부산아시아드경기장", "부산아시아드주경기장", "부산아시아드 주경기장"),
            1,
        ),
        AnchorDefinition(
            "operator:busan-gamcheon",
            ("감천문화마을", "감천 문화마을", "부산 감천문화마을"),
            2,
        ),
    ),
)


@dataclass(frozen=True)
class RouteCandidate:
    id: UUID
    content_id: str
    name_ko: str
    latitude: float
    longitude: float
    content_type_id: str | None
    address_ko: str = ""
    category_code: str | None = None
    description_ko: str = ""
    image_url: str | None = None
    sources: tuple[str, ...] = ()
    related_rank: int | None = None
    related_base_ym: str | None = None
    anchor_content_id: str | None = None


@dataclass(frozen=True)
class RouteStop:
    candidate: RouteCandidate
    kind: str
    placement: str
    required: bool
    selected_by_default: bool
    distance_km: float
    reasons: tuple[str, ...]
    evidence: dict[str, object] | None = None
    score: float = 0.0


def compose_bts_route(
    anchors: tuple[RouteCandidate, RouteCandidate],
    candidates: tuple[RouteCandidate, ...],
    *,
    recommendation_limit: int = 3,
) -> tuple[RouteStop, ...]:
    """Return ``before -> A -> between -> B -> after`` deterministically."""
    if tuple(item.content_id for item in anchors) != tuple(
        item.content_id for item in BTS_BUSAN_ROUTE.anchors
    ):
        raise ValueError("BTS anchors are missing or out of order")
    if not 0 <= recommendation_limit <= 3:
        raise ValueError("recommendation_limit must be between 0 and 3")

    eligible = _eligible_and_deduplicated(anchors, candidates)
    placed = [item for candidate in eligible if (item := _place(anchors, candidate))]
    selected: list[RouteStop] = []
    capacity = {"before": 1, "between": 2, "after": 1}
    while placed and len(selected) < recommendation_limit:
        scored = [replace(item, score=_score(item, selected)) for item in placed]
        winner = min(
            scored,
            key=lambda item: (
                -item.score,
                0 if "KTOUR_RELATED_ATTRACTION" in item.candidate.sources else 1,
                _placement_cost(anchors, item.candidate, item.placement),
                item.candidate.content_id,
            ),
        )
        placed.remove(next(item for item in placed if item.candidate.id == winner.candidate.id))
        if capacity[winner.placement] == 0:
            continue
        capacity[winner.placement] -= 1
        selected.append(winner)

    groups = {
        placement: sorted(
            (item for item in selected if item.placement == placement),
            key=lambda item: (-item.score, item.candidate.content_id),
        )
        for placement in ("before", "between", "after")
    }
    anchor_stops = tuple(
        RouteStop(anchor, "anchor", "main", True, True, 0.0, ("필수 메인 관광지",))
        for anchor in anchors
    )
    return tuple(groups["before"] + [anchor_stops[0]] + groups["between"] + [anchor_stops[1]] + groups["after"])


def recommendation_digest(
    *, route_version: str, stops: tuple[RouteStop, ...]
) -> str:
    payload = {
        "algorithmVersion": BTS_ALGORITHM_VERSION,
        "routeVersion": route_version,
        "stops": [
            {
                "contentId": stop.candidate.content_id,
                "kind": stop.kind,
                "placement": stop.placement,
                "required": stop.required,
                "evidence": stop.evidence,
            }
            for stop in stops
        ],
    }
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def _eligible_and_deduplicated(
    anchors: tuple[RouteCandidate, RouteCandidate], candidates: tuple[RouteCandidate, ...]
) -> tuple[RouteCandidate, ...]:
    anchor_ids = {item.content_id for item in anchors}
    filtered = [
        item
        for item in candidates
        if item.content_id
        and item.name_ko
        and item.content_type_id in ALLOWED_CONTENT_TYPES
        and item.content_id not in anchor_ids
        and min(_distance(item, anchor) for anchor in anchors) <= 5
    ]
    winners: list[RouteCandidate] = []
    for item in sorted(filtered, key=_candidate_priority):
        if any(_duplicate(item, existing) for existing in winners):
            continue
        winners.append(item)
    return tuple(sorted(winners, key=lambda item: item.content_id))


def _candidate_priority(item: RouteCandidate) -> tuple[object, ...]:
    completeness = sum(bool(value) for value in (item.image_url, item.address_ko, item.category_code, item.description_ko))
    return (
        0 if "KTOUR_RELATED_ATTRACTION" in item.sources else 1,
        0 if "KTOUR_LOCATION_BASED" in item.sources else 1,
        -completeness,
        item.content_id,
    )


def _duplicate(first: RouteCandidate, second: RouteCandidate) -> bool:
    return (
        first.content_id == second.content_id
        or _normalized_name(first.name_ko) == _normalized_name(second.name_ko)
        or (
            first.content_type_id == second.content_type_id
            and _distance(first, second) <= 0.1
        )
    )


def _normalized_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return re.sub(r"[\W_]+", "", normalized, flags=re.UNICODE)


def _place(
    anchors: tuple[RouteCandidate, RouteCandidate], candidate: RouteCandidate
) -> RouteStop | None:
    first, second = anchors
    dx, dy = second.longitude - first.longitude, second.latitude - first.latitude
    denominator = dx * dx + dy * dy
    t = 0.0 if denominator == 0 else (
        (candidate.longitude - first.longitude) * dx
        + (candidate.latitude - first.latitude) * dy
    ) / denominator
    first_distance, second_distance = _distance(first, candidate), _distance(second, candidate)
    detour = first_distance + second_distance - _distance(first, second)
    if 0 <= t <= 1 and detour <= 5:
        placement, distance, reason = "between", detour, f"우회 {detour:.1f}km"
    elif first_distance <= 3 or second_distance <= 3:
        if first_distance <= second_distance:
            placement, distance = "before", first_distance
        else:
            placement, distance = "after", second_distance
        reason = f"동선 주변 {distance:.1f}km"
    else:
        return None
    related = "KTOUR_RELATED_ATTRACTION" in candidate.sources
    source = "KTOUR_RELATED_ATTRACTION" if related else "KTOUR_LOCATION_BASED"
    evidence: dict[str, object] = {
        "source": source,
        "reason": "실제 방문 데이터 기반 연관 관광지" if related else "동선 주변 추천",
        "relatedRank": candidate.related_rank,
        "baseYm": candidate.related_base_ym,
        "sources": sorted(set(candidate.sources)),
        "auxiliaryObservations": [],
    }
    return RouteStop(
        candidate, "recommendation", placement, False, False, round(distance, 3),
        (("방문 데이터 기반" if related else "동선 주변 추천"), reason), evidence,
    )


def _score(item: RouteStop, selected: list[RouteStop]) -> float:
    candidate = item.candidate
    cost = item.distance_km if item.placement == "between" else item.distance_km * 2
    limit = 5 if item.placement == "between" else 6
    route_score = max(0.0, 1 - cost / limit)
    completeness = sum(bool(value) for value in (candidate.image_url, candidate.address_ko, candidate.category_code, candidate.description_ko)) / 4
    diversity = float(all(old.candidate.content_type_id != candidate.content_type_id for old in selected))
    related = "KTOUR_RELATED_ATTRACTION" in candidate.sources
    rank_score = max(0, 21 - min(candidate.related_rank or 21, 21)) / 20 if related else 0
    return 0.45 * rank_score + 0.30 * route_score + 0.15 * completeness + 0.10 * diversity


def _placement_cost(
    anchors: tuple[RouteCandidate, RouteCandidate], candidate: RouteCandidate, placement: str
) -> float:
    if placement == "between":
        return _distance(anchors[0], candidate) + _distance(candidate, anchors[1]) - _distance(*anchors)
    return 2 * _distance(anchors[0 if placement == "before" else 1], candidate)


def _distance(first: RouteCandidate, second: RouteCandidate) -> float:
    lat1, lon1, lat2, lon2 = map(radians, (first.latitude, first.longitude, second.latitude, second.longitude))
    value = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371.0088 * asin(sqrt(value))
