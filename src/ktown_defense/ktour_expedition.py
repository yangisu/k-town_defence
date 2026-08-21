"""Typed tourism OpenAPI adapter for explainable regional expeditions."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
import re
from typing import Mapping
from urllib.parse import urlsplit, urlunsplit

from .ktour_openapi import KTourAPIError, KTourOpenAPIClient
from .open_data_observability import OpenApiCallObservation, safe_error_code


_HREF = re.compile(r"href=[\"']([^\"']+)[\"']", re.IGNORECASE)


@dataclass(frozen=True)
class TourismPlaceDetail:
    content_id: str
    content_type_id: str
    name_ko: str
    address_ko: str
    latitude: float
    longitude: float
    region_code: str
    category_code: str | None
    description_ko: str
    image_url: str | None
    homepage_url: str | None
    telephone: str | None
    open_time: str | None
    rest_date: str | None
    parking: str | None
    intro: dict[str, object]
    info: tuple[dict[str, object], ...]
    image_urls: tuple[str, ...]
    festival_start_date: date | None
    festival_end_date: date | None
    discovery_keywords: tuple[str, ...]
    source_operations: tuple[str, ...]
    source_modified_at: datetime | None


@dataclass(frozen=True)
class TourismExpeditionSnapshot:
    places: tuple[TourismPlaceDetail, ...]
    observations: tuple[OpenApiCallObservation, ...]
    changed_content_ids: tuple[str, ...]
    deleted_content_ids: tuple[str, ...] = ()


class KTourExpeditionClient(KTourOpenAPIClient):
    """Fetch and enrich a bounded area snapshot using official operation shapes."""

    @property
    def observations(self) -> tuple[OpenApiCallObservation, ...]:
        return tuple(getattr(self, "_observations", ()))

    def fetch_snapshot(
        self,
        *,
        area_code: str,
        keywords: tuple[str, ...],
        start_date: date,
        end_date: date,
        limit: int,
        force_full: bool = False,
        modified_since: datetime | None = None,
    ) -> TourismExpeditionSnapshot:
        if not area_code.strip():
            raise ValueError("area_code is required")
        if limit < 1 or limit > 100:
            raise ValueError("limit must be between 1 and 100")
        if end_date < start_date:
            raise ValueError("end_date must not be before start_date")

        self._observations: list[OpenApiCallObservation] = []
        sync_params: dict[str, object] = {
            "areaCode": area_code,
        }
        if modified_since is not None:
            sync_params["modifiedtime"] = modified_since.astimezone(timezone.utc).strftime(
                "%Y%m%d%H%M%S"
            )
        active_changed_items = self._all_pages(
            "areaBasedSyncList2",
            "incremental_catalog",
            {**sync_params, "showflag": "1"},
        )
        deleted_items = self._all_pages(
            "areaBasedSyncList2",
            "incremental_deletions",
            {**sync_params, "showflag": "0"},
        )
        changed_items = [*active_changed_items, *deleted_items]
        changed_ids = tuple(
            sorted(
                {
                    str(item.get("contentid", "")).strip()
                    for item in changed_items
                    if str(item.get("contentid", "")).strip()
                }
            )
        )
        deleted_ids = tuple(
            sorted(
                {
                    str(item.get("contentid", "")).strip()
                    for item in changed_items
                    if str(item.get("contentid", "")).strip()
                    and str(item.get("showflag", "")).strip() == "0"
                }
            )
        )

        candidates: dict[str, Mapping[str, object]] = {}
        operations: dict[str, set[str]] = {}
        keyword_matches: dict[str, set[str]] = {}
        self._merge_candidates(
            candidates, operations, active_changed_items, "areaBasedSyncList2"
        )

        area_items = self._paged(
            "areaBasedList2",
            "area_catalog",
            {"areaCode": area_code, "arrange": "Q"},
            limit,
        )
        self._merge_candidates(candidates, operations, area_items, "areaBasedList2")

        keyword_items: list[Mapping[str, object]] = []
        for keyword in self._unique_keywords(keywords):
            items = self._paged(
                "searchKeyword2",
                "keyword_anchor",
                {"keyword": keyword, "areaCode": area_code, "arrange": "Q"},
                limit,
            )
            keyword_items.extend(items)
            self._merge_candidates(candidates, operations, items, "searchKeyword2")
            for item in items:
                content_id = str(item.get("contentid", "")).strip()
                if content_id:
                    keyword_matches.setdefault(content_id, set()).add(keyword)

        anchor = next(
            (item for content_id, item in candidates.items() if content_id in keyword_matches),
            next(iter(candidates.values()), None),
        )
        nearby_items: list[Mapping[str, object]] = []
        if anchor is not None:
            nearby_items = self._paged(
                "locationBasedList2",
                "nearby_discovery",
                {
                    "mapX": self._required_text(anchor, "mapx"),
                    "mapY": self._required_text(anchor, "mapy"),
                    "radius": 5000,
                    "arrange": "E",
                },
                limit,
            )
            self._merge_candidates(
                candidates, operations, nearby_items, "locationBasedList2"
            )
        else:
            raise KTourAPIError("TourAPI returned no anchor for nearby discovery")

        festival_items = self._paged(
            "searchFestival2",
            "travel_date_festival",
            {
                "areaCode": area_code,
                "eventStartDate": start_date.strftime("%Y%m%d"),
                "eventEndDate": end_date.strftime("%Y%m%d"),
                "arrange": "Q",
            },
            limit,
        )
        self._merge_candidates(
            candidates, operations, festival_items, "searchFestival2"
        )
        festivals: dict[str, tuple[date | None, date | None]] = {}
        for item in festival_items:
            festival_start = self._parse_date(str(item.get("eventstartdate", "")))
            festival_end = self._parse_date(str(item.get("eventenddate", "")))
            effective_end = festival_end or festival_start
            if (
                festival_start is not None
                and effective_end is not None
                and festival_start <= end_date
                and effective_end >= start_date
            ):
                festivals[self._required_text(item, "contentid")] = (
                    festival_start,
                    festival_end,
                )

        incremental_ids = set(changed_ids) - set(deleted_ids)
        prioritized_ids = self._prioritized_content_ids(
            [keyword_items, nearby_items, festival_items, active_changed_items],
            area_items,
            candidates,
        )
        enrichment_candidates = [
            (content_id, candidates[content_id]) for content_id in prioritized_ids
        ]
        if not force_full:
            enrichment_candidates = [
                (content_id, item)
                for content_id, item in enrichment_candidates
                if content_id in incremental_ids
            ]

        places: list[TourismPlaceDetail] = []
        selected_candidates = (
            enrichment_candidates[:limit] if force_full else enrichment_candidates
        )
        for content_id, item in selected_candidates:
            try:
                place = self._enrich_place(
                    item,
                    operations=operations.get(content_id, set()),
                    keywords=keyword_matches.get(content_id, set()),
                    festival_dates=festivals.get(content_id),
                    changed=content_id in changed_ids,
                )
            except KTourAPIError:
                continue
            places.append(place)

        if force_full and not places:
            raise KTourAPIError("TourAPI queries returned zero tourism places")
        return TourismExpeditionSnapshot(
            places=tuple(places),
            observations=tuple(self._observations),
            changed_content_ids=changed_ids,
            deleted_content_ids=deleted_ids,
        )

    @staticmethod
    def _prioritized_content_ids(
        feature_groups: list[list[Mapping[str, object]]],
        area_items: list[Mapping[str, object]],
        candidates: Mapping[str, Mapping[str, object]],
    ) -> tuple[str, ...]:
        """Interleave feature discoveries before filling capacity from the area catalog."""
        grouped_ids = [
            list(
                dict.fromkeys(
                    content_id
                    for item in group
                    if (content_id := str(item.get("contentid", "")).strip())
                    in candidates
                )
            )
            for group in feature_groups
        ]
        prioritized: list[str] = []
        seen: set[str] = set()
        for index in range(max((len(group) for group in grouped_ids), default=0)):
            for group in grouped_ids:
                if index < len(group) and group[index] not in seen:
                    prioritized.append(group[index])
                    seen.add(group[index])
        for item in area_items:
            content_id = str(item.get("contentid", "")).strip()
            if content_id in candidates and content_id not in seen:
                prioritized.append(content_id)
                seen.add(content_id)
        return tuple(prioritized)

    def _enrich_place(
        self,
        item: Mapping[str, object],
        *,
        operations: set[str],
        keywords: set[str],
        festival_dates: tuple[date | None, date | None] | None,
        changed: bool,
    ) -> TourismPlaceDetail:
        content_id = self._required_text(item, "contentid")
        content_type_id = self._required_text(item, "contenttypeid")
        successful = set(operations)
        if changed:
            successful.add("areaBasedSyncList2")

        common_items = self._items(
            self._observed_request(
                "detailCommon2",
                "place_common_detail",
                {"contentId": content_id},
            )
        )
        if not common_items:
            raise KTourAPIError(f"detailCommon2 returned no item for {content_id}")
        common = common_items[0]
        successful.add("detailCommon2")

        intro: dict[str, object] = {}
        info: tuple[dict[str, object], ...] = ()
        images: tuple[str, ...] = ()
        try:
            intro_items = self._items(
                self._observed_request(
                    "detailIntro2",
                    "operating_information",
                    {"contentId": content_id, "contentTypeId": content_type_id},
                )
            )
            intro = dict(intro_items[0]) if intro_items else {}
            if intro:
                successful.add("detailIntro2")
        except KTourAPIError:
            pass
        try:
            info_items = self._items(
                self._observed_request(
                    "detailInfo2",
                    "repeated_information",
                    {
                        "contentId": content_id,
                        "contentTypeId": content_type_id,
                        "numOfRows": 100,
                        "pageNo": 1,
                    },
                )
            )
            info = tuple(dict(value) for value in info_items)
            if info:
                successful.add("detailInfo2")
        except KTourAPIError:
            pass
        try:
            image_items = self._items(
                self._observed_request(
                    "detailImage2",
                    "image_gallery",
                    {
                        "contentId": content_id,
                        "imageYN": "Y",
                        "numOfRows": 100,
                        "pageNo": 1,
                    },
                )
            )
            contributed_images = self._https_images({}, {}, image_items)
            images = self._https_images(item, common, image_items)
            if contributed_images:
                successful.add("detailImage2")
        except KTourAPIError:
            pass

        address = " ".join(
            value
            for value in (
                str(item.get("addr1") or common.get("addr1") or "").strip(),
                str(item.get("addr2") or common.get("addr2") or "").strip(),
            )
            if value
        )
        if not address:
            raise KTourAPIError(f"content {content_id} has no Korean address")
        description = self._plain_text(str(common.get("overview", "")))
        if not description:
            raise KTourAPIError(f"content {content_id} has no Korean overview")

        festival_start, festival_end = festival_dates or (None, None)
        primary_image = images[0] if images else self._https_url(item.get("firstimage"))
        return TourismPlaceDetail(
            content_id=content_id,
            content_type_id=content_type_id,
            name_ko=self._required_text(item, "title"),
            address_ko=address,
            latitude=self._coordinate(item, "mapy", -90.0, 90.0),
            longitude=self._coordinate(item, "mapx", -180.0, 180.0),
            region_code=str(item.get("areacode") or common.get("areacode") or "").strip(),
            category_code=str(item.get("cat3") or common.get("cat3") or "").strip() or None,
            description_ko=description,
            image_url=primary_image,
            homepage_url=self._homepage(common.get("homepage")),
            telephone=self._optional_text(common.get("tel") or item.get("tel")),
            open_time=self._first_intro(intro, "usetime", "opentime", "playtime"),
            rest_date=self._first_intro(intro, "restdate", "restdateculture", "restdatefood"),
            parking=self._first_intro(intro, "parking", "parkingculture", "parkingfood"),
            intro=intro,
            info=info,
            image_urls=images,
            festival_start_date=festival_start,
            festival_end_date=festival_end,
            discovery_keywords=tuple(sorted(keywords)),
            source_operations=tuple(sorted(successful)),
            source_modified_at=self._parse_modified(str(item.get("modifiedtime", ""))),
        )

    def _observed_request(
        self,
        operation: str,
        feature: str,
        params: Mapping[str, object],
    ) -> Mapping[str, object]:
        started_at = self._clock()
        try:
            body = self._request(operation, params)
            count = len(self._items(body))
        except KTourAPIError as exc:
            self._observations.append(
                OpenApiCallObservation(
                    operation=operation,
                    feature=feature,
                    status="failed",
                    response_count=0,
                    error_code=safe_error_code(str(exc)),
                    started_at=started_at,
                    completed_at=self._clock(),
                )
            )
            raise
        self._observations.append(
            OpenApiCallObservation(
                operation=operation,
                feature=feature,
                status="succeeded",
                response_count=count,
                error_code=None,
                started_at=started_at,
                completed_at=self._clock(),
            )
        )
        return body

    def _paged(
        self,
        operation: str,
        feature: str,
        params: Mapping[str, object],
        limit: int,
    ) -> list[Mapping[str, object]]:
        items: list[Mapping[str, object]] = []
        page = 1
        while len(items) < limit:
            body = self._observed_request(
                operation,
                feature,
                {
                    **params,
                    "numOfRows": min(self._page_size, limit - len(items)),
                    "pageNo": page,
                },
            )
            page_items = self._items(body)
            items.extend(page_items)
            total_count = int(body.get("totalCount", len(items)))
            if len(items) >= total_count or not page_items:
                break
            page += 1
        return items[:limit]

    def _all_pages(
        self,
        operation: str,
        feature: str,
        params: Mapping[str, object],
    ) -> list[Mapping[str, object]]:
        items: list[Mapping[str, object]] = []
        page = 1
        while True:
            body = self._observed_request(
                operation,
                feature,
                {**params, "numOfRows": self._page_size, "pageNo": page},
            )
            page_items = self._items(body)
            items.extend(page_items)
            total_count = int(body.get("totalCount", len(items)))
            if total_count > 10_000:
                raise KTourAPIError("incremental change backlog exceeds safe maximum")
            if len(items) >= total_count or not page_items:
                return items
            page += 1

    @staticmethod
    def _merge_candidates(
        candidates: dict[str, Mapping[str, object]],
        operations: dict[str, set[str]],
        items: list[Mapping[str, object]],
        operation: str,
    ) -> None:
        for item in items:
            content_id = str(item.get("contentid", "")).strip()
            if not content_id:
                continue
            current = candidates.get(content_id)
            if current is None or str(item.get("modifiedtime", "")) >= str(
                current.get("modifiedtime", "")
            ):
                candidates[content_id] = item
            operations.setdefault(content_id, set()).add(operation)

    @staticmethod
    def _unique_keywords(keywords: tuple[str, ...]) -> tuple[str, ...]:
        return tuple(dict.fromkeys(value.strip() for value in keywords if value.strip()))

    @classmethod
    def _https_images(
        cls,
        item: Mapping[str, object],
        common: Mapping[str, object],
        image_items: list[Mapping[str, object]],
    ) -> tuple[str, ...]:
        values: list[object] = [item.get("firstimage"), common.get("firstimage")]
        for image in image_items:
            values.extend((image.get("originimgurl"), image.get("smallimageurl")))
        return tuple(
            dict.fromkeys(url for value in values if (url := cls._https_url(value)))
        )

    @staticmethod
    def _https_url(value: object) -> str | None:
        text = str(value or "").strip()
        if text.startswith("https://"):
            return text
        parsed = urlsplit(text)
        if parsed.scheme == "http" and parsed.netloc == "tong.visitkorea.or.kr":
            return urlunsplit(parsed._replace(scheme="https"))
        return None

    @classmethod
    def _homepage(cls, value: object) -> str | None:
        text = str(value or "").strip()
        match = _HREF.search(text)
        return cls._https_url(match.group(1) if match else text)

    @classmethod
    def _optional_text(cls, value: object) -> str | None:
        text = cls._plain_text(str(value or ""))
        return text or None

    @classmethod
    def _first_intro(cls, intro: Mapping[str, object], *fields: str) -> str | None:
        for field in fields:
            value = cls._optional_text(intro.get(field))
            if value:
                return value
        return None

    @staticmethod
    def _parse_date(value: str) -> date | None:
        try:
            return datetime.strptime(value.strip(), "%Y%m%d").date()
        except ValueError:
            return None

    @staticmethod
    def _parse_modified(value: str) -> datetime | None:
        try:
            return datetime.strptime(value.strip(), "%Y%m%d%H%M%S").replace(
                tzinfo=timezone.utc
            )
        except ValueError:
            return None
