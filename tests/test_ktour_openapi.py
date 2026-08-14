from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import tempfile
from urllib.parse import parse_qs, urlparse
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from ktown_defense.ktour_openapi import (
    KTourAPIError,
    KTourKeywordQuery,
    KTourOpenAPIClient,
)
from ktown_defense.catalog import Artist
from ktown_defense.catalog_sync import CatalogSyncService


NOW = datetime(2026, 8, 12, 3, 0, tzinfo=timezone.utc)


def response(items: list[dict[str, object]], *, total_count: int) -> bytes:
    return json.dumps(
        {
            "response": {
                "header": {"resultCode": "0000", "resultMsg": "OK"},
                "body": {
                    "items": {"item": items},
                    "numOfRows": 1,
                    "pageNo": 1,
                    "totalCount": total_count,
                },
            }
        }
    ).encode("utf-8")


class RecordingTransport:
    def __init__(self) -> None:
        self.urls: list[str] = []

    def __call__(self, url: str, timeout: float) -> bytes:
        self.urls.append(url)
        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        operation = parsed.path.rsplit("/", 1)[-1]
        if operation == "searchKeyword2":
            page = int(params["pageNo"][0])
            item = {
                "contentid": str(100 + page),
                "contenttypeid": "12",
                "title": f"관광지 {page}",
                "addr1": "강원특별자치도 평창군",
                "addr2": f"테스트로 {page}",
                "mapx": "128.456",
                "mapy": "37.123",
                "areacode": "32",
                "sigungucode": "15",
                "modifiedtime": f"20260812030{page}00",
            }
            if page == 2:
                item["areacode"] = ""
                item["sigungucode"] = ""
                item["lDongRegnCd"] = "26"
                item["lDongSignguCd"] = "380"
            return response([item], total_count=2)
        if operation == "detailCommon2":
            content_id = params["contentId"][0]
            return response(
                [{"contentid": content_id, "overview": f"{content_id} 상세 설명"}],
                total_count=1,
            )
        raise AssertionError(f"unexpected operation: {operation}")


