from __future__ import annotations

from datetime import date, datetime, timezone
import json
from urllib.parse import parse_qs, urlparse

import pytest

from ktown_defense.ktour_expedition import KTourAPIError, KTourExpeditionClient


NOW = datetime(2026, 8, 22, 3, 0, tzinfo=timezone.utc)


def response(items: list[dict[str, object]], total_count: int | None = None) -> bytes:
    return json.dumps(
        {
            "response": {
                "header": {"resultCode": "0000", "resultMsg": "OK"},
                "body": {
                    "items": {"item": items},
                    "totalCount": len(items) if total_count is None else total_count,
                },
            }
        }
    ).encode("utf-8")


class ExpeditionTransport:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, str]]] = []

    def __call__(self, url: str, timeout: float) -> bytes:
        parsed = urlparse(url)
        operation = parsed.path.rsplit("/", 1)[-1]
        params = {name: values[0] for name, values in parse_qs(parsed.query).items()}
        self.calls.append((operation, params))
        base = {
            "contentid": "101",
            "contenttypeid": "12",
            "title": "감천문화마을",
            "addr1": "부산광역시 사하구",
            "addr2": "감내2로 203",
            "mapx": "129.0106",
            "mapy": "35.0975",
            "areacode": "6",
            "cat3": "A02030600",
            "firstimage": "http://unsafe.example/ignored.jpg",
            "modifiedtime": "20260821120000",
        }
        if operation == "areaBasedSyncList2":
            return response([{"contentid": "101", "modtime": "20260821120000"}])
        if operation == "areaBasedList2":
            return response([base])
        if operation == "searchKeyword2":
            return response([base])
        if operation == "locationBasedList2":
            return response([base])
        if operation == "detailCommon2":
            return response(
                [{
                    "contentid": "101",
                    "overview": "<b>부산</b> 산복도로의 문화마을",
                    "homepage": "https://example.com/gamcheon",
                    "tel": "051-000-0000",
                }]
            )
        if operation == "detailIntro2":
            return response(
                [{
                    "contentid": "101",
                    "contenttypeid": "12",
                    "usetime": "09:00~18:00",
                    "restdate": "연중무휴",
                    "parking": "공영주차장 이용",
                }]
            )
        if operation == "detailInfo2":
            return response([{"contentid": "101", "infoname": "체험", "infotext": "골목 투어"}])
        if operation == "detailImage2":
            return response(
                [
                    {"contentid": "101", "originimgurl": "https://images.example/101.jpg"},
                    {"contentid": "101", "originimgurl": "http://tong.visitkorea.or.kr/cms/resource/101.jpg"},
                    {"contentid": "101", "originimgurl": "http://unsafe.example/101.jpg"},
                ]
            )
        if operation == "searchFestival2":
            festival = dict(base)
            festival.update({"eventstartdate": "20260820", "eventenddate": "20260825"})
            return response([festival])
        raise AssertionError(f"unexpected operation {operation}")


def test_fetch_snapshot_uses_nine_operations_and_maps_enriched_place() -> None:
    transport = ExpeditionTransport()
    client = KTourExpeditionClient(
        service_key="secret-key",
        transport=transport,
        clock=lambda: NOW,
    )

    snapshot = client.fetch_snapshot(
        area_code="6",
        keywords=("BTS",),
        start_date=date(2026, 8, 22),
        end_date=date(2026, 9, 21),
        limit=100,
    )

    assert len(snapshot.places) == 1
    place = snapshot.places[0]
    assert place.content_id == "101"
    assert place.description_ko == "부산 산복도로의 문화마을"
    assert place.discovery_keywords == ("BTS",)
    assert place.homepage_url == "https://example.com/gamcheon"
    assert place.telephone == "051-000-0000"
    assert place.open_time == "09:00~18:00"
    assert place.rest_date == "연중무휴"
    assert place.parking == "공영주차장 이용"
    assert place.info == ({"contentid": "101", "infoname": "체험", "infotext": "골목 투어"},)
    assert place.image_urls == (
        "https://images.example/101.jpg",
        "https://tong.visitkorea.or.kr/cms/resource/101.jpg",
    )
    assert place.festival_start_date == date(2026, 8, 20)
    assert place.festival_end_date == date(2026, 8, 25)
    assert place.source_modified_at is not None
    assert place.source_modified_at.tzinfo == timezone.utc
    assert set(place.source_operations) == {
        "areaBasedSyncList2",
        "areaBasedList2",
        "searchKeyword2",
        "locationBasedList2",
        "detailCommon2",
        "detailIntro2",
        "detailInfo2",
        "detailImage2",
        "searchFestival2",
    }
    assert snapshot.changed_content_ids == ("101",)
    assert {item.operation for item in snapshot.observations} == set(place.source_operations)
    assert all(item.status == "succeeded" for item in snapshot.observations)
    assert "secret-key" not in repr(snapshot)

    calls = {operation: params for operation, params in transport.calls}
    assert calls["areaBasedList2"]["areaCode"] == "6"
    assert calls["searchKeyword2"]["keyword"] == "BTS"
    assert calls["locationBasedList2"]["radius"] == "5000"
    assert calls["detailCommon2"]["contentId"] == "101"
    assert calls["detailIntro2"]["contentTypeId"] == "12"
    assert calls["detailInfo2"]["contentId"] == "101"
    assert calls["detailImage2"]["imageYN"] == "Y"
    assert "subImageYN" not in calls["detailImage2"]
    assert calls["searchFestival2"]["eventStartDate"] == "20260822"
    assert calls["areaBasedSyncList2"]["areaCode"] == "6"


def test_optional_detail_failure_is_observed_without_dropping_base_place() -> None:
    transport = ExpeditionTransport()

    def failing_images(url: str, timeout: float) -> bytes:
        if "detailImage2" in url:
            return b'{"response":{"header":{"resultCode":"10","resultMsg":"INVALID_REQUEST_PARAMETER_ERROR"}}}'
        return transport(url, timeout)

    client = KTourExpeditionClient(
        service_key="secret-key",
        transport=failing_images,
        max_attempts=3,
        sleep=lambda _: None,
        clock=lambda: NOW,
    )

    snapshot = client.fetch_snapshot(
        area_code="6",
        keywords=("BTS",),
        start_date=date(2026, 8, 22),
        end_date=date(2026, 9, 21),
        limit=100,
    )

    assert len(snapshot.places) == 1
    assert snapshot.places[0].image_urls == ()
    image_observation = next(
        item for item in snapshot.observations if item.operation == "detailImage2"
    )
    assert image_observation.status == "failed"
    assert image_observation.error_code == "INVALID_REQUEST"
    assert "detailImage2" not in snapshot.places[0].source_operations
    assert len([call for call, _ in transport.calls if call == "detailImage2"]) == 0


def test_missing_anchor_never_fabricates_location_success() -> None:
    transport = ExpeditionTransport()

    def no_anchor(url: str, timeout: float) -> bytes:
        if "areaBasedList2" in url or "searchKeyword2" in url:
            return response([])
        return transport(url, timeout)

    client = KTourExpeditionClient(
        service_key="secret-key", transport=no_anchor, max_attempts=1,
        clock=lambda: NOW,
    )

    with pytest.raises(KTourAPIError):
        client.fetch_snapshot(
            area_code="6", keywords=("BTS",), start_date=date(2026, 8, 22),
            end_date=date(2026, 9, 21), limit=100,
        )

    assert not any(
        item.operation == "locationBasedList2" and item.status == "succeeded"
        for item in client.observations
    )


def test_incremental_sync_sends_the_last_successful_modified_time() -> None:
    transport = ExpeditionTransport()
    client = KTourExpeditionClient(
        service_key="secret-key", transport=transport, clock=lambda: NOW,
    )

    client.fetch_snapshot(
        area_code="6", keywords=("BTS",), start_date=date(2026, 8, 22),
        end_date=date(2026, 9, 21), limit=100, modified_since=NOW,
    )

    sync_call = next(params for operation, params in transport.calls if operation == "areaBasedSyncList2")
    assert sync_call["modifiedtime"] == "20260822030000"


def test_sync_list_preserves_confirmed_deleted_content_ids() -> None:
    transport = ExpeditionTransport()

    def with_deleted(url: str, timeout: float) -> bytes:
        if "areaBasedSyncList2" in url:
            return response([
                {"contentid": "101", "showflag": "1"},
                {"contentid": "removed", "showflag": "0"},
            ])
        return transport(url, timeout)

    snapshot = KTourExpeditionClient(
        service_key="secret-key", transport=with_deleted, clock=lambda: NOW,
    ).fetch_snapshot(
        area_code="6", keywords=("BTS",), start_date=date(2026, 8, 22),
        end_date=date(2026, 9, 21), limit=100,
    )

    assert snapshot.changed_content_ids == ("101", "removed")
    assert snapshot.deleted_content_ids == ("removed",)


def test_festival_outside_requested_window_is_not_marked_active() -> None:
    transport = ExpeditionTransport()

    def old_festival(url: str, timeout: float) -> bytes:
        if "searchFestival2" in url:
            return response(
                [{
                    "contentid": "101",
                    "contenttypeid": "15",
                    "title": "지난 행사",
                    "addr1": "부산광역시 사하구",
                    "mapx": "129.0106",
                    "mapy": "35.0975",
                    "areacode": "6",
                    "eventstartdate": "20260701",
                    "eventenddate": "20260702",
                    "modifiedtime": "20260821120000",
                }]
            )
        return transport(url, timeout)

    client = KTourExpeditionClient(
        service_key="secret-key", transport=old_festival, clock=lambda: NOW
    )
    snapshot = client.fetch_snapshot(
        area_code="6",
        keywords=("BTS",),
        start_date=date(2026, 8, 22),
        end_date=date(2026, 9, 21),
        limit=100,
    )

    assert snapshot.places[0].festival_start_date is None
    assert snapshot.places[0].festival_end_date is None
