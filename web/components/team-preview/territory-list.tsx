"use client";

import type { CSSProperties } from "react";
import { previewContent } from "@/features/team-preview/content";
import { t } from "@/features/team-preview/i18n";
import type { ArtistId, Locale, PreviewTerritory, TerritoryId } from "@/features/team-preview/types";
import { StrongholdMark } from "@/components/team-preview/stronghold-mark";

interface TerritoryListProps {
  territories: readonly PreviewTerritory[];
  locale: Locale;
  selectedArtistId?: ArtistId | null;
  selectedTerritoryId: TerritoryId | null;
  onSelectTerritory: (territoryId: TerritoryId) => void;
}

export function TerritoryList({ territories, locale, selectedArtistId, selectedTerritoryId, onSelectTerritory }: TerritoryListProps) {
  return (
    <ul className="preview-territory-list" aria-label={locale === "ko" ? "지도와 같은 영토 목록" : "Map-equivalent territory list"}>
      {territories.map((territory) => {
        const owner = territory.standings.find((standing) => standing.artistId === territory.ownerArtistId);
        const ownerColor = previewContent.artists.find((artist) => artist.id === territory.ownerArtistId)?.color ?? "#7559ff";
        const selected = territory.standings.find((standing) => standing.artistId === selectedArtistId);
        const ownerPoints = owner?.validPoints ?? 0;
        const selectedPoints = selected?.validPoints ?? 0;
        const gap = territory.ownerArtistId === selectedArtistId
          ? Math.max(ownerPoints - Math.max(...territory.standings.filter((standing) => standing.artistId !== selectedArtistId).map((standing) => standing.validPoints), 0), 0)
          : Math.max(ownerPoints - selectedPoints + 1, 1);
        return (
        <li key={territory.id} style={{ "--owner-color": ownerColor } as CSSProperties}>
          <button
            type="button"
            aria-pressed={selectedTerritoryId === territory.id}
            onClick={() => onSelectTerritory(territory.id)}
          >
            <strong>{territory.name[locale]}</strong>
            <span className="territory-owner"><i aria-hidden="true" />{t(locale, "currentOwner")} · {owner?.fandomName ?? "—"}</span>
            <StrongholdMark stage={territory.strongholdStage} locale={locale} />
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
