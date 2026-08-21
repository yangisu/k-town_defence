"""Busan-first KorService2 area catalog adapter."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Mapping

from .ktour_openapi import KTourAPIError, KTourOpenAPIClient


@dataclass(frozen=True)
class KTourAreaPlace:
    content_id: str
    name_ko: str
    address_ko: str
    latitude: float
    longitude: float
    region_code: str
    content_type_id: str | None
    category_code: str | None
    description_ko: str
    image_url: str | None
    source_modified_at: datetime | None


class KTourAreaClient(KTourOpenAPIClient):
    """Fetch a bounded, detail-enriched KTO area snapshot."""

    def fetch_places(self, *, area_code: str, limit: int) -> tuple[KTourAreaPlace, ...]:
        if not area_code.strip():
            raise ValueError("area_code is required")
        if limit < 1 or limit > 100:
            raise ValueError("limit must be between 1 and 100")

        items: list[Mapping[str, object]] = []
        page = 1
        while len(items) < limit:
            body = self._request(
                "areaBasedList2",
                {
                    "areaCode": area_code,
                    "numOfRows": min(self._page_size, limit - len(items)),
                    "pageNo": page,
                    "arrange": "Q",
                },
            )
            page_items = self._items(body)
            items.extend(page_items)
            total_count = int(body.get("totalCount", len(items)))
            if len(items) >= total_count or not page_items:
                break
            page += 1

        newest: dict[str, Mapping[str, object]] = {}
        for item in items[:limit]:
            content_id = self._required_text(item, "contentid")
            current = newest.get(content_id)
            if current is None or str(item.get("modifiedtime", "")) >= str(
                current.get("modifiedtime", "")
            ):
                newest[content_id] = item

        places = tuple(self._to_area_place(item) for item in newest.values())
        if not places:
            raise KTourAPIError("TourAPI queries returned zero tourism places")
        return places

    def _to_area_place(self, item: Mapping[str, object]) -> KTourAreaPlace:
        content_id = self._required_text(item, "contentid")
        detail_items = self._items(
            self._request(
                "detailCommon2",
                {
                    "contentId": content_id,
                    "defaultYN": "Y",
                    "firstImageYN": "Y",
                    "areacodeYN": "Y",
                    "catcodeYN": "Y",
                    "addrinfoYN": "Y",
                    "mapinfoYN": "Y",
                    "overviewYN": "Y",
                },
            )
        )
        if not detail_items:
            raise KTourAPIError(f"detailCommon2 returned no item for {content_id}")
        detail = detail_items[0]
        address = " ".join(
            value
            for value in (
                str(item.get("addr1") or detail.get("addr1") or "").strip(),
                str(item.get("addr2") or detail.get("addr2") or "").strip(),
            )
            if value
        )
        if not address:
            raise KTourAPIError(f"content {content_id} has no Korean address")
        description = self._plain_text(str(detail.get("overview", "")))
        if not description:
            raise KTourAPIError(f"content {content_id} has no Korean overview")
        image = str(item.get("firstimage") or detail.get("firstimage") or "").strip()
        modified = str(item.get("modifiedtime", "")).strip()
        return KTourAreaPlace(
            content_id=content_id,
            name_ko=self._required_text(item, "title"),
            address_ko=address,
            latitude=self._coordinate(item, "mapy", -90.0, 90.0),
            longitude=self._coordinate(item, "mapx", -180.0, 180.0),
            region_code=str(item.get("areacode") or detail.get("areacode") or "").strip(),
            content_type_id=str(item.get("contenttypeid") or "").strip() or None,
            category_code=str(item.get("cat3") or detail.get("cat3") or "").strip() or None,
            description_ko=description,
            image_url=image if image.startswith("https://") else None,
            source_modified_at=self._parse_modified(modified),
        )

    @staticmethod
    def _parse_modified(value: str) -> datetime | None:
        if not value:
            return None
        try:
            return datetime.strptime(value, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
        except ValueError as exc:
            raise KTourAPIError("TourAPI item has invalid modifiedtime") from exc
