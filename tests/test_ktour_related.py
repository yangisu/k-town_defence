import json
from urllib.parse import parse_qs, urlparse

from ktown_defense.ktour_related import KTourRelatedClient
from ktown_defense.related_attractions import RelatedAttractionService


def payload(items):
    return json.dumps({"response": {"header": {"resultCode": "0000"}, "body": {
        "items": {"item": items}, "totalCount": len(items)
    }}}).encode()


def test_related_adapter_uses_fixed_single_page_contract() -> None:
    urls = []
    client = KTourRelatedClient(
        service_key="secret", transport=lambda url, timeout: (
            urls.append(url) or payload([{
                "tAtsNm": "감천문화마을", "rlteTatsNm": "추천 명소",
                "rlteRank": "2", "baseYm": "202504",
            }])
        ),
    )
    result = client.search_related(
        keyword="감천문화마을", area_code="26", sigungu_code="26380",
        base_ym="202504",
    )
    params = parse_qs(urlparse(urls[0]).query)
    assert result[0].rank == 2
    assert params["numOfRows"] == ["20"] and params["pageNo"] == ["1"]
    assert "secret" not in repr(result)


async def test_related_lookup_falls_back_and_caches_failure() -> None:
    calls = 0

    def failing(url, timeout):
        nonlocal calls
        calls += 1
        raise TimeoutError

    service = RelatedAttractionService(KTourRelatedClient(
        service_key="secret", transport=failing, sleep=lambda _: None,
    ))
    first = await service.lookup(
        route_key="bts-busan", algorithm_version="bts-busan-v1",
        keyword="감천문화마을", sigungu_code="26380", base_ym="202504",
    )
    second = await service.lookup(
        route_key="bts-busan", algorithm_version="bts-busan-v1",
        keyword="감천문화마을", sigungu_code="26380", base_ym="202504",
    )
    assert first == second
    assert first.records == () and first.available is False
    assert calls == 2