class KTourOpenAPIClientTests(unittest.TestCase):
    def test_from_env_loads_project_dotenv_when_process_variable_is_absent(self) -> None:
        original_directory = Path.cwd()
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            os.environ, {}, clear=True
        ):
            try:
                os.chdir(directory)
                Path(".env").write_text(
                    "KTOUR_SERVICE_KEY=dotenv-key\nKTOUR_MOBILE_APP=CatalogWorker\n",
                    encoding="utf-8",
                )

                client = KTourOpenAPIClient.from_env(
                    transport=lambda url, timeout: response([], total_count=0)
                )
            finally:
                os.chdir(original_directory)

        self.assertIsInstance(client, KTourOpenAPIClient)

    def test_fetch_snapshot_uses_official_api_pages_and_maps_korean_places(self) -> None:
        transport = RecordingTransport()
        client = KTourOpenAPIClient(
            service_key="decoded+/key=",
            transport=transport,
            page_size=1,
            clock=lambda: NOW,
        )

        snapshot = client.fetch_snapshot(
            [
                KTourKeywordQuery(
                    artist_id="artist-a",
                    keyword="방탄소년단",
                    transit_guide_ko="평창역에서 버스로 이동",
                    place_type="official",
                )
            ]
        )

        self.assertEqual(2, len(snapshot.records))
        self.assertEqual("ktour:101", snapshot.records[0].place_id)
        self.assertEqual("artist-a", snapshot.records[0].artist_id)
        self.assertEqual("관광지 1", snapshot.records[0].name_ko)
        self.assertEqual("강원특별자치도 평창군 테스트로 1", snapshot.records[0].address_ko)
        self.assertEqual("101 상세 설명", snapshot.records[0].description_ko)
        self.assertEqual("평창역에서 버스로 이동", snapshot.records[0].transit_guide_ko)
        self.assertEqual("32:15", snapshot.records[0].admin_area_code)
        self.assertEqual("26:380", snapshot.records[1].admin_area_code)
        self.assertEqual(37.123, snapshot.records[0].latitude)
        self.assertEqual(128.456, snapshot.records[0].longitude)
        self.assertEqual("KTOUR-20260812030200-2", snapshot.snapshot_version)
        self.assertNotIn("decoded", snapshot.snapshot_uri)

        search_urls = [url for url in transport.urls if "searchKeyword2" in url]
        self.assertEqual(2, len(search_urls))
        first_params = parse_qs(urlparse(search_urls[0]).query)
        self.assertEqual(["decoded+/key="], first_params["serviceKey"])
        self.assertEqual(["ETC"], first_params["MobileOS"])
        self.assertEqual(["KTownDefense"], first_params["MobileApp"])
        self.assertEqual(["json"], first_params["_type"])
        self.assertEqual(["방탄소년단"], first_params["keyword"])
        self.assertEqual(["1"], first_params["pageNo"])
        self.assertEqual(["2"], parse_qs(urlparse(search_urls[1]).query)["pageNo"])
        detail_urls = [url for url in transport.urls if "detailCommon2" in url]
        self.assertTrue(detail_urls)
        self.assertEqual(
            {"serviceKey", "MobileOS", "MobileApp", "_type", "contentId"},
            set(parse_qs(urlparse(detail_urls[0]).query)),
        )

    def test_api_error_response_is_rejected_instead_of_becoming_an_empty_snapshot(self) -> None:
        payload = json.dumps(
            {
                "response": {
                    "header": {
                        "resultCode": "30",
                        "resultMsg": "SERVICE_KEY_IS_NOT_REGISTERED_ERROR",
                    }
                }
            }
        ).encode("utf-8")
        client = KTourOpenAPIClient(
            service_key="bad-key", transport=lambda url, timeout: payload
        )

        with self.assertRaisesRegex(KTourAPIError, "30.*SERVICE_KEY"):
            client.fetch_snapshot(
                [KTourKeywordQuery("artist-a", "방탄소년단", "버스로 이동")]
            )

    def test_gateway_top_level_error_preserves_the_official_error_message(self) -> None:
        payload = json.dumps(
            {
                "responseTime": "2026-08-12T12:00:00",
                "resultCode": "10",
                "resultMsg": "INVALID_REQUEST_PARAMETER_ERROR(contentTypeId)",
            }
        ).encode("utf-8")
        client = KTourOpenAPIClient(
            service_key="service-key", transport=lambda url, timeout: payload
        )

        with self.assertRaisesRegex(
            KTourAPIError, "10.*INVALID_REQUEST_PARAMETER.*contentTypeId"
        ):
            client._request("detailCommon2", {"contentId": "101"})

    def test_catalog_sync_executes_the_real_ktour_client_path(self) -> None:
        client = KTourOpenAPIClient(
            service_key="service-key",
            transport=RecordingTransport(),
            page_size=1,
            clock=lambda: NOW,
        )
        service = CatalogSyncService(
            artists=[Artist("artist-a", "방탄소년단", "approved", None, True)],
            clock=lambda: NOW,
        )
        queries = [
            KTourKeywordQuery("artist-a", "방탄소년단", "평창역에서 버스로 이동")
        ]

        run = service.sync_from_ktour(queries, client=client)

        self.assertEqual("succeeded", run.status)
        self.assertEqual("KTOUR_API", run.source)
        self.assertEqual(2, len(service.list_places("artist-a")))
        self.assertEqual("KTOUR_API", service.catalog.places["ktour:101"].source)

    def test_transient_transport_failure_is_retried_before_sync_fails(self) -> None:
        stable_transport = RecordingTransport()
        attempts = 0
        delays: list[float] = []

        def flaky_transport(url: str, timeout: float) -> bytes:
            nonlocal attempts
            attempts += 1
            if attempts < 3:
                raise ConnectionError("temporary gateway failure")
            return stable_transport(url, timeout)

        client = KTourOpenAPIClient(
            service_key="service-key",
            transport=flaky_transport,
            page_size=10,
            max_attempts=3,
            sleep=delays.append,
        )

        snapshot = client.fetch_snapshot(
            [KTourKeywordQuery("artist-a", "방탄소년단", "버스로 이동")]
        )

        self.assertEqual(2, len(snapshot.records))
        self.assertEqual([0.25, 0.5], delays)

    def test_all_queries_returning_zero_places_cannot_replace_last_good_catalog(self) -> None:
        client = KTourOpenAPIClient(
            service_key="service-key",
            transport=lambda url, timeout: response([], total_count=0),
        )

        with self.assertRaisesRegex(KTourAPIError, "zero tourism places"):
            client.fetch_snapshot(
                [KTourKeywordQuery("artist-a", "없는 장소", "버스로 이동")]
            )


if __name__ == "__main__":
    unittest.main()
