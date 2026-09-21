"""Bounded adapter for the TourAPI related-attraction dataset."""

from dataclasses import dataclass
from .ktour_openapi import KTourAPIError, KTourOpenAPIClient


@dataclass(frozen=True)
class RelatedAttractionRecord:
    source_name: str
    related_name: str
    rank: int
    base_ym: str


class KTourRelatedClient(KTourOpenAPIClient):
    def __init__(self, **kwargs: object) -> None:
        kwargs.setdefault("timeout_seconds", 3)
        kwargs.setdefault("max_attempts", 2)
        super().__init__(**kwargs)
        self._base_url = "https://apis.data.go.kr/B551011/TarRlteTarService1"

    def search_related(
        self, *, keyword: str, area_code: str, sigungu_code: str,
        base_ym: str, limit: int = 20,
    ) -> tuple[RelatedAttractionRecord, ...]:
        if not keyword.strip() or not area_code.strip() or not sigungu_code.strip():
            raise ValueError("keyword and area codes are required")
        if len(base_ym) != 6 or not base_ym.isdigit():
            raise ValueError("base_ym must use YYYYMM format")
        body = self._request("searchKeyword1", {
            "keyword": keyword.strip(), "areaCd": area_code,
            "signguCd": sigungu_code, "baseYm": base_ym,
            "numOfRows": limit, "pageNo": 1,
        })
        records: list[RelatedAttractionRecord] = []
        for item in self._items(body):
            try:
                rank = int(item.get("rlteRank", 0))
            except (TypeError, ValueError) as exc:
                raise KTourAPIError("invalid related attraction rank") from exc
            source = str(item.get("tAtsNm", "")).strip()
            name = str(item.get("rlteTatsNm", "")).strip()
            if not source or not name or rank < 1:
                raise KTourAPIError("malformed related attraction item")
            records.append(RelatedAttractionRecord(
                source, name, rank,
                str(item.get("baseYm", base_ym)).strip() or base_ym,
            ))
        return tuple(records)
