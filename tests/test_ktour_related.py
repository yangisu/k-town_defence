from __future__ import annotations

import json
from urllib.parse import parse_qs, urlparse

import pytest

from ktown_defense.ktour_openapi import KTourAPIError
from ktown_defense.ktour_related import KTourRelatedClient


def response(items: list[dict[str, object]]) -> bytes:
    return json.dumps({
        "response": {
            "header": {"resultCode": "0000", "resultMsg": "OK"},
            "body": {"items": {"item": items}, "totalCount": len(items)},
        }
    }).encode()


def test_search_related_parses_candidates_and_preserves_request_contract() -> None:
    urls: list[str] = []

    def transport(url: str, timeout: float) -> bytes:
        urls.append(url)
        return response([{
            "tAtsNm": "감천문화마을",
            "rlteTatsCd": "126508",
            "rlteTatsNm": "부산시민공원",
            "rlteRegnCd": "26",
            "rlteSignguCd": "3",
            "rlteCtgryLclsNm": "인문(문화/예술/역사)",
            "rlteCtgryMclsNm": "문화시설",
            "rlteCtgrySclsNm": "공원",
            "rlteRank": "2",
            "baseYm": "202609",
        }])

    records = KTourRelatedClient(service_key="service-key", transport=transport).search_related(
        keyword="감천문화마을",
        area_code="26",
        sigungu_code="10",
        base_ym="202609",
        limit=5,
    )

    assert records[0].related_name == "부산시민공원"
    assert records[0].rank == 2
    params = parse_qs(urlparse(urls[0]).query)
    assert urlparse(urls[0]).path.endswith("/TarRlteTarService1/searchKeyword1")
    assert params["keyword"] == ["감천문화마을"]
    assert params["areaCd"] == ["26"]
    assert params["signguCd"] == ["10"]
    assert params["baseYm"] == ["202609"]


def test_search_related_accepts_empty_items() -> None:
    client = KTourRelatedClient(
        service_key="service-key",
        transport=lambda url, timeout: response([]),
    )

    assert client.search_related(
        keyword="없는 장소", area_code="26", sigungu_code=None, base_ym="202609"
    ) == ()


def test_list_area_related_uses_tar_related_five_digit_sigungu_code() -> None:
    urls: list[str] = []

    def transport(url: str, timeout: float) -> bytes:
        urls.append(url)
        return response([{
            "tAtsNm": "중심 관광지",
            "rlteTatsCd": "related-code",
            "rlteTatsNm": "연관 관광지",
            "rlteRank": "1",
        }])

    records = KTourRelatedClient(service_key="service-key", transport=transport).list_area_related(
        area_code="26", sigungu_code="26380", base_ym="202504", limit=5
    )

    assert records[0].source_name == "중심 관광지"
    params = parse_qs(urlparse(urls[0]).query)
    assert urlparse(urls[0]).path.endswith("/TarRlteTarService1/areaBasedList1")
    assert params["signguCd"] == ["26380"]


def test_area_code_mapping_is_separate_from_internal_region_code() -> None:
    assert KTourRelatedClient.area_code_for_region("6") == "26"


def test_invalid_rank_is_rejected() -> None:
    payload = response([{
        "tAtsNm": "감천문화마을",
        "rlteTatsCd": "126508",
        "rlteTatsNm": "부산시민공원",
        "rlteRank": "0",
    }])
    client = KTourRelatedClient(service_key="service-key", transport=lambda url, timeout: payload)

    with pytest.raises(KTourAPIError, match="rlteRank"):
        client.search_related(
            keyword="감천문화마을", area_code="26", sigungu_code=None, base_ym="202609"
        )