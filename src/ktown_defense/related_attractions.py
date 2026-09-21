"""Failure-isolated, single-flight cache for related-attraction lookups."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable

from .ktour_related import KTourRelatedClient, RelatedAttractionRecord


@dataclass(frozen=True)
class RelatedLookup:
    records: tuple[RelatedAttractionRecord, ...]
    available: bool


@dataclass
class _Entry:
    expires_at: datetime
    value: RelatedLookup


class RelatedAttractionService:
    """Search at most three historical months and cache failure separately."""

    def __init__(
        self, client: KTourRelatedClient, *,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._client = client
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._cache: dict[tuple[str, str, str, str], _Entry] = {}
        self._locks: dict[tuple[str, str, str, str], asyncio.Lock] = {}

    async def lookup(
        self, *, route_key: str, algorithm_version: str, keyword: str,
        sigungu_code: str, base_ym: str,
    ) -> RelatedLookup:
        key = (route_key, algorithm_version, keyword, base_ym)
        now = self._clock()
        cached = self._cache.get(key)
        if cached and cached.expires_at > now:
            return cached.value
        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            now = self._clock()
            cached = self._cache.get(key)
            if cached and cached.expires_at > now:
                return cached.value
            try:
                records: tuple[RelatedAttractionRecord, ...] = ()
                for month in _months(base_ym, 3):
                    records = await asyncio.to_thread(
                        self._client.search_related, keyword=keyword,
                        area_code="26", sigungu_code=sigungu_code,
                        base_ym=month, limit=20,
                    )
                    if records:
                        break
                value = RelatedLookup(tuple(sorted(records, key=lambda item: (
                    item.rank, -int(item.base_ym), item.related_name
                ))), True)
                ttl = timedelta(hours=24 if records else 1)
            except Exception:
                value = RelatedLookup((), False)
                ttl = timedelta(hours=1)
            self._cache[key] = _Entry(now + ttl, value)
            return value


def _months(base_ym: str, count: int) -> tuple[str, ...]:
    year, month = int(base_ym[:4]), int(base_ym[4:])
    result = []
    for _ in range(count):
        result.append(f"{year:04d}{month:02d}")
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return tuple(result)
