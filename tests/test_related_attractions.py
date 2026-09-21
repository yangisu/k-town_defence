from datetime import datetime, timedelta, timezone

from ktown_defense.ktour_related import RelatedAttractionRecord
from ktown_defense.related_attractions import ANCHOR_LOOKUPS, RelatedAttractionService


class Client:
    def __init__(self, fail=False):
        self.calls = []
        self.fail = fail

    def search_related(self, **values):
        self.calls.append(("search", values))
        if self.fail:
            raise TimeoutError("secret upstream failure")
        if values["base_ym"] == "202503":
            return (RelatedAttractionRecord("감천문화마을", "candidate", "추천", 2, "202503"),)
        return ()

    def list_area_related(self, **values):
        self.calls.append(("area", values))
        return ()


async def test_related_month_fallback_is_cached_for_24_hours():
    now = datetime(2026, 9, 21, tzinfo=timezone.utc)
    client = Client()
    service = RelatedAttractionService(client, clock=lambda: now)

    first = await service.collect(ANCHOR_LOOKUPS[1])
    second = await service.collect(ANCHOR_LOOKUPS[1])

    assert first == second
    assert first.available is True
    assert first.records[0].base_ym == "202503"
    assert len(client.calls) == 4


async def test_related_failure_returns_safe_empty_fallback_and_short_cache():
    now = datetime(2026, 9, 21, tzinfo=timezone.utc)
    clock = [now]
    client = Client(fail=True)
    service = RelatedAttractionService(client, clock=lambda: clock[0])

    assert (await service.collect(ANCHOR_LOOKUPS[0])).records == ()
    assert len(client.calls) == 1
    await service.collect(ANCHOR_LOOKUPS[0])
    assert len(client.calls) == 1
    clock[0] += timedelta(hours=1, seconds=1)
    await service.collect(ANCHOR_LOOKUPS[0])
    assert len(client.calls) == 2
