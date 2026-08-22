"use client";

import { previewContent } from "@/features/team-preview/content";
import { t, type CopyKey } from "@/features/team-preview/i18n";
import type { ArtistId, Locale, PreviewTerritory } from "@/features/team-preview/types";

export type TerritoryFilter =
  | "recommended"
  | "unclaimed"
  | "contested"
  | "artist_connection"
  | "population_decline";

export const TERRITORY_FILTERS: readonly { id: TerritoryFilter; labelKey: CopyKey }[] = [
  { id: "recommended", labelKey: "mapRecommended" },
  { id: "unclaimed", labelKey: "mapUnclaimed" },
  { id: "contested", labelKey: "mapContested" },
  { id: "artist_connection", labelKey: "mapArtistConnection" },
  { id: "population_decline", labelKey: "mapPopulationDecline" },
];

const CONTESTED_GAP = 200;

export function territoryGap(territory: PreviewTerritory) {
  const ordered = [...territory.standings].sort((a, b) => b.validPoints - a.validPoints);
  return Math.max((ordered[0]?.validPoints ?? 0) - (ordered[1]?.validPoints ?? 0), 0);
}

export function filterAndOrderTerritories(
  territories: readonly PreviewTerritory[],
  filter: TerritoryFilter,
  artistId: ArtistId,
) {
  const connectedIds = new Set(previewContent.connections
    .filter((connection) => connection.artistId === artistId)
    .map((connection) => connection.territoryId));
  const isContested = (territory: PreviewTerritory) => territoryGap(territory) <= CONTESTED_GAP;
  const filtered = territories.filter((territory) => {
    switch (filter) {
      case "unclaimed": return territory.ownerArtistId !== artistId;
      case "contested": return isContested(territory);
      case "artist_connection": return connectedIds.has(territory.id);
      case "population_decline": return territory.populationDecline;
      case "recommended": return true;
    }
  });

  return [...filtered].sort((a, b) => (
    Number(connectedIds.has(b.id)) - Number(connectedIds.has(a.id))
    || Number(isContested(b)) - Number(isContested(a))
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
    <div className="map-filters" aria-label={locale === "ko" ? "영토 필터" : "Territory filters"}>
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
    </div>
  );
}
