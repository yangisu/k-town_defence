"""Read-only related-attraction enrichment with a bounded process cache."""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import logging
from typing import Callable
from uuid import UUID

from .ktour_related import KTourRelatedClient, RelatedAttractionRecord


logger = logging.getLogger(__name__)

RELATED_ANCHORS = {
    "부산아시아드주경기장": {"area_code": "26", "sigungu_code": "13"},
    "감천문화마을": {"area_code": "26", "sigungu_code": "10"},
}


@dataclass(frozen=True)
class RelatedAttraction:
    name_ko: str
    related_rank: int
    category: str | None
    source: str = "KTOUR_RELATED_ATTRACTION"


@dataclass(frozen=True)
class _CacheEntry:
    expires_at: datetime
    value: tuple[RelatedAttraction, ...]


class RelatedAttractionService:
    def __init__(
        self,
        *,
        service_key: str | None,
        ttl_seconds: int = 300,
        max_cache_entries: int = 256,
        client_factory: Callable[[str], KTourRelatedClient] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        if ttl_seconds <= 0 or max_cache_entries <= 0:
            raise ValueError("related attraction cache settings must be positive")
        self._client = (
            (client_factory or self._default_client)(service_key)
            if service_key and service_key.strip()
            else None
        )
        self._ttl = timedelta(seconds=ttl_seconds)
        self._max_cache_entries = max_cache_entries
        self._cache: OrderedDict[tuple[UUID, str], _CacheEntry] = OrderedDict()
        self._clock = clock or (lambda: datetime.now(timezone.utc))

    @staticmethod
    def _default_client(service_key: str) -> KTourRelatedClient:
        return KTourRelatedClient(service_key=service_key)

    async def get_for_place(
        self, *, place_id: UUID, name_ko: str, region_code: str, base_ym: str
    ) -> tuple[RelatedAttraction, ...]:
        anchor = RELATED_ANCHORS.get(name_ko.strip())
        if self._client is None or anchor is None:
            return ()

        cache_key = (place_id, base_ym)
        now = self._clock()
        entry = self._cache.get(cache_key)
        if entry is not None:
            self._cache.move_to_end(cache_key)
            if entry.expires_at > now:
                return entry.value

        try:
            records = await _search(
                self._client,
                keyword=name_ko,
                area_code=anchor["area_code"],
                sigungu_code=anchor["sigungu_code"],
                base_ym=base_ym,
            )
            value = tuple(_to_attraction(record) for record in records[:5])
        except Exception:
            logger.warning("related attraction lookup failed for %s", place_id, exc_info=True)
            if entry is not None:
                return entry.value
            return ()

        self._cache[cache_key] = _CacheEntry(now + self._ttl, value)
        self._cache.move_to_end(cache_key)
        while len(self._cache) > self._max_cache_entries:
            self._cache.popitem(last=False)
        return value


async def _search(client: KTourRelatedClient, **kwargs: str) -> tuple[RelatedAttractionRecord, ...]:
    import asyncio

    return await asyncio.to_thread(client.search_related, **kwargs, limit=5)


def _to_attraction(record: RelatedAttractionRecord) -> RelatedAttraction:
    return RelatedAttraction(
        name_ko=record.related_name,
        related_rank=record.rank,
        category=record.category_medium or record.category_large,
    )