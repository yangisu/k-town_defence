"""Tourism catalog synchronization and last-good snapshot availability."""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Callable, Iterable
from uuid import uuid4

from .catalog import Artist, Fandom, Place, PlaceArtistLink, PlaceCatalog

if TYPE_CHECKING:
    from .ktour_openapi import KTourKeywordQuery, KTourOpenAPIClient


KTOUR_SOURCE = "KTOUR_API"
SNAPSHOT_TTL = timedelta(hours=24)


@dataclass(frozen=True)
class RightsRecord:
    rights_record_id: str
    subject_type: str
    subject_id: str
    status: str
    evidence_uri: str
    approved_at: datetime | None
    expires_at: datetime | None
    revoked_at: datetime | None = None


@dataclass(frozen=True)
class CatalogSyncRun:
    catalog_sync_run_id: str
    source: str
    snapshot_version: str | None
    started_at: datetime
    completed_at: datetime
    status: str
    snapshot_uri: str | None
    last_good: bool
    usable_until: datetime | None


@dataclass(frozen=True)
class TourismPlaceRecord:
    place_id: str
    artist_id: str
    name_ko: str
    address_ko: str
    description_ko: str
    transit_guide_ko: str
    map_deep_link: str
    latitude: float
    longitude: float
    admin_area_code: str
    place_type: str
    place_evidence_uri: str
    rights_evidence_uri: str
    rights_expires_at: datetime | None


@dataclass(frozen=True)
class TourismSnapshot:
    snapshot_version: str
    snapshot_uri: str
    records: tuple[TourismPlaceRecord, ...]


