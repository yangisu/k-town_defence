"""The points each fandom starts a season with in each territory.

A freshly deployed board has no approved check-ins, so every fandom stood on
zero everywhere and the owner tie-break handed all twenty-three territories to
the same fandom. The demo never showed this because it opens on a board that
is already contested; this is that same opening board, so the live one starts
the way the demo does and real check-ins are added on top of it.

The numbers live in `data/territory_baseline.json`, keyed by territory id and
then by fandom name. The web test suite compares that file against the demo's
own territory data, so the two cannot drift apart unnoticed.
"""

from functools import lru_cache
from importlib.resources import files
import json


@lru_cache(maxsize=1)
def _baseline() -> dict[str, dict[str, int]]:
    raw = files("ktown_defense").joinpath("data/territory_baseline.json").read_text(encoding="utf-8")
    return {
        territory_id: {fandom_name: int(points) for fandom_name, points in standings.items()}
        for territory_id, standings in json.loads(raw).items()
    }


def baseline_points(territory_id: str, fandom_name: str) -> int:
    """Starting points for one fandom in one territory; zero when it has none."""
    return _baseline().get(territory_id, {}).get(fandom_name, 0)
