import type { PreviewTerritory } from "./types";

export const CONTESTED_TERRITORY_GAP = 200;

export function territoryGap(territory: PreviewTerritory) {
  const ordered = [...territory.standings].sort((a, b) => b.validPoints - a.validPoints);
  return Math.max((ordered[0]?.validPoints ?? 0) - (ordered[1]?.validPoints ?? 0), 0);
}

export function isContestedTerritory(territory: PreviewTerritory) {
  return territoryGap(territory) <= CONTESTED_TERRITORY_GAP;
}
