"use client";

import type { ArtistId, Locale, PreviewTerritory, TerritoryId } from "@/features/team-preview/types";

interface TerritoryListProps {
  territories: readonly PreviewTerritory[];
  locale: Locale;
  selectedArtistId?: ArtistId | null;
  selectedTerritoryId: TerritoryId | null;
  onSelectTerritory: (territoryId: TerritoryId) => void;
}

export function TerritoryList({ territories, locale, selectedArtistId, selectedTerritoryId, onSelectTerritory }: TerritoryListProps) {
  return (
    <ul className="preview-territory-list" aria-label="지도와 같은 영토 목록">
      {territories.map((territory) => {
        const owner = territory.standings.find((standing) => standing.artistId === territory.ownerArtistId);
        const selected = territory.standings.find((standing) => standing.artistId === selectedArtistId);
        const ownerPoints = owner?.validPoints ?? 0;
        const selectedPoints = selected?.validPoints ?? 0;
        const gap = territory.ownerArtistId === selectedArtistId
          ? Math.max(ownerPoints - Math.max(...territory.standings.filter((standing) => standing.artistId !== selectedArtistId).map((standing) => standing.validPoints), 0), 0)
          : Math.max(ownerPoints - selectedPoints + 1, 1);
        return (
        <li key={territory.id}>
          <button
            type="button"
            aria-pressed={selectedTerritoryId === territory.id}
            onClick={() => onSelectTerritory(territory.id)}
          >
            <strong>{territory.name[locale]}</strong>
            <span>{territory.standings[0]?.fandomName ?? "—"}</span>
            {territory.populationDecline ? <small>{territory.balanceMultiplier}×</small> : null}
            {selectedArtistId ? (
              <small>{territory.ownerArtistId === selectedArtistId
                ? `${locale === "ko" ? "방어 우위" : "Defense lead"} ${gap}P`
                : `${locale === "ko" ? "탈환까지" : "Points to capture"} ${gap}P`}</small>
            ) : null}
          </button>
        </li>
        );
      })}
    </ul>
  );
}
