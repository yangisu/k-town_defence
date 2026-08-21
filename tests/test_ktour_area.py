from __future__ import annotations

from datetime import timezone
import json
from urllib.parse import parse_qs, urlparse

import pytest

from ktown_defense.ktour_openapi import KTourAPIError
from ktown_defense.ktour_area import KTourAreaClient


def response(items: list[dict[str, object]], total_count: int) -> bytes:
    return json.dumps(
        {
            "response": {
                "header": {"resultCode": "0000", "resultMsg": "OK"},
                "body": {"items": {"item": items}, "totalCount": total_count},
            }
        }
    ).encode()


class AreaTransport:
    def __init__(self) -> None:
        self.urls: list[str] = []

    def __call__(self, url: str, timeout: float) -> bytes:
        self.urls.append(url)
        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        operation = parsed.path.rsplit("/", 1)[-1]
        if operation == "areaBasedList2":
            page = int(params["pageNo"][0])
            item = {
                "contentid": str(100 + page),
                "contenttypeid": "12",
                "title": f"부산 관광지 {page}",
                "addr1": "부산광역시 중구",
                "addr2": f"테스트로 {page}",
                "mapx": "129.01",
                "mapy": "35.10",
                "areacode": "6",
                "cat3": "A01010100",
                "firstimage": "https://images.example/place.jpg",
                "modifiedtime": f"20260821090{page}00",
            }
            return response([item], 3)
        if operation == "detailCommon2":
            assert set(params) == {
                "serviceKey", "MobileOS", "MobileApp", "_type", "contentId"
            }
            return response(
                [{"contentid": params["contentId"][0], "overview": "<b>공식</b> 한국어 설명"}],
                1,
            )
        raise AssertionError(operation)


def test_fetch_places_pages_busan_and_enriches_detail() -> None:
    transport = AreaTransport()
    client = KTourAreaClient(
        service_key="decoded-key", page_size=1, transport=transport
    )

    places = client.fetch_places(area_code="6", limit=3)

    assert [place.content_id for place in places] == ["101", "102", "103"]
    assert places[0].region_code == "6"
    assert places[0].description_ko == "공식 한국어 설명"
    assert places[0].image_url == "https://images.example/place.jpg"
    assert places[0].source_modified_at.tzinfo == timezone.utc
    area_urls = [url for url in transport.urls if "areaBasedList2" in url]
    assert len(area_urls) == 3
    first = parse_qs(urlparse(area_urls[0]).query)
    assert first["areaCode"] == ["6"]
    assert first["MobileOS"] == ["ETC"]
    assert "decoded-key" not in repr(places)


def test_fetch_places_rejects_empty_snapshot() -> None:
    client = KTourAreaClient(
        service_key="secret",
        transport=lambda url, timeout: response([], 0),
    )

    with pytest.raises(KTourAPIError, match="zero tourism places"):
        client.fetch_places(area_code="6", limit=100)
