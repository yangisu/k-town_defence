from datetime import date, datetime, timezone
from uuid import UUID

import pytest

from ktown_defense.expedition_recommendation import (
    ExpeditionCandidate,
    ExpeditionRequest,
    select_expedition,
)


SYNCED = datetime(2026, 8, 22, 3, 0, tzinfo=timezone.utc)


def candidate(
    number: int,
    content_id: str,
    category: str,
    latitude: float,
    *,
    keywords: tuple[str, ...] = (),
    visits: int = 0,
    festival_start: date | None = None,
    festival_end: date | None = None,
) -> ExpeditionCandidate:
    return ExpeditionCandidate(
        id=UUID(f"00000000-0000-4000-8000-{number:012d}"),
        content_id=content_id,
        name_ko=content_id,
        category=category,
        latitude=latitude,
        longitude=129.0,
        discovery_keywords=keywords,
        festival_start_date=festival_start,
        festival_end_date=festival_end,
        submitted_visit_count=visits,
        synced_at=SYNCED,
    )


def test_selects_keyword_anchor_then_nearby_diverse_and_active_festival() -> None:
    candidates = (
        candidate(1, "anchor", "culture", 35.0000, keywords=("BTS",), visits=4),
        candidate(2, "near-food", "local_food", 35.0010),
        candidate(
            3,
            "festival",
            "event",
            35.0020,
            festival_start=date(2026, 8, 20),
            festival_end=date(2026, 8, 25),
        ),
        candidate(4, "culture", "culture", 35.0005, visits=2),
        candidate(5, "far-food", "local_food", 35.1000),
    )
    request = ExpeditionRequest(
        region_code="6", keyword="BTS", travel_date=date(2026, 8, 22), limit=4
    )

    result = select_expedition(candidates, request, snapshot_version="snapshot-1")

    assert [stop.candidate.content_id for stop in result.stops] == [
        "anchor",
        "near-food",
        "festival",
        "culture",
    ]
    assert result.stops[0].reasons == ("키워드 일치",)
    assert "다른 유형의 지역 명소" in result.stops[1].reasons
    assert "여행일에 열리는 행사" in result.stops[2].reasons
    assert "아직 방문 기록이 적은 장소" in result.stops[1].reasons
    assert result.id == select_expedition(
        candidates, request, snapshot_version="snapshot-1"
    ).id


def test_missing_keyword_uses_deterministic_fallback_anchor() -> None:
    candidates = (
        candidate(2, "second", "culture", 35.1),
        candidate(1, "first", "culture", 35.0),
        candidate(3, "third", "event", 35.2),
    )

    result = select_expedition(
        candidates,
        ExpeditionRequest("6", "없는 키워드", date(2026, 8, 22), 3),
        snapshot_version="snapshot-1",
    )

    assert result.stops[0].candidate.content_id == "first"
    assert result.stops[0].reasons == ("지역 원정 시작점",)


@pytest.mark.parametrize("limit", [2, 6])
def test_rejects_stop_limits_outside_three_to_five(limit: int) -> None:
    with pytest.raises(ValueError, match="between 3 and 5"):
        ExpeditionRequest("6", None, date(2026, 8, 22), limit)


def test_rejects_empty_candidates() -> None:
    with pytest.raises(ValueError, match="no expedition candidates"):
        select_expedition(
            (), ExpeditionRequest("6", None, date(2026, 8, 22), 3),
            snapshot_version="snapshot-1",
        )


def test_rejects_fewer_than_three_candidates() -> None:
    with pytest.raises(ValueError, match="at least three"):
        select_expedition(
            (
                candidate(1, "first", "culture", 35.0),
                candidate(2, "second", "event", 35.1),
            ),
            ExpeditionRequest("6", None, date(2026, 8, 22), 3),
            snapshot_version="snapshot-1",
        )
