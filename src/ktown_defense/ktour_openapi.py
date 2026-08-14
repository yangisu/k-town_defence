"""한국관광공사 국문 관광정보 OpenAPI(KorService2) adapter."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from html import unescape
import json
import os
from pathlib import Path
import re
import time
from typing import Callable, Iterable, Mapping
from urllib.parse import quote, unquote, urlencode
from urllib.request import Request, urlopen

from .catalog_sync import TourismPlaceRecord, TourismSnapshot


KTOUR_BASE_URL = "https://apis.data.go.kr/B551011/KorService2"
KTOUR_DATASET_URI = "https://www.data.go.kr/data/15101578/openapi.do"
KTOUR_RIGHTS_URI = "https://www.data.go.kr/data/15101578/openapi.do"
_HTML_TAG = re.compile(r"<[^>]+>")


class KTourAPIError(RuntimeError):
    """Raised when the TourAPI transport or response contract fails."""


@dataclass(frozen=True)
class KTourKeywordQuery:
    """Operator-owned fan-place association applied to KTO tourism records."""

    artist_id: str
    keyword: str
    transit_guide_ko: str
    place_type: str = "verified"
    rights_expires_at: datetime | None = None

    def __post_init__(self) -> None:
        if not all(
            value.strip()
            for value in (self.artist_id, self.keyword, self.transit_guide_ko)
        ):
            raise ValueError("artist_id, keyword and Korean transit guide are required")


Transport = Callable[[str, float], bytes]


def _dotenv_values(path: Path = Path(".env")) -> dict[str, str]:
    if not path.is_file():
        return {}
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name = name.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        if name:
            values[name] = value
    return values


def _default_transport(url: str, timeout: float) -> bytes:
    request = Request(url, headers={"Accept": "application/json"})
    with urlopen(request, timeout=timeout) as response:
        return response.read()


class KTourOpenAPIClient:
    """Fetches pageable Korean tourism data and returns a catalog snapshot."""

    def __init__(
        self,
        *,
        service_key: str,
        mobile_app: str = "KTownDefense",
        page_size: int = 100,
        timeout_seconds: float = 10.0,
        max_attempts: int = 3,
        transport: Transport | None = None,
        sleep: Callable[[float], None] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        if not service_key.strip():
            raise ValueError("한국관광공사 OpenAPI service key is required")
        if not mobile_app.strip():
            raise ValueError("MobileApp is required")
        if page_size < 1 or page_size > 1000:
            raise ValueError("page_size must be between 1 and 1000")
        if timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")
        if max_attempts < 1:
            raise ValueError("max_attempts must be positive")
        # data.go.kr exposes both encoded and decoded keys. Normalize, then
        # urlencode exactly once when building each request.
        self._service_key = unquote(service_key.strip())
        self._mobile_app = mobile_app.strip()
        self._page_size = page_size
        self._timeout_seconds = timeout_seconds
        self._max_attempts = max_attempts
        self._transport = transport or _default_transport
        self._sleep = sleep or time.sleep
        self._clock = clock or (lambda: datetime.now(timezone.utc))

    @classmethod
    def from_env(cls, **kwargs: object) -> "KTourOpenAPIClient":
        """Build a client without placing the service key in source control."""

        dotenv = _dotenv_values()
        service_key = os.environ.get(
            "KTOUR_SERVICE_KEY", dotenv.get("KTOUR_SERVICE_KEY", "")
        )
        if not service_key.strip():
            raise ValueError("KTOUR_SERVICE_KEY environment variable is required")
        mobile_app = os.environ.get(
            "KTOUR_MOBILE_APP", dotenv.get("KTOUR_MOBILE_APP", "KTownDefense")
        )
        return cls(service_key=service_key, mobile_app=mobile_app, **kwargs)

    def fetch_snapshot(
        self, queries: Iterable[KTourKeywordQuery]
    ) -> TourismSnapshot:
        records: list[TourismPlaceRecord] = []
        modified_times: list[str] = []
        seen_links: set[tuple[str, str]] = set()

        for query in queries:
            for item in self._search_keyword(query.keyword):
                content_id = self._required_text(item, "contentid")
                link_key = (content_id, query.artist_id)
                if link_key in seen_links:
                    continue
                record = self._to_record(query, item)
                records.append(record)
                seen_links.add(link_key)
                modified = str(item.get("modifiedtime", "")).strip()
                if modified:
                    modified_times.append(modified)

        if not records:
            raise KTourAPIError("TourAPI queries returned zero tourism places")

        version_basis = max(modified_times) if modified_times else self._timestamp()
        return TourismSnapshot(
            snapshot_version=f"KTOUR-{version_basis}-{len(records)}",
            snapshot_uri=KTOUR_DATASET_URI,
            records=tuple(records),
        )

    def _search_keyword(self, keyword: str) -> list[Mapping[str, object]]:
        page = 1
        all_items: list[Mapping[str, object]] = []
        while True:
            body = self._request(
                "searchKeyword2",
                {
                    "keyword": keyword,
                    "numOfRows": self._page_size,
                    "pageNo": page,
                    "arrange": "Q",
                },
            )
            items = self._items(body)
            all_items.extend(items)
            total_count = int(body.get("totalCount", len(all_items)))
            if len(all_items) >= total_count or not items:
                return all_items
            page += 1

    def _to_record(
        self, query: KTourKeywordQuery, item: Mapping[str, object]
    ) -> TourismPlaceRecord:
        content_id = self._required_text(item, "contentid")
        detail = self._detail_common(content_id)
        title = self._required_text(item, "title")
        address = " ".join(
            value
            for value in (
                str(item.get("addr1", "")).strip(),
                str(item.get("addr2", "")).strip(),
            )
            if value
        )
        if not address:
            raise KTourAPIError(f"content {content_id} has no Korean address")
        overview = self._plain_text(str(detail.get("overview", "")))
        if not overview:
            raise KTourAPIError(f"content {content_id} has no Korean overview")
        latitude = self._coordinate(item, "mapy", -90.0, 90.0)
        longitude = self._coordinate(item, "mapx", -180.0, 180.0)
        area_code = str(item.get("areacode") or detail.get("areacode") or "").strip()
        sigungu_code = str(
            item.get("sigungucode") or detail.get("sigungucode") or ""
        ).strip()
        if not area_code:
            area_code = str(
                item.get("lDongRegnCd") or detail.get("lDongRegnCd") or ""
            ).strip()
            sigungu_code = str(
                item.get("lDongSignguCd") or detail.get("lDongSignguCd") or ""
            ).strip()
        admin_area_code = ":".join(value for value in (area_code, sigungu_code) if value)
        if not admin_area_code:
            raise KTourAPIError(f"content {content_id} has no area code")
        evidence_uri = f"{KTOUR_BASE_URL}/detailCommon2?contentId={quote(content_id)}"
        map_deep_link = (
            f"https://map.kakao.com/link/map/{quote(title)},{latitude},{longitude}"
        )
        return TourismPlaceRecord(
            place_id=f"ktour:{content_id}",
            artist_id=query.artist_id,
            name_ko=title,
            address_ko=address,
            description_ko=overview,
            transit_guide_ko=query.transit_guide_ko,
            map_deep_link=map_deep_link,
            latitude=latitude,
            longitude=longitude,
            admin_area_code=admin_area_code,
            place_type=query.place_type,
            place_evidence_uri=evidence_uri,
            rights_evidence_uri=KTOUR_RIGHTS_URI,
            rights_expires_at=query.rights_expires_at,
        )

    def _detail_common(self, content_id: str) -> Mapping[str, object]:
        items = self._items(
            self._request("detailCommon2", {"contentId": content_id})
        )
        if not items:
            raise KTourAPIError(f"detailCommon2 returned no item for {content_id}")
        return items[0]

    def _request(
        self, operation: str, operation_params: Mapping[str, object]
    ) -> Mapping[str, object]:
        params: dict[str, object] = {
            "serviceKey": self._service_key,
            "MobileOS": "ETC",
            "MobileApp": self._mobile_app,
            "_type": "json",
        }
        params.update(operation_params)
        url = f"{KTOUR_BASE_URL}/{operation}?{urlencode(params)}"
        payload: bytes | None = None
        for attempt in range(1, self._max_attempts + 1):
            try:
                payload = self._transport(url, self._timeout_seconds)
                break
            except Exception as exc:
                if attempt == self._max_attempts:
                    raise KTourAPIError(
                        f"TourAPI request failed after {attempt} attempts: {operation}"
                    ) from exc
                self._sleep(0.25 * (2 ** (attempt - 1)))
        try:
            assert payload is not None
            document = json.loads(payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise KTourAPIError("TourAPI returned invalid JSON") from exc

        if isinstance(document, Mapping) and "response" not in document:
            top_level_code = document.get("resultCode")
            if top_level_code is not None:
                top_level_message = str(document.get("resultMsg", ""))
                raise KTourAPIError(
                    f"TourAPI error {top_level_code}: {top_level_message}"
                )

        try:
            response = document["response"]
            header = response["header"]
            result_code = str(header["resultCode"])
            result_message = str(header.get("resultMsg", ""))
        except (KeyError, TypeError) as exc:
            raise KTourAPIError("TourAPI response contract is invalid") from exc
        if result_code != "0000":
            raise KTourAPIError(f"TourAPI error {result_code}: {result_message}")
        body = response.get("body")
        if not isinstance(body, Mapping):
            raise KTourAPIError("TourAPI response body is invalid")
        return body

    @staticmethod
    def _items(body: Mapping[str, object]) -> list[Mapping[str, object]]:
        container = body.get("items")
        if container in (None, ""):
            return []
        if not isinstance(container, Mapping):
            raise KTourAPIError("TourAPI items contract is invalid")
        raw_items = container.get("item", [])
        if isinstance(raw_items, Mapping):
            return [raw_items]
        if isinstance(raw_items, list) and all(
            isinstance(item, Mapping) for item in raw_items
        ):
            return raw_items
        raise KTourAPIError("TourAPI item contract is invalid")

    @staticmethod
    def _required_text(item: Mapping[str, object], field: str) -> str:
        value = str(item.get(field, "")).strip()
        if not value:
            raise KTourAPIError(f"TourAPI item is missing {field}")
        return value

    @staticmethod
    def _coordinate(
        item: Mapping[str, object], field: str, minimum: float, maximum: float
    ) -> float:
        try:
            value = float(item[field])
        except (KeyError, TypeError, ValueError) as exc:
            raise KTourAPIError(f"TourAPI item has invalid {field}") from exc
        if value < minimum or value > maximum:
            raise KTourAPIError(f"TourAPI item has out-of-range {field}")
        return value

    @staticmethod
    def _plain_text(value: str) -> str:
        return " ".join(unescape(_HTML_TAG.sub(" ", value)).split())

    def _timestamp(self) -> str:
        return self._clock().astimezone(timezone.utc).strftime("%Y%m%d%H%M%S")