class CatalogSyncService:
    """Owns atomic catalog replacement and the 24-hour fallback policy."""

    def __init__(
        self,
        *,
        artists: Iterable[Artist] = (),
        fandoms: Iterable[Fandom] = (),
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._base_artists = {artist.artist_id: artist for artist in artists}
        self._fandoms = tuple(fandoms)
        self._snapshot: TourismSnapshot | None = None
        self._last_good_completed_at: datetime | None = None
        self._rights_records: dict[str, RightsRecord] = {}
        self._revoked_subjects: set[tuple[str, str]] = set()
        self._runs: list[CatalogSyncRun] = []
        self.catalog = PlaceCatalog(clock=self._clock)

    @property
    def rights_records(self) -> dict[str, RightsRecord]:
        return dict(self._rights_records)

    @property
    def artists(self) -> dict[str, Artist]:
        return self.catalog.artists

    @property
    def runs(self) -> tuple[CatalogSyncRun, ...]:
        return tuple(self._runs)

    def sync(self, fetch_snapshot: Callable[[], TourismSnapshot]) -> CatalogSyncRun:
        started_at = self._clock()
        try:
            snapshot = fetch_snapshot()
            self._validate_snapshot(snapshot)
        except Exception:
            completed_at = self._clock()
            run = CatalogSyncRun(
                catalog_sync_run_id=str(uuid4()),
                source=KTOUR_SOURCE,
                snapshot_version=self._snapshot.snapshot_version if self._snapshot else None,
                started_at=started_at,
                completed_at=completed_at,
                status="failed",
                snapshot_uri=self._snapshot.snapshot_uri if self._snapshot else None,
                last_good=False,
                usable_until=self._usable_until(),
            )
            self._runs.append(run)
            return run

        completed_at = self._clock()
        rights_records = self._rights_from(snapshot, completed_at)
        self._snapshot = snapshot
        self._last_good_completed_at = completed_at
        self._rights_records.update(
            {
                record_id: record
                for record_id, record in rights_records.items()
                if (record.subject_type, record.subject_id) not in self._revoked_subjects
            }
        )
        self._rebuild_catalog()
        run = CatalogSyncRun(
            catalog_sync_run_id=str(uuid4()),
            source=KTOUR_SOURCE,
            snapshot_version=snapshot.snapshot_version,
            started_at=started_at,
            completed_at=completed_at,
            status="succeeded",
            snapshot_uri=snapshot.snapshot_uri,
            last_good=True,
            usable_until=completed_at + SNAPSHOT_TTL,
        )
        self._runs.append(run)
        return run

    def sync_from_ktour(
        self,
        queries: Iterable["KTourKeywordQuery"],
        *,
        client: "KTourOpenAPIClient | None" = None,
    ) -> CatalogSyncRun:
        """Run a catalog sync through the official KorService2 adapter.

        When no client is supplied, ``KTOUR_SERVICE_KEY`` is read by
        :meth:`KTourOpenAPIClient.from_env`. Keeping client construction inside
        the fetch callback makes missing credentials an ordinary failed sync,
        preserving the last-good snapshot policy.
        """

        configured_queries = tuple(queries)

        def fetch() -> TourismSnapshot:
            from .ktour_openapi import KTourOpenAPIClient

            active_client = client or KTourOpenAPIClient.from_env()
            return active_client.fetch_snapshot(configured_queries)

        return self.sync(fetch)

    @staticmethod
    def _validate_snapshot(snapshot: TourismSnapshot) -> None:
        if not snapshot.snapshot_version or not snapshot.snapshot_uri:
            raise ValueError("snapshot metadata is required")
        for record in snapshot.records:
            korean_fields = (
                record.name_ko,
                record.address_ko,
                record.description_ko,
                record.transit_guide_ko,
            )
            if not all(value.strip() for value in korean_fields):
                raise ValueError("Korean place metadata is required")
            if not record.place_evidence_uri or not record.rights_evidence_uri:
                raise ValueError("evidence metadata is required")

    @staticmethod
    def _rights_from(
        snapshot: TourismSnapshot, approved_at: datetime
    ) -> dict[str, RightsRecord]:
        return {
            f"rights:place:{record.place_id}": RightsRecord(
                rights_record_id=f"rights:place:{record.place_id}",
                subject_type="place",
                subject_id=record.place_id,
                status="approved",
                evidence_uri=record.rights_evidence_uri,
                approved_at=approved_at,
                expires_at=record.rights_expires_at,
            )
            for record in snapshot.records
        }

    def _usable_until(self) -> datetime | None:
        if self._last_good_completed_at is None:
            return None
        return self._last_good_completed_at + SNAPSHOT_TTL

    def discovery_status(self) -> dict[str, object]:
        usable_until = self._usable_until()
        return {
            "snapshot_version": self._snapshot.snapshot_version if self._snapshot else None,
            "stale": usable_until is not None and self._clock() > usable_until,
        }

    def can_start_checkin(self, place_id: str, artist_id: str) -> bool:
        usable_until = self._usable_until()
        if usable_until is None or self._clock() > usable_until:
            return False
        return self.catalog.get_place(place_id, artist_id) is not None

    def invalidate_rights(
        self, subject_type: str, subject_id: str, *, revoked_at: datetime | None = None
    ) -> None:
        if subject_type not in {"artist", "place"}:
            raise ValueError("subject_type must be artist or place")
        effective_at = revoked_at or self._clock()
        self._revoked_subjects.add((subject_type, subject_id))
        record_id = f"rights:{subject_type}:{subject_id}"
        current = self._rights_records.get(record_id)
        if current is None:
            current = RightsRecord(
                rights_record_id=record_id,
                subject_type=subject_type,
                subject_id=subject_id,
                status="approved",
                evidence_uri="",
                approved_at=None,
                expires_at=None,
            )
        self._rights_records[record_id] = replace(
            current, status="revoked", revoked_at=effective_at
        )
        self._rebuild_catalog()

    def hide_subject(self, subject_type: str, subject_id: str) -> None:
        """Persist deletion-request hiding across later snapshot rebuilds."""

        if subject_type == "artist" and subject_id not in self._base_artists:
            raise KeyError(subject_id)
        if subject_type == "place" and (
            self._snapshot is None
            or not any(item.place_id == subject_id for item in self._snapshot.records)
        ):
            raise KeyError(subject_id)
        self.invalidate_rights(subject_type, subject_id)

    def _rebuild_catalog(self) -> None:
        if self._snapshot is None:
            self.catalog = PlaceCatalog(clock=self._clock)
            return

        now = self._last_good_completed_at or self._clock()
        artists = [
            replace(artist, rights_status="revoked", public_visible=False)
            if ("artist", artist.artist_id) in self._revoked_subjects
            else artist
            for artist in self._base_artists.values()
        ]
        places: list[Place] = []
        links: list[PlaceArtistLink] = []
        for record in self._snapshot.records:
            revoked = ("place", record.place_id) in self._revoked_subjects
            places.append(
                Place(
                    place_id=record.place_id,
                    name_ko=record.name_ko,
                    address_ko=record.address_ko,
                    description_ko=record.description_ko,
                    transit_guide_ko=record.transit_guide_ko,
                    map_deep_link=record.map_deep_link,
                    source_locale="ko",
                    latitude=record.latitude,
                    longitude=record.longitude,
                    rights_status="revoked" if revoked else "approved",
                    approved_at=now,
                    expires_at=record.rights_expires_at,
                    active=not revoked,
                    public_visible=not revoked,
                    place_type=record.place_type,
                    admin_area_code=record.admin_area_code,
                    source=KTOUR_SOURCE,
                )
            )
            links.append(
                PlaceArtistLink(
                    place_artist_link_id=f"ktour:{record.place_id}:{record.artist_id}",
                    place_id=record.place_id,
                    artist_id=record.artist_id,
                    status="approved",
                    expires_at=record.rights_expires_at,
                    evidence_tier="official" if record.place_type == "official" else "verified",
                    approved_at=now,
                    evidence_uri=record.place_evidence_uri,
                )
            )
        self.catalog = PlaceCatalog(
            artists=artists,
            fandoms=self._fandoms,
            places=places,
            links=links,
            clock=self._clock,
        )

    def list_places(self, artist_id: str | None) -> list[dict[str, object]]:
        return self.catalog.list_places(artist_id)

    def get_place(self, place_id: str, artist_id: str | None) -> dict[str, object] | None:
        return self.catalog.get_place(place_id, artist_id)

    def list_strongholds(self, artist_id: str | None = None) -> list[dict[str, object]]:
        return self.catalog.list_strongholds(artist_id)

    def list_leaderboard(self) -> list[dict[str, object]]:
        return self.catalog.list_leaderboard()
