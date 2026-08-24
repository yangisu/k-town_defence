import type { StrongholdStage } from "./types";

export type TerritoryBounds = [[number, number], [number, number]];

export function strongholdRadius(stage: StrongholdStage): 7 | 11 | 16 {
  return stage === "seed" ? 7 : stage === "tree" ? 11 : 16;
}

export function ownerColor(ownerArtistId: string, colors: Readonly<Record<string, string>>) {
  return colors[ownerArtistId] ?? "#7559ff";
}

export function strongholdColor(ownerArtistId: string, _stage: StrongholdStage, colors: Readonly<Record<string, string>>) {
  return ownerColor(ownerArtistId, colors);
}

function positions(value: unknown): Array<[number, number]> | null {
  if (!Array.isArray(value)) return null;
  const found: Array<[number, number]> = [];
  const visit = (item: unknown): boolean => {
    if (!Array.isArray(item)) return false;
    if (item.length >= 2 && typeof item[0] === "number" && typeof item[1] === "number") {
      if (!Number.isFinite(item[0]) || !Number.isFinite(item[1])) return false;
      found.push([item[0], item[1]]);
      return true;
    }
    return item.every(visit);
  };
  return visit(value) && found.length > 0 ? found : null;
}

export function territoryBounds(feature: unknown): TerritoryBounds | null {
  if (!feature || typeof feature !== "object") return null;
  const geometry = (feature as { geometry?: unknown }).geometry;
  if (!geometry || typeof geometry !== "object") return null;
  const { type, coordinates } = geometry as { type?: unknown; coordinates?: unknown };
  if (type !== "Polygon" && type !== "MultiPolygon") return null;
  const points = positions(coordinates);
  if (!points) return null;
  const longitudes = points.map(([longitude]) => longitude);
  const latitudes = points.map(([, latitude]) => latitude);
  return [[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]];
}
