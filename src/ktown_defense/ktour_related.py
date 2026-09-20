"""한국관광공사 관광지별 연관 관광지 API adapter."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

from .ktour_openapi import KTourAPIError, KTourOpenAPIClient


RELATED_BASE_URL = "https://apis.data.go.kr/B551011/TarRlteTarService1"
RELATED_API_AREA_CODES = {
    "6": "26",
}


@dataclass(frozen=True)
class RelatedAttractionRecord:
    source_name: str
    related_code: str
    related_name: str
    area_code: str
    sigungu_code: str
    category_large: str | None
    category_medium: str | None
    category_small: str | None
    rank: int
    base_ym: str


class KTourRelatedClient(KTourOpenAPIClient):
    """Fetches deterministic related-attraction candidates from TourAPI."""

    def __init__(self, **kwargs: object) -> None:
        super().__init__(**kwargs)
        self._base_url = RELATED_BASE_URL

    def search_related(
        self,
        *,
        keyword: str,
        area_code: str,
        sigungu_code: str | None,
        base_ym: str,
        limit: int = 20,
    ) -> tuple[RelatedAttractionRecord, ...]:
        if not keyword.strip():
            raise ValueError("keyword is required")
        if not area_code.strip():
            raise ValueError("area_code is required")
        if not base_ym.isdigit() or len(base_ym) != 6:
            raise ValueError("base_ym must use YYYYMM format")
        if limit < 1 or limit > 1000:
            raise ValueError("limit must be between 1 and 1000")

        body = self._request(
            "searchKeyword1",
            {
                "keyword": keyword.strip(),
                "areaCd": area_code.strip(),
                "signguCd": (sigungu_code or "").strip(),
                "baseYm": base_ym,
                "numOfRows": limit,
                "pageNo": 1,
            },
        )
        records: list[RelatedAttractionRecord] = []
        for item in self._items(body):
            records.append(self._to_record(item, default_base_ym=base_ym))
        return tuple(records)

    def list_area_related(
        self,
        *,
        area_code: str,
        sigungu_code: str,
        base_ym: str,
        limit: int = 100,
    ) -> tuple[RelatedAttractionRecord, ...]:
        """List the dataset's center-attraction rows for a TarRlte region."""
        if not area_code.strip() or not sigungu_code.strip():
            raise ValueError("area_code and sigungu_code are required")
        if not base_ym.isdigit() or len(base_ym) != 6:
            raise ValueError("base_ym must use YYYYMM format")
        if limit < 1 or limit > 1000:
            raise ValueError("limit must be between 1 and 1000")

        body = self._request(
            "areaBasedList1",
            {
                "areaCd": area_code.strip(),
                "signguCd": sigungu_code.strip(),
                "baseYm": base_ym,
                "numOfRows": limit,
                "pageNo": 1,
            },
        )
        return tuple(
            self._to_record(item, default_base_ym=base_ym)
            for item in self._items(body)
        )

    @classmethod
    def area_code_for_region(cls, region_code: str) -> str:
        try:
            return RELATED_API_AREA_CODES[region_code]
        except KeyError as exc:
            raise ValueError(f"unsupported related-attraction region: {region_code}") from exc

    @classmethod
    def _to_record(
        cls, item: Mapping[str, object], *, default_base_ym: str
    ) -> RelatedAttractionRecord:
        source_name = cls._required_text(item, "tAtsNm")
        related_code = cls._required_text(item, "rlteTatsCd")
        related_name = cls._required_text(item, "rlteTatsNm")
        try:
            rank = int(item.get("rlteRank", 0))
        except (TypeError, ValueError) as exc:
            raise KTourAPIError("Related TourAPI item has invalid rlteRank") from exc
        if rank < 1:
            raise KTourAPIError("Related TourAPI item has invalid rlteRank")
        return RelatedAttractionRecord(
            source_name=source_name,
            related_code=related_code,
            related_name=related_name,
            area_code=str(item.get("rlteRegnCd", "")).strip(),
            sigungu_code=str(item.get("rlteSignguCd", "")).strip(),
            category_large=cls._optional_text(item, "rlteCtgryLclsNm"),
            category_medium=cls._optional_text(item, "rlteCtgryMclsNm"),
            category_small=cls._optional_text(item, "rlteCtgrySclsNm"),
            rank=rank,
            base_ym=str(item.get("baseYm", default_base_ym)).strip() or default_base_ym,
        )

    @staticmethod
    def _required_text(item: Mapping[str, object], field: str) -> str:
        value = str(item.get(field, "")).strip()
        if not value:
            raise KTourAPIError(f"Related TourAPI item is missing {field}")
        return value

    @staticmethod
    def _optional_text(item: Mapping[str, object], field: str) -> str | None:
        value = str(item.get(field, "")).strip()
        return value or None