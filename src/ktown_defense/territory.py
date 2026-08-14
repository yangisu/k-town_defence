"""Deterministic stronghold and leaderboard projections from the ledger."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import StrEnum
from typing import Iterable

from .points import LedgerEvent, LedgerEventType


class StrongholdLevel(StrEnum):
    SEED = "seed"
    TREE = "tree"
    LANDMARK = "landmark"


@dataclass(frozen=True)
class StrongholdProjection:
    place_id: str
    season_id: str
    owner_fandom_id: str
    level: StrongholdLevel
    acquired_at: datetime
    projection_version: int


@dataclass(frozen=True)
class PlaceFandomScoreProjection:
    place_id: str
    season_id: str
    fandom_id: str
    valid_points: int
    projection_version: int


@dataclass(frozen=True)
class LeaderboardProjection:
    season_id: str
    fandom_id: str
    rank: int
    stronghold_count: int
    valid_points: int
    last_acquired_at: datetime | None
    projection_version: int


@dataclass(frozen=True)
class TerritorySnapshot:
    season_id: str
    strongholds: tuple[StrongholdProjection, ...]
    place_scores: tuple[PlaceFandomScoreProjection, ...]
    leaderboard: tuple[LeaderboardProjection, ...]
    projection_version: int
    projection_hash: str


@dataclass
class _Ownership:
    fandom_id: str
    acquired_at: datetime


class TerritoryProjectionService:
    """Maintain a projection whose state is reproducible from ledger events."""

    def __init__(self, season_id: str, *, fandom_ids: Iterable[str] = ()) -> None:
        self.season_id = season_id
        self._fandom_ids = set(fandom_ids)
        self._events: dict[str, LedgerEvent] = {}
        self.current = self.rebuild(())

    def apply(self, event: LedgerEvent) -> TerritorySnapshot:
        """Idempotently add an event and atomically replace the projection."""

        if event.season_id != self.season_id:
            return self.current
        existing = self._events.get(event.event_key)
        if existing is not None and existing != event:
            raise ValueError(f"duplicate event_key with different payload: {event.event_key}")
        self._events[event.event_key] = event
        self.current = self.rebuild(self._events.values())
        return self.current

    def replace_from_ledger(self, events: Iterable[LedgerEvent]) -> TerritorySnapshot:
        """Atomically replace all season state with a complete ledger replay."""

        season_events = tuple(event for event in events if event.season_id == self.season_id)
        replacement: dict[str, LedgerEvent] = {}
        for event in season_events:
            existing = replacement.get(event.event_key)
            if existing is not None and existing != event:
                raise ValueError(f"duplicate event_key with different payload: {event.event_key}")
            replacement[event.event_key] = event
        snapshot = self.rebuild(replacement.values())
        self._events = replacement
        self.current = snapshot
        return snapshot

    def rebuild(
        self,
        events: Iterable[LedgerEvent],
        *,
        fandom_ids: Iterable[str] = (),
    ) -> TerritorySnapshot:
        """Rebuild a season projection in the ledger's total ordering."""

        season_events = tuple(event for event in events if event.season_id == self.season_id)
        projection_version = len(season_events)
        reversed_ids = {
            event.reversal_of
            for event in season_events
            if event.event_type is LedgerEventType.REVERSAL and event.reversal_of is not None
        }
        effective_events = sorted(
            (
                event
                for event in season_events
                if event.event_type is not LedgerEventType.REVERSAL
                and event.ledger_event_id not in reversed_ids
            ),
            key=lambda event: (event.created_at, event.ledger_event_id),
        )

        scores: dict[tuple[str, str], int] = {}
        ownership: dict[str, _Ownership] = {}
        last_acquired: dict[str, datetime] = {}
        all_fandom_ids = self._fandom_ids | set(fandom_ids)

        for event in effective_events:
            all_fandom_ids.add(event.fandom_id)
            score_key = (event.place_id, event.fandom_id)
            scores[score_key] = scores.get(score_key, 0) + event.points
            owner = ownership.get(event.place_id)

            if owner is None:
                if scores[score_key] >= 300:
                    ownership[event.place_id] = _Ownership(event.fandom_id, event.created_at)
                    last_acquired[event.fandom_id] = event.created_at
                continue

            owner_points = scores.get((event.place_id, owner.fandom_id), 0)
            if owner_points < 300:
                del ownership[event.place_id]
                if scores[score_key] >= 300:
                    ownership[event.place_id] = _Ownership(event.fandom_id, event.created_at)
                    last_acquired[event.fandom_id] = event.created_at
                continue

            if event.fandom_id == owner.fandom_id:
                continue

            challenger_points = scores[score_key]
            if challenger_points >= 300 and challenger_points * 10 >= owner_points * 11:
                ownership[event.place_id] = _Ownership(event.fandom_id, event.created_at)
                last_acquired[event.fandom_id] = event.created_at

        strongholds = tuple(
            StrongholdProjection(
                place_id=place_id,
                season_id=self.season_id,
                owner_fandom_id=owner.fandom_id,
                level=self._level(scores[(place_id, owner.fandom_id)]),
                acquired_at=owner.acquired_at,
                projection_version=projection_version,
            )
            for place_id, owner in sorted(ownership.items())
        )
        place_scores = tuple(
            PlaceFandomScoreProjection(
                place_id=place_id,
                season_id=self.season_id,
                fandom_id=fandom_id,
                valid_points=points,
                projection_version=projection_version,
            )
            for (place_id, fandom_id), points in sorted(scores.items())
        )

        stronghold_counts = {fandom_id: 0 for fandom_id in all_fandom_ids}
        for item in strongholds:
            stronghold_counts[item.owner_fandom_id] += 1
        season_points = {fandom_id: 0 for fandom_id in all_fandom_ids}
        for (_, fandom_id), points in scores.items():
            season_points[fandom_id] += points

        latest = datetime.max.replace(tzinfo=timezone.utc)
        ordered_fandoms = sorted(
            all_fandom_ids,
            key=lambda fandom_id: (
                -stronghold_counts[fandom_id],
                -season_points[fandom_id],
                last_acquired.get(fandom_id, latest),
                fandom_id,
            ),
        )
        leaderboard = tuple(
            LeaderboardProjection(
                season_id=self.season_id,
                fandom_id=fandom_id,
                rank=rank,
                stronghold_count=stronghold_counts[fandom_id],
                valid_points=season_points[fandom_id],
                last_acquired_at=last_acquired.get(fandom_id),
                projection_version=projection_version,
            )
            for rank, fandom_id in enumerate(ordered_fandoms, start=1)
        )
        projection_hash = self._hash(strongholds, leaderboard)
        return TerritorySnapshot(
            season_id=self.season_id,
            strongholds=strongholds,
            place_scores=place_scores,
            leaderboard=leaderboard,
            projection_version=projection_version,
            projection_hash=projection_hash,
        )

    @staticmethod
    def _level(points: int) -> StrongholdLevel:
        if points >= 2000:
            return StrongholdLevel.LANDMARK
        if points >= 1000:
            return StrongholdLevel.TREE
        return StrongholdLevel.SEED

    @staticmethod
    def _hash(
        strongholds: tuple[StrongholdProjection, ...],
        leaderboard: tuple[LeaderboardProjection, ...],
    ) -> str:
        canonical = {
            "strongholds": [
                {
                    "place_id": item.place_id,
                    "owner_fandom_id": item.owner_fandom_id,
                    "level": item.level.value,
                }
                for item in strongholds
            ],
            "ranks": [
                {"fandom_id": item.fandom_id, "rank": item.rank}
                for item in leaderboard
            ],
        }
        payload = json.dumps(canonical, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()
