"use client";

import type { Locale, PreviewTerritory, TerritoryId } from "@/features/team-preview/types";

interface TerritoryListProps {
  territories: readonly PreviewTerritory[];
  locale: Locale;
  selectedTerritoryId: TerritoryId | null;
  onSelectTerritory: (territoryId: TerritoryId) => void;
}

export function TerritoryList({ territories, locale, selectedTerritoryId, onSelectTerritory }: TerritoryListProps) {
  return (
    <ul className="preview-territory-list" aria-label="지도와 같은 영토 목록">
      {territories.map((territory) => (
        <li key={territory.id}>
          <button
            type="button"
            aria-pressed={selectedTerritoryId === territory.id}
            onClick={() => onSelectTerritory(territory.id)}
          >
            <strong>{territory.name[locale]}</strong>
            <span>{territory.standings[0]?.fandomName ?? "—"}</span>
            {territory.populationDecline ? <small>{territory.balanceMultiplier}×</small> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
