"""Failure-isolated, cached related-attraction collection."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable

from .ktour_related import KTourRelatedClient, RelatedAttractionRecord


@dataclass(frozen=True)
class AnchorLookup:
    content_id: str
    aliases: tuple[str, ...]
    sigungu_code: str


ANCHOR_LOOKUPS = (
    AnchorLookup("operator:bts-busan-asiad", ("부산아시아드경기장", "부산아시아드주경기장", "부산아시아드 주경기장"), "26470"),
    AnchorLookup("operator:busan-gamcheon", ("감천문화마을", "감천 문화마을", "부산 감천문화마을"), "26380"),
)


@dataclass(frozen=True)
class RelatedCollection:
    records: tuple[RelatedAttractionRecord, ...]
    available: bool


@dataclass(frozen=True)
class _CacheEntry:
    expires_at: datetime
    value: RelatedCollection


class RelatedAttractionService:
    """Uses three fixed historical months and collapses concurrent lookups."""

    def __init__(
        self, client: KTourRelatedClient | None, *, base_ym: str = "202504",
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._client = client
        self._base_ym = base_ym
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._cache: dict[tuple[str, str], _CacheEntry] = {}
        self._locks: dict[tuple[str, str], asyncio.Lock] = {}

    async def collect(self, anchor: AnchorLookup) -> RelatedCollection:
        key = (anchor.content_id, self._base_ym)
        cached = self._cache.get(key)
        now = self._clock()
        if cached and cached.expires_at > now:
            return cached.value
        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            cached = self._cache.get(key)
            now = self._clock()
            if cached and cached.expires_at > now:
                return cached.value
            value = await self._fetch(anchor)
            ttl = timedelta(hours=24 if value.available and value.records else 1)
            self._cache[key] = _CacheEntry(now + ttl, value)
            return value

    async def _fetch(self, anchor: AnchorLookup) -> RelatedCollection:
        if self._client is None:
            return RelatedCollection((), False)
        completed = False
        try:
            for month in _months(self._base_ym, 3):
                for alias in anchor.aliases:
                    records = await asyncio.to_thread(
                        self._client.search_related, keyword=alias, area_code="26",
                        sigungu_code=anchor.sigungu_code, base_ym=month, limit=20,
                    )
                    completed = True
                    if records:
                        return RelatedCollection(_merge(records), True)
            rows = await asyncio.to_thread(
                self._client.list_area_related, area_code="26",
                sigungu_code=anchor.sigungu_code, base_ym=self._base_ym, limit=100,
            )
            completed = True
            normalized = {"".join(value.split()) for value in anchor.aliases}
            return RelatedCollection(
                _merge(tuple(row for row in rows if "".join(row.source_name.split()) in normalized)),
                True,
            )
        except Exception:
            return RelatedCollection((), completed)


def _months(base_ym: str, count: int) -> tuple[str, ...]:
    year, month = int(base_ym[:4]), int(base_ym[4:])
    values = []
    for _ in range(count):
        values.append(f"{year:04d}{month:02d}")
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return tuple(values)


def _merge(records: tuple[RelatedAttractionRecord, ...]) -> tuple[RelatedAttractionRecord, ...]:
    winners: dict[str, RelatedAttractionRecord] = {}
    for item in records:
        current = winners.get(item.related_code)
        if current is None or (item.rank, -int(item.base_ym), item.related_name) < (
            current.rank, -int(current.base_ym), current.related_name
        ):
            winners[item.related_code] = item
    return tuple(sorted(winners.values(), key=lambda item: (item.rank, -int(item.base_ym), item.related_code)))
