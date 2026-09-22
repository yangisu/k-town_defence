"""The opening board, checked without a database."""

from types import SimpleNamespace
from uuid import uuid4

from ktown_defense.territory_application import TERRITORIES, TerritoryApplication
from ktown_defense.territory_baseline import baseline_points


def test_every_territory_has_an_opening_board() -> None:
    for territory in TERRITORIES:
        opening = [
            baseline_points(territory.id, name)
            for name in ("ARMY", "BLINK", "CARAT", "REMINE", "MELODY", "DIVE", "BRIIZE",
                         "ZEROSE", "ONEDOOR", "MY", "Bunnies", "UAENA")
        ]
        leaders = sorted(opening, reverse=True)
        # A clear leader everywhere, so no owner is decided by a tie-break.
        assert leaders[0] > leaders[1], territory.id


def test_unknown_names_start_on_zero() -> None:
    assert baseline_points("busan", "NOBODY") == 0
    assert baseline_points("nowhere", "ARMY") == 0


def test_check_ins_are_added_on_top_of_the_opening_board() -> None:
    army = SimpleNamespace(id=uuid4(), name_ko="ARMY")
    blink = SimpleNamespace(id=uuid4(), name_ko="BLINK")
    # BLINK has earned 200 real points in Busan; ARMY has earned nothing yet.
    combined = TerritoryApplication._with_baseline([army, blink], {("busan", blink.id): 200})

    assert combined[("busan", army.id)] == 920
    assert combined[("busan", blink.id)] == 840 + 200
    # Enough real play overturns the opening board.
    overtaken = TerritoryApplication._with_baseline([army, blink], {("busan", blink.id): 81})
    assert overtaken[("busan", blink.id)] > overtaken[("busan", army.id)]
