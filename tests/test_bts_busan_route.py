import random
from uuid import uuid4

from ktown_defense.bts_busan_route import Candidate, Observation, compose_candidates


def candidate(content_id: str, *, name: str | None = None, latitude=35.16, longitude=129.045):
    return Candidate(
        uuid4(), content_id, name or content_id, latitude, longitude, "12",
        image_url="https://example.test/image.jpg", address_ko="부산",
        category_code="A01", description_ko="설명",
    )


def observation(content_id: str, source="KTOUR_RELATED_ATTRACTION", rank=1):
    return Observation(
        content_id, source, "operator:bts-busan-asiad", 1.0,
        rank if source == "KTOUR_RELATED_ATTRACTION" else None,
        "202504" if source == "KTOUR_RELATED_ATTRACTION" else None,
    )


def test_composition_is_deterministic_and_related_evidence_wins() -> None:
    candidates = [candidate("3"), candidate("1"), candidate("2")]
    observations = [
        observation("1", "KTOUR_LOCATION_BASED"),
        observation("2", rank=2),
        observation("3", rank=3),
    ]
    expected = None
    randomizer = random.Random(20260921)
    for _ in range(100):
        randomizer.shuffle(candidates)
        randomizer.shuffle(observations)
        actual = tuple(
            (item.candidate.content_id, item.placement, item.evidence["source"])
            for item in compose_candidates(tuple(candidates), tuple(observations), limit=5)
        )
        expected = actual if expected is None else expected
        assert actual == expected
    assert expected[0][2] == "KTOUR_RELATED_ATTRACTION"


def test_composition_deduplicates_name_and_falls_back_to_empty() -> None:
    first = candidate("a", name="부산 명소")
    duplicate = candidate("b", name="부산명소")
    result = compose_candidates(
        (first, duplicate), (observation("a"), observation("b", rank=2)), limit=5
    )
    assert len(result) == 1
    assert compose_candidates((first,), (), limit=5) == ()
