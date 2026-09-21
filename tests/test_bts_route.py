import random
from uuid import UUID

from ktown_defense.bts_route import RouteCandidate, compose_bts_route


def candidate(number: int, content_id: str, name: str, lat: float, lon: float, **values):
    return RouteCandidate(
        id=UUID(f"00000000-0000-4000-8000-{number:012d}"),
        content_id=content_id,
        name_ko=name,
        latitude=lat,
        longitude=lon,
        content_type_id=values.pop("content_type_id", "12"),
        **values,
    )


ANCHORS = (
    candidate(1, "operator:bts-busan-asiad", "부산아시아드주경기장", 35.1901, 129.0584),
    candidate(2, "operator:busan-gamcheon", "감천문화마을", 35.0977, 129.0104),
)


def test_fixed_anchors_survive_empty_external_fallback_in_order():
    result = compose_bts_route(ANCHORS, ())

    assert [item.candidate.content_id for item in result] == [
        "operator:bts-busan-asiad", "operator:busan-gamcheon"
    ]
    assert all(item.required and item.kind == "anchor" for item in result)


def test_combination_is_deterministic_and_deduplicates_related_candidates():
    candidates = [
        candidate(
            3, "related", "부산 시민공원", 35.1700, 129.0550,
            sources=("KTOUR_RELATED_ATTRACTION", "KTOUR_LOCATION_BASED"),
            related_rank=1, related_base_ym="202504", address_ko="부산",
        ),
        candidate(4, "duplicate-name", "부산시민공원", 35.1701, 129.0551,
                  sources=("KTOUR_LOCATION_BASED",)),
        candidate(5, "between", "중간 명소", 35.1400, 129.0340,
                  sources=("KTOUR_LOCATION_BASED",), content_type_id="14"),
    ]
    expected = None
    for seed in range(100):
        shuffled = candidates[:]
        random.Random(seed).shuffle(shuffled)
        result = compose_bts_route(ANCHORS, tuple(shuffled))
        current = [(item.candidate.content_id, item.placement) for item in result]
        expected = expected or current
        assert current == expected
    assert "related" in {item[0] for item in expected}
    assert "duplicate-name" not in {item[0] for item in expected}
