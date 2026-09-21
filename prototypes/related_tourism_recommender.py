"""Standalone tourism recommender using two Korea Tourism APIs.

This module is intentionally not connected to the K-Town application. Run it as:

    python -m prototypes.related_tourism_recommender 부산아시아드주경기장 감천문화마을
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
import os
from pathlib import Path
import re
import sys
from typing import Iterable, Mapping

from ktown_defense.ktour_openapi import KTourOpenAPIClient
from ktown_defense.ktour_related import KTourRelatedClient, RelatedAttractionRecord


DEFAULT_BASE_YM = "202504"
BUSAN_RELATED_AREA_CODE = "26"
REGION_PREFIXES = (
    "부산광역시",
    "부산",
    "서울특별시",
    "서울",
    "인천광역시",
    "인천",
    "대구광역시",
    "대구",
    "대전광역시",
    "대전",
    "광주광역시",
    "광주",
    "울산광역시",
    "울산",
)
# 관광지, 문화시설, 행사, 여행코스, 레포츠만 추천한다. 숙박·쇼핑·음식점은
# 가까워도 "추천 관광지" 카드의 의도와 달라 후보에서 제외한다.
ALLOWED_CONTENT_TYPES = {"12", "14", "15", "25", "28"}


@dataclass(frozen=True)
class Recommendation:
    name: str
    content_id: str | None
    category: str | None
    latitude: float | None
    longitude: float | None
    distance_km: float | None
    image_url: str | None
    source: str
    related_rank: int | None
    score: float
    reasons: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "name": self.name,
            "contentId": self.content_id,
            "category": self.category,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "distanceKm": self.distance_km,
            "imageUrl": self.image_url,
            "source": self.source,
            "relatedRank": self.related_rank,
            "score": self.score,
            "reasons": list(self.reasons),
        }


@dataclass(frozen=True)
class RouteRecommendation:
    name: str
    content_id: str
    category: str | None
    latitude: float
    longitude: float
    from_start_km: float
    to_destination_km: float
    via_distance_km: float
    detour_km: float
    image_url: str | None
    reasons: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "name": self.name,
            "contentId": self.content_id,
            "category": self.category,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "fromStartKm": self.from_start_km,
            "toDestinationKm": self.to_destination_km,
            "viaDistanceKm": self.via_distance_km,
            "detourKm": self.detour_km,
            "imageUrl": self.image_url,
            "source": "KOREAN_TOURISM_LOCATION_API",
            "reasons": list(self.reasons),
        }


class PrototypeTourismClient(KTourOpenAPIClient):
    """The two KorService operations needed only by this prototype."""

    def search_keyword(self, keyword: str, *, limit: int = 50) -> list[Mapping[str, object]]:
        body = self._request(
            "searchKeyword2",
            {
                "keyword": keyword.strip(),
                "numOfRows": limit,
                "pageNo": 1,
                "arrange": "Q",
            },
        )
        return self._items(body)

    def location_based_list(
        self,
        *,
        longitude: float,
        latitude: float,
        radius: int,
        limit: int = 100,
    ) -> list[Mapping[str, object]]:
        body = self._request(
            "locationBasedList2",
            {
                "mapX": longitude,
                "mapY": latitude,
                "radius": radius,
                "arrange": "E",
                "numOfRows": limit,
                "pageNo": 1,
            },
        )
        return self._items(body)


class StandaloneTourismRecommender:
    def __init__(
        self,
        service_key: str,
        *,
        base_ym: str = DEFAULT_BASE_YM,
        tourism_client: PrototypeTourismClient | None = None,
        related_client: KTourRelatedClient | None = None,
    ) -> None:
        if not service_key.strip():
            raise ValueError("KTOUR_SERVICE_KEY is required")
        self.base_ym = base_ym
        self.tourism = tourism_client or PrototypeTourismClient(service_key=service_key)
        self.related = related_client or KTourRelatedClient(service_key=service_key)

    def recommend(self, place_name: str, *, limit: int = 3) -> tuple[Recommendation, ...]:
        if not place_name.strip():
            raise ValueError("place_name is required")
        if limit < 1 or limit > 10:
            raise ValueError("limit must be between 1 and 10")

        anchor = self._resolve_place(place_name)
        if anchor is None:
            raise LookupError(f"국문 관광정보에서 장소를 찾지 못했습니다: {place_name}")

        related_rows = self.related.search_related(
            keyword=place_name.strip(),
            area_code=_related_area_code(anchor),
            sigungu_code=_related_sigungu_code(anchor),
            base_ym=self.base_ym,
            limit=20,
        )
        recommendations = self._from_related(anchor, related_rows)
        if len(recommendations) < limit:
            recommendations.extend(
                self._from_nearby(
                    anchor,
                    excluded_names={item.name for item in recommendations},
                )
            )

        deduplicated: dict[str, Recommendation] = {}
        anchor_key = _normalize(str(anchor.get("title", place_name)))
        for item in recommendations:
            key = item.content_id or _normalize(item.name)
            if _normalize(item.name) == anchor_key or key in deduplicated:
                continue
            deduplicated[key] = item
        return tuple(
            sorted(
                deduplicated.values(),
                key=lambda item: (-item.score, item.distance_km or 9999, item.name),
            )[:limit]
        )

    def recommend_between(
        self,
        start_name: str,
        destination_name: str,
        *,
        limit: int = 5,
        max_detour_km: float = 5.0,
    ) -> tuple[RouteRecommendation, ...]:
        """Recommend tourism stops ranked by extra straight-line detour distance."""
        if limit < 1 or limit > 10:
            raise ValueError("limit must be between 1 and 10")
        if max_detour_km < 0:
            raise ValueError("max_detour_km must not be negative")
        start = self._resolve_place(start_name)
        destination = self._resolve_place(destination_name)
        if start is None:
            raise LookupError(f"국문 관광정보에서 장소를 찾지 못했습니다: {start_name}")
        if destination is None:
            raise LookupError(f"국문 관광정보에서 장소를 찾지 못했습니다: {destination_name}")

        direct_distance = _distance_km(start, destination)
        midpoint = {
            "mapy": (float(start["mapy"]) + float(destination["mapy"])) / 2,
            "mapx": (float(start["mapx"]) + float(destination["mapx"])) / 2,
        }
        midpoint_radius = min(20000, max(5000, int(direct_distance * 500 + 3000)))
        searches = (
            (start, min(10000, max(3000, midpoint_radius // 2))),
            (midpoint, midpoint_radius),
            (destination, min(10000, max(3000, midpoint_radius // 2))),
        )
        candidates: dict[str, Mapping[str, object]] = {}
        for center, radius in searches:
            records = self.tourism.location_based_list(
                longitude=float(center["mapx"]),
                latitude=float(center["mapy"]),
                radius=radius,
                limit=100,
            )
            for item in records:
                if _valid_place(item):
                    content_id = str(item.get("contentid", "")).strip()
                    if content_id:
                        candidates.setdefault(content_id, item)

        endpoint_ids = {
            str(start.get("contentid", "")).strip(),
            str(destination.get("contentid", "")).strip(),
        }
        ranked: list[RouteRecommendation] = []
        for content_id, item in candidates.items():
            if content_id in endpoint_ids:
                continue
            from_start = _distance_km(start, item)
            to_destination = _distance_km(item, destination)
            via_distance = from_start + to_destination
            detour = max(0.0, via_distance - direct_distance)
            if detour > max_detour_km:
                continue
            title = str(item.get("title", "")).strip()
            ranked.append(
                RouteRecommendation(
                    name=title,
                    content_id=content_id,
                    category=_category(item),
                    latitude=float(item["mapy"]),
                    longitude=float(item["mapx"]),
                    from_start_km=round(from_start, 2),
                    to_destination_km=round(to_destination, 2),
                    via_distance_km=round(via_distance, 2),
                    detour_km=round(detour, 2),
                    image_url=str(item.get("firstimage", "")).strip() or None,
                    reasons=(
                        f"예상 직선 우회거리 +{detour:.1f}km",
                        f"출발지에서 {from_start:.1f}km",
                        f"도착지까지 {to_destination:.1f}km",
                    ),
                )
            )
        ranked.sort(
            key=lambda item: (
                item.detour_km,
                item.via_distance_km,
                item.content_id,
            )
        )
        return tuple(ranked[:limit])

    def _resolve_place(self, name: str) -> Mapping[str, object] | None:
        target = _normalize(name)
        best: tuple[int, Mapping[str, object]] | None = None
        for query in _search_queries(name):
            for item in self.tourism.search_keyword(query, limit=50):
                if not _valid_place(item):
                    continue
                title = _normalize(str(item.get("title", "")))
                score = _name_match_score(target, title)
                if best is None or score > best[0]:
                    best = (score, item)
            if best is not None and best[0] >= 100:
                break
        return best[1] if best is not None and best[0] >= 60 else None

    def _from_related(
        self,
        anchor: Mapping[str, object],
        rows: Iterable[RelatedAttractionRecord],
    ) -> list[Recommendation]:
        output: list[Recommendation] = []
        for row in rows:
            detail = self._resolve_place(row.related_name)
            if detail is None:
                output.append(
                    Recommendation(
                        name=row.related_name,
                        content_id=None,
                        category=row.category_medium or row.category_large,
                        latitude=None,
                        longitude=None,
                        distance_km=None,
                        image_url=None,
                        source="RELATED_ATTRACTION_API",
                        related_rank=row.rank,
                        score=round(max(0.4, 1.0 - (row.rank - 1) * 0.06), 3),
                        reasons=(f"연관 관광지 {row.rank}위",),
                    )
                )
                continue
            distance = _distance_km(anchor, detail)
            score = _score(row.rank, distance, detail)
            output.append(
                Recommendation(
                    name=str(detail.get("title") or row.related_name).strip(),
                    content_id=str(detail.get("contentid", "")).strip() or None,
                    category=_category(detail) or row.category_medium or row.category_large,
                    latitude=float(detail["mapy"]),
                    longitude=float(detail["mapx"]),
                    distance_km=round(distance, 2),
                    image_url=str(detail.get("firstimage", "")).strip() or None,
                    source="RELATED_ATTRACTION_API",
                    related_rank=row.rank,
                    score=score,
                    reasons=(f"연관 관광지 {row.rank}위", f"직선거리 {distance:.1f}km"),
                )
            )
        return output

    def _from_nearby(
        self,
        anchor: Mapping[str, object],
        *,
        excluded_names: set[str],
    ) -> list[Recommendation]:
        records = self.tourism.location_based_list(
            longitude=float(anchor["mapx"]),
            latitude=float(anchor["mapy"]),
            radius=5000,
            limit=100,
        )
        if not records:
            records = self.tourism.location_based_list(
                longitude=float(anchor["mapx"]),
                latitude=float(anchor["mapy"]),
                radius=10000,
                limit=100,
            )
        excluded = {_normalize(value) for value in excluded_names}
        anchor_id = str(anchor.get("contentid", "")).strip()
        output: list[Recommendation] = []
        for item in records:
            if not _valid_place(item):
                continue
            content_id = str(item.get("contentid", "")).strip()
            title = str(item.get("title", "")).strip()
            if content_id == anchor_id or _normalize(title) in excluded:
                continue
            distance = _distance_km(anchor, item)
            score = _score(None, distance, item)
            output.append(
                Recommendation(
                    name=title,
                    content_id=content_id,
                    category=_category(item),
                    latitude=float(item["mapy"]),
                    longitude=float(item["mapx"]),
                    distance_km=round(distance, 2),
                    image_url=str(item.get("firstimage", "")).strip() or None,
                    source="KOREAN_TOURISM_LOCATION_API",
                    related_rank=None,
                    score=score,
                    reasons=("주변 관광정보 후보", f"직선거리 {distance:.1f}km"),
                )
            )
        return output


def _search_queries(name: str) -> tuple[str, ...]:
    stripped = name.strip()
    queries = [stripped]
    for prefix in REGION_PREFIXES:
        if stripped.startswith(prefix) and len(stripped) > len(prefix) + 1:
            queries.append(stripped[len(prefix) :].strip())
    compact = re.sub(r"\s+", "", stripped)
    if compact not in queries:
        queries.append(compact)
    return tuple(dict.fromkeys(query for query in queries if query))


def _normalize(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", value).casefold()


def _name_match_score(target: str, candidate: str) -> int:
    if candidate == target:
        return 100
    if target in candidate:
        return 90 - min(20, len(candidate) - len(target))
    reduced_target = target
    for prefix in REGION_PREFIXES:
        normalized_prefix = _normalize(prefix)
        if reduced_target.startswith(normalized_prefix):
            reduced_target = reduced_target[len(normalized_prefix) :]
            break
    if reduced_target and reduced_target in candidate:
        return 75 - min(15, len(candidate) - len(reduced_target))
    return 0


def _valid_place(item: Mapping[str, object]) -> bool:
    content_type = str(item.get("contenttypeid", "")).strip()
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        return False
    try:
        latitude = float(item["mapy"])
        longitude = float(item["mapx"])
    except (KeyError, TypeError, ValueError):
        return False
    return -90 <= latitude <= 90 and -180 <= longitude <= 180


def _category(item: Mapping[str, object]) -> str | None:
    value = item.get("cat3") or item.get("cat2") or item.get("contenttypeid")
    return str(value).strip() or None


def _related_area_code(anchor: Mapping[str, object]) -> str:
    return str(anchor.get("lDongRegnCd") or BUSAN_RELATED_AREA_CODE).strip()


def _related_sigungu_code(anchor: Mapping[str, object]) -> str:
    region = _related_area_code(anchor)
    sigungu = str(anchor.get("lDongSignguCd", "")).strip()
    if not sigungu:
        raise LookupError("연관 관광지 조회에 필요한 법정동 시군구 코드를 찾지 못했습니다.")
    return sigungu if sigungu.startswith(region) else f"{region}{sigungu}"


def _distance_km(first: Mapping[str, object], second: Mapping[str, object]) -> float:
    from math import asin, cos, radians, sin, sqrt

    lat1 = radians(float(first["mapy"]))
    lon1 = radians(float(first["mapx"]))
    lat2 = radians(float(second["mapy"]))
    lon2 = radians(float(second["mapx"]))
    delta_lat = lat2 - lat1
    delta_lon = lon2 - lon1
    value = sin(delta_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(delta_lon / 2) ** 2
    return 6371.0088 * 2 * asin(sqrt(value))


def _score(
    related_rank: int | None,
    distance_km: float,
    item: Mapping[str, object],
) -> float:
    related = max(0.0, 1.0 - ((related_rank or 10) - 1) * 0.07) if related_rank else 0.0
    distance = max(0.0, 1.0 - distance_km / 10.0)
    quality = (
        int(bool(str(item.get("firstimage", "")).strip()))
        + int(bool(str(item.get("addr1", "")).strip()))
    ) / 2
    source_weight = 0.55 if related_rank else 0.0
    distance_weight = 0.30 if related_rank else 0.75
    quality_weight = 0.15 if related_rank else 0.25
    return round(source_weight * related + distance_weight * distance + quality_weight * quality, 3)


def _load_dotenv(path: Path = Path(".env")) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="관광지명을 받아 연관/주변 추천 관광지를 출력합니다."
    )
    parser.add_argument("places", nargs="+", help="예: 부산아시아드주경기장 감천문화마을")
    parser.add_argument("--limit", type=int, default=3, help="장소별 추천 개수 (기본 3)")
    parser.add_argument(
        "--route",
        action="store_true",
        help="두 장소 사이에 거쳐 갈 관광지를 우회거리순으로 추천",
    )
    parser.add_argument(
        "--max-detour-km",
        type=float,
        default=5.0,
        help="경유 시 허용할 최대 직선 우회거리 (기본 5km)",
    )
    parser.add_argument("--base-ym", default=None, help="연관 관광지 기준월 YYYYMM")
    parser.add_argument("--json", action="store_true", help="JSON으로 출력")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    _load_dotenv()
    service_key = os.getenv("KTOUR_SERVICE_KEY", "").strip()
    if not service_key:
        print("KTOUR_SERVICE_KEY가 필요합니다. .env 또는 환경변수에 설정해 주세요.", file=sys.stderr)
        return 2
    recommender = StandaloneTourismRecommender(
        service_key,
        base_ym=args.base_ym or os.getenv("KTOUR_RELATED_BASE_YM", DEFAULT_BASE_YM),
    )
    output: dict[str, object]
    if args.route:
        if len(args.places) != 2:
            print("--route는 출발지와 도착지 두 장소가 필요합니다.", file=sys.stderr)
            return 2
        route_key = f"{args.places[0]} → {args.places[1]}"
        try:
            output = {
                route_key: [
                    item.to_dict()
                    for item in recommender.recommend_between(
                        args.places[0],
                        args.places[1],
                        limit=args.limit,
                        max_detour_km=args.max_detour_km,
                    )
                ]
            }
        except Exception as exc:
            output = {route_key: {"error": str(exc)}}
    else:
        output = {}
        for place in args.places:
            try:
                output[place] = [
                    item.to_dict() for item in recommender.recommend(place, limit=args.limit)
                ]
            except Exception as exc:
                output[place] = {"error": str(exc)}
    if args.json:
        print(json.dumps(output, ensure_ascii=False, indent=2))
    else:
        for place, result in output.items():
            print(f"\n[{place}]")
            if isinstance(result, dict):
                print(f"  오류: {result['error']}")
                continue
            for index, item in enumerate(result, start=1):
                reasons = " · ".join(item["reasons"])
                if "detourKm" in item:
                    print(f"  {index}. {item['name']} (우회 +{item['detourKm']:.2f}km)")
                else:
                    print(f"  {index}. {item['name']} ({item['score']:.3f})")
                print(f"     {reasons} · 출처: {item['source']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
