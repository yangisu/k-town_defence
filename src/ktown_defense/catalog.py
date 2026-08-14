"""Public place discovery read model.

The catalog owns the public visibility predicate so list, detail, and
stronghold responses cannot disagree about revoked or expired content.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Callable, Iterable


@dataclass(frozen=True)
class Artist:
    artist_id: str
    display_name_ko: str
    rights_status: str
    rights_expires_at: datetime | None
    public_visible: bool


@dataclass(frozen=True)
class Fandom:
    fandom_id: str
    artist_id: str
    display_name_ko: str


@dataclass(frozen=True)
class Place:
    place_id: str
    name_ko: str
    address_ko: str
    description_ko: str
    transit_guide_ko: str
    map_deep_link: str
    source_locale: str
    latitude: float
    longitude: float
    rights_status: str
    approved_at: datetime | None
    expires_at: datetime | None
    active: bool
    public_visible: bool
    place_type: str = "verified"
    admin_area_code: str | None = None
    source: str | None = None


@dataclass(frozen=True)
class PlaceArtistLink:
    place_artist_link_id: str
    place_id: str
    artist_id: str
    status: str
    expires_at: datetime | None
    evidence_tier: str = "verified"
    approved_at: datetime | None = None
    evidence_uri: str | None = None


@dataclass(frozen=True)
class StrongholdProjection:
    stronghold_projection_id: str
    place_id: str
    season_id: str
    owner_fandom_id: str
    level: str
    acquired_at: datetime
    projection_version: int


@dataclass(frozen=True)
class LeaderboardProjection:
    leaderboard_projection_id: str
    season_id: str
    fandom_id: str
    stronghold_count: int
    valid_points: int
    last_acquired_at: datetime | None
    projection_version: int


class PlaceCatalog:
    """In-memory public read model with a single fail-closed visibility gate."""

    def __init__(
        self,
        *,
        artists: Iterable[Artist] = (),
        fandoms: Iterable[Fandom] = (),
        places: Iterable[Place] = (),
        links: Iterable[PlaceArtistLink] = (),
        strongholds: Iterable[StrongholdProjection] = (),
        leaderboards: Iterable[LeaderboardProjection] = (),
        current_season_id: str | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._artists = {item.artist_id: item for item in artists}
        self._fandoms = {item.fandom_id: item for item in fandoms}
        self._places = {item.place_id: item for item in places}
        self._links = tuple(links)
        self._strongholds = tuple(strongholds)
        self._leaderboards = tuple(leaderboards)
        self.current_season_id = current_season_id
        self._clock = clock or (lambda: datetime.now(timezone.utc))

    @property
    def places(self) -> dict[str, Place]:
        """Return a copy of the current immutable place read model."""

        return dict(self._places)

    @property
    def links(self) -> tuple[PlaceArtistLink, ...]:
        return self._links

    @property
    def artists(self) -> dict[str, Artist]:
        """Return a copy for release-readiness checks."""

        return dict(self._artists)

    def hide_subject(self, subject_type: str, subject_id: str) -> None:
        """Atomically remove a rights-deletion target from every public read."""

        if subject_type == "artist":
            artist = self._artists.get(subject_id)
            if artist is None:
                raise KeyError(subject_id)
            self._artists[subject_id] = replace(artist, public_visible=False)
            return
        if subject_type == "place":
            place = self._places.get(subject_id)
            if place is None:
                raise KeyError(subject_id)
            self._places[subject_id] = replace(place, public_visible=False)
            return
        raise ValueError("subject_type must be artist or place")

    @staticmethod
    def _not_expired(expires_at: datetime | None, now: datetime) -> bool:
        return expires_at is None or expires_at > now

    def _artist_is_public(self, artist: Artist | None, now: datetime) -> bool:
        return bool(
            artist
            and artist.public_visible
            and artist.rights_status == "approved"
            and self._not_expired(artist.rights_expires_at, now)
        )

    def _place_is_public(self, place: Place, now: datetime) -> bool:
        return bool(
            place.active
            and place.public_visible
            and place.source_locale == "ko"
            and place.rights_status == "approved"
            and place.approved_at is not None
            and place.approved_at <= now
            and self._not_expired(place.expires_at, now)
        )

    def _has_approved_link(self, place_id: str, artist_id: str, now: datetime) -> bool:
        return any(
            link.place_id == place_id
            and link.artist_id == artist_id
            and link.status == "approved"
            and self._not_expired(link.expires_at, now)
            for link in self._links
        )

    def _is_public_for_artist(self, place: Place, artist_id: str, now: datetime) -> bool:
        return (
            self._artist_is_public(self._artists.get(artist_id), now)
            and self._place_is_public(place, now)
            and self._has_approved_link(place.place_id, artist_id, now)
        )

    def _stronghold_for(self, place_id: str) -> StrongholdProjection | None:
        return next(
            (
                item
                for item in self._strongholds
                if item.place_id == place_id and item.season_id == self.current_season_id
            ),
            None,
        )

    @staticmethod
    def _stronghold_payload(item: StrongholdProjection) -> dict[str, object]:
        return {
            "stronghold_id": item.stronghold_projection_id,
            "owner_fandom_id": item.owner_fandom_id,
            "level": item.level,
            "acquired_at": item.acquired_at.isoformat(),
            "projection_version": item.projection_version,
        }

    def _place_payload(self, place: Place) -> dict[str, object]:
        stronghold = self._stronghold_for(place.place_id)
        return {
            "place_id": place.place_id,
            "name_ko": place.name_ko,
            "address_ko": place.address_ko,
            "description_ko": place.description_ko,
            "transit_guide_ko": place.transit_guide_ko,
            "map_deep_link": place.map_deep_link,
            "source_locale": place.source_locale,
            "place_type": place.place_type,
            "admin_area_code": place.admin_area_code,
            "location": {"latitude": place.latitude, "longitude": place.longitude},
            "stronghold": self._stronghold_payload(stronghold) if stronghold else None,
        }

    def list_places(self, artist_id: str | None) -> list[dict[str, object]]:
        if not artist_id:
            return []
        now = self._clock()
        return [
            self._place_payload(place)
            for place in sorted(self._places.values(), key=lambda item: item.place_id)
            if self._is_public_for_artist(place, artist_id, now)
        ]

    def get_place(self, place_id: str, artist_id: str | None) -> dict[str, object] | None:
        if not artist_id:
            return None
        now = self._clock()
        place = self._places.get(place_id)
        if place is None or not self._is_public_for_artist(place, artist_id, now):
            return None
        return self._place_payload(place)

    def list_strongholds(self, artist_id: str | None = None) -> list[dict[str, object]]:
        now = self._clock()
        result: list[dict[str, object]] = []
        for stronghold in self._strongholds:
            if stronghold.season_id != self.current_season_id:
                continue
            fandom = self._fandoms.get(stronghold.owner_fandom_id)
            place = self._places.get(stronghold.place_id)
            if fandom is None or place is None:
                continue
            if not self._artist_is_public(self._artists.get(fandom.artist_id), now):
                continue
            linked_artist_ids = (
                (artist_id,)
                if artist_id
                else tuple(link.artist_id for link in self._links if link.place_id == place.place_id)
            )
            if not any(
                self._is_public_for_artist(place, linked_artist_id, now)
                for linked_artist_id in linked_artist_ids
            ):
                continue
            result.append({"place_id": place.place_id, **self._stronghold_payload(stronghold)})
        return result

    def list_leaderboard(self) -> list[dict[str, object]]:
        now = self._clock()
        rows = []
        for item in self._leaderboards:
            fandom = self._fandoms.get(item.fandom_id)
            artist = self._artists.get(fandom.artist_id) if fandom else None
            if (
                item.season_id != self.current_season_id
                or fandom is None
                or not self._artist_is_public(artist, now)
            ):
                continue
            rows.append((item, fandom, artist))

        latest = datetime.max.replace(tzinfo=timezone.utc)
        rows.sort(
            key=lambda row: (
                -row[0].stronghold_count,
                -row[0].valid_points,
                row[0].last_acquired_at or latest,
                row[0].fandom_id,
            )
        )
        return [
            {
                "rank": rank,
                "fandom_id": item.fandom_id,
                "fandom_name_ko": fandom.display_name_ko,
                "artist_id": artist.artist_id,
                "artist_name_ko": artist.display_name_ko,
                "stronghold_count": item.stronghold_count,
                "valid_points": item.valid_points,
                "last_acquired_at": (
                    item.last_acquired_at.isoformat() if item.last_acquired_at else None
                ),
                "projection_version": item.projection_version,
            }
            for rank, (item, fandom, artist) in enumerate(rows, start=1)
        ]
