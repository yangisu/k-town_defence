"use client";

import { previewContent } from "@/features/team-preview/content";
import { t, type CopyKey } from "@/features/team-preview/i18n";
import { isContestedTerritory } from "@/features/team-preview/territory-rules";
import { orderContestedTerritories } from "@/features/team-preview/territory-summary";
import type { ArtistId, Locale, PreviewTerritory } from "@/features/team-preview/types";

export type TerritoryFilter =
  | "my_fandom"
  | "contested"
  | "artist_connection"
  | "all";

export const TERRITORY_FILTERS: readonly { id: TerritoryFilter; labelKey: CopyKey }[] = [
  { id: "my_fandom", labelKey: "mapMyFandom" },
  { id: "contested", labelKey: "mapContested" },
  { id: "artist_connection", labelKey: "mapArtistConnection" },
  { id: "all", labelKey: "mapAll" },
];

export function filterAndOrderTerritories(
  territories: readonly PreviewTerritory[],
  filter: TerritoryFilter,
  artistId: ArtistId,
) {
  const connectedIds = new Set(previewContent.connections
    .filter((connection) => connection.artistId === artistId)
    .map((connection) => connection.territoryId));
  const filtered = territories.filter((territory) => {
    switch (filter) {
      case "my_fandom": return territory.ownerArtistId === artistId;
      case "contested": return isContestedTerritory(territory);
      case "artist_connection": return connectedIds.has(territory.id);
      case "all": return true;
    }
  });

  if (filter === "contested") {
    const owned = territories.filter((territory) => territory.ownerArtistId === artistId);
    const connectedAnchor = territories.find((territory) => connectedIds.has(territory.id));
    const anchors = owned.length > 0 ? owned : connectedAnchor ? [connectedAnchor] : [];
    return orderContestedTerritories(filtered, artistId, anchors).map((candidate) => candidate.territory);
  }

  return [...filtered].sort((a, b) => (
    Number(connectedIds.has(b.id)) - Number(connectedIds.has(a.id))
    || Number(isContestedTerritory(b)) - Number(isContestedTerritory(a))
    || b.balanceMultiplier - a.balanceMultiplier
    || a.name.ko.localeCompare(b.name.ko, "ko")
  ));
}

export function MapFilters({ locale, activeFilter, onChange }: {
  locale: Locale;
  activeFilter: TerritoryFilter;
  onChange(filter: TerritoryFilter): void;
}) {
  return (
    <div className="map-filters" role="group" aria-label={locale === "ko" ? "영토 필터" : "Territory filters"}>
      {TERRITORY_FILTERS.map((filter) => (
        <button
          key={filter.id}
          type="button"
          aria-pressed={activeFilter === filter.id}
          onClick={() => onChange(filter.id)}
        >
          {t(locale, filter.labelKey)}
        </button>
      ))}
      {activeFilter === "contested" ? (
        <p className="map-sort-explanation" role="status">
          {locale === "ko"
            ? "정렬: 방어 긴급도 → 탈환 필요 포인트 → 내 거점 거리"
            : "Sorted by: defense urgency → capture points needed → distance from my base"}
        </p>
      ) : null}
    </div>
  );
}
