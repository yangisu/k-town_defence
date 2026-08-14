from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ktown_defense.points import LedgerEvent, LedgerEventType, ReversalReason  # noqa: E402
from ktown_defense.territory import (  # noqa: E402
    StrongholdLevel,
    TerritoryProjectionService,
)


START = datetime(2026, 8, 12, 9, 0, tzinfo=timezone.utc)


def ledger_event(
    event_id: str,
    fandom_id: str,
    place_id: str,
    points: int,
    *,
    at: datetime = START,
    event_type: LedgerEventType = LedgerEventType.FIRST_SCORE,
    reversal_of: str | None = None,
) -> LedgerEvent:
    return LedgerEvent(
        ledger_event_id=event_id,
        event_key=f"event:{event_id}",
        checkin_id=f"checkin:{event_id}",
        user_id=f"user:{event_id}",
        fandom_id=fandom_id,
        place_id=place_id,
        season_id="season-1",
        points=points,
        event_type=event_type,
        created_at=at,
        reversal_of=reversal_of,
        reversal_reason=(ReversalReason.FRAUD_CONFIRMED if reversal_of else None),
    )


class TerritoryProjectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = TerritoryProjectionService("season-1")

    def test_level_changes_at_exact_300_1000_and_2000_point_boundaries(self) -> None:
        events = [
            ledger_event("001", "fandom-a", "place-seed", 300),
            ledger_event("002", "fandom-a", "place-tree", 1000),
            ledger_event("003", "fandom-a", "place-landmark", 2000),
            ledger_event("004", "fandom-a", "place-below", 299),
        ]

        snapshot = self.service.rebuild(events)

        levels = {item.place_id: item.level for item in snapshot.strongholds}
        self.assertEqual(StrongholdLevel.SEED, levels["place-seed"])
        self.assertEqual(StrongholdLevel.TREE, levels["place-tree"])
        self.assertEqual(StrongholdLevel.LANDMARK, levels["place-landmark"])
        self.assertNotIn("place-below", levels)

    def test_challenger_captures_at_exact_110_percent_but_not_below_or_tied(self) -> None:
        events = [
            ledger_event("001", "fandom-a", "place-tied", 300),
            ledger_event("002", "fandom-b", "place-tied", 300, at=START + timedelta(seconds=1)),
            ledger_event("003", "fandom-a", "place-below", 300),
            ledger_event("004", "fandom-b", "place-below", 329, at=START + timedelta(seconds=1)),
            ledger_event("005", "fandom-a", "place-captured", 300),
            ledger_event("006", "fandom-b", "place-captured", 330, at=START + timedelta(seconds=1)),
        ]

        snapshot = self.service.rebuild(events)

        owners = {item.place_id: item.owner_fandom_id for item in snapshot.strongholds}
        self.assertEqual("fandom-a", owners["place-tied"])
        self.assertEqual("fandom-a", owners["place-below"])
        self.assertEqual("fandom-b", owners["place-captured"])

    def test_same_timestamp_uses_ledger_event_id_order_and_ranking_tiebreakers(self) -> None:
        events = [
            ledger_event("020", "fandom-b", "place-order", 330),
            ledger_event("010", "fandom-a", "place-order", 300),
            ledger_event("030", "fandom-a", "place-a", 300, at=START + timedelta(minutes=1)),
            ledger_event("040", "fandom-b", "place-b", 270, at=START + timedelta(minutes=2)),
        ]

        snapshot = self.service.rebuild(events, fandom_ids=("fandom-c",))

        owners = {item.place_id: item.owner_fandom_id for item in snapshot.strongholds}
        self.assertEqual("fandom-b", owners["place-order"])
        self.assertEqual(
            ["fandom-b", "fandom-a", "fandom-c"],
            [item.fandom_id for item in snapshot.leaderboard],
        )
        self.assertEqual([1, 2, 3], [item.rank for item in snapshot.leaderboard])

    def test_reversal_replays_all_events_and_matches_fresh_projection_hash(self) -> None:
        original = ledger_event("010", "fandom-a", "place-1", 1000)
        events = [
            ledger_event("001", "fandom-a", "place-1", 300),
            original,
            ledger_event("020", "fandom-b", "place-1", 330, at=START + timedelta(seconds=1)),
        ]
        for event in events:
            self.service.apply(event)
        reversal = ledger_event(
            "030",
            "fandom-a",
            "place-1",
            -1000,
            at=START + timedelta(seconds=2),
            event_type=LedgerEventType.REVERSAL,
            reversal_of=original.ledger_event_id,
        )

        current = self.service.apply(reversal)
        rebuilt = TerritoryProjectionService("season-1").rebuild([*events, reversal])

        self.assertEqual("fandom-b", current.strongholds[0].owner_fandom_id)
        self.assertEqual(StrongholdLevel.SEED, current.strongholds[0].level)
        self.assertEqual(rebuilt.projection_hash, current.projection_hash)
        self.assertEqual(rebuilt.strongholds, current.strongholds)
        self.assertEqual(rebuilt.leaderboard, current.leaderboard)


if __name__ == "__main__":
    unittest.main()
