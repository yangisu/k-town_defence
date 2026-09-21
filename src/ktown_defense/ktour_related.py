"""Bounded adapter for the TourAPI related-attractions dataset."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

from .ktour_openapi import KTourAPIError, KTourOpenAPIClient


RELATED_BASE_URL = "https://apis.data.go.kr/B551011/TarRlteTarService1"


@dataclass(frozen=True)
class RelatedAttractionRecord:
    source_name: str
    related_code: str
    related_name: str
    rank: int
    base_ym: str


class KTourRelatedClient(KTourOpenAPIClient):
    def __init__(self, **kwargs: object) -> None:
        kwargs.setdefault("timeout_seconds", 3)
        kwargs.setdefault("max_attempts", 2)
        super().__init__(**kwargs)
        self._base_url = RELATED_BASE_URL

    def search_related(
        self, *, keyword: str, area_code: str, sigungu_code: str,
        base_ym: str, limit: int = 20,
    ) -> tuple[RelatedAttractionRecord, ...]:
        return self._records(self._request("searchKeyword1", {
            "keyword": keyword, "areaCd": area_code, "signguCd": sigungu_code,
            "baseYm": base_ym, "numOfRows": limit, "pageNo": 1,
        }), base_ym)

    def list_area_related(
        self, *, area_code: str, sigungu_code: str, base_ym: str,
        limit: int = 100,
    ) -> tuple[RelatedAttractionRecord, ...]:
        return self._records(self._request("areaBasedList1", {
            "areaCd": area_code, "signguCd": sigungu_code, "baseYm": base_ym,
            "numOfRows": limit, "pageNo": 1,
        }), base_ym)

    @classmethod
    def _records(cls, body: Mapping[str, object], default_month: str):
        records = []
        for item in cls._items(body):
            try:
                rank = int(item.get("rlteRank", 0))
            except (TypeError, ValueError) as exc:
                raise KTourAPIError("invalid related attraction rank") from exc
            source = str(item.get("tAtsNm", "")).strip()
            code = str(item.get("rlteTatsCd", "")).strip()
            name = str(item.get("rlteTatsNm", "")).strip()
            if not source or not code or not name or rank < 1:
                raise KTourAPIError("invalid related attraction item")
            records.append(RelatedAttractionRecord(
                source, code, name, rank,
                str(item.get("baseYm", default_month)).strip() or default_month,
            ))
        return tuple(records)
