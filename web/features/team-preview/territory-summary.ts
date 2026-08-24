import { isContestedTerritory } from "./territory-rules";
import type { ArtistConnection, ArtistId, PreviewTerritory, TerritoryId } from "./types";

export interface PersonalizedTerritorySummary {
  ownedCount: number;
  strongestOwnedTerritoryId: TerritoryId | null;
  nearestContestedTerritoryId: TerritoryId | null;
  recommendation: { kind: "defend" | "capture"; territoryId: TerritoryId } | null;
}

const nationwideCenter = { latitude: 36.3, longitude: 127.8 };

function hasFiniteCentroid(territory: PreviewTerritory) {
  return Number.isFinite(territory.centroid.latitude) && Number.isFinite(territory.centroid.longitude);
}

function distanceSquared(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const latitude = a.latitude - b.latitude;
  const longitude = a.longitude - b.longitude;
  return latitude * latitude + longitude * longitude;
}

export function summarizeTerritories(
  territories: readonly PreviewTerritory[],
  artistId: ArtistId,
  connections: readonly ArtistConnection[],
): PersonalizedTerritorySummary {
  const connectedIds = new Set(connections.filter((connection) => connection.artistId === artistId).map((connection) => connection.territoryId));
  const owned = territories.filter((territory) => territory.ownerArtistId === artistId);
  const strongestOwned = owned.reduce<PreviewTerritory | null>((strongest, territory) => {
    if (!strongest) return territory;
    const strongestPoints = strongest.standings.find((standing) => standing.artistId === artistId)?.validPoints ?? 0;
    const territoryPoints = territory.standings.find((standing) => standing.artistId === artistId)?.validPoints ?? 0;
    return territoryPoints > strongestPoints ? territory : strongest;
  }, null);
  const strongestOwnedAnchor = strongestOwned && hasFiniteCentroid(strongestOwned) ? strongestOwned : null;
  const connectedAnchor = territories.find((territory) => connectedIds.has(territory.id) && hasFiniteCentroid(territory)) ?? null;
  const anchor = strongestOwnedAnchor?.centroid ?? connectedAnchor?.centroid ?? nationwideCenter;
  const nearestContested = territories.reduce<PreviewTerritory | null>((nearest, territory) => {
    if (!isContestedTerritory(territory) || !hasFiniteCentroid(territory)) return nearest;
    if (!nearest || distanceSquared(anchor, territory.centroid) < distanceSquared(anchor, nearest.centroid)) return territory;
    return nearest;
  }, null);

  if (nearestContested) {
    return {
      ownedCount: owned.length,
      strongestOwnedTerritoryId: strongestOwned?.id ?? null,
      nearestContestedTerritoryId: nearestContested.id,
      recommendation: {
        kind: nearestContested.ownerArtistId === artistId ? "defend" : "capture",
        territoryId: nearestContested.id,
      },
    };
  }

  const connectedNonOwned = territories.find((territory) => connectedIds.has(territory.id) && territory.ownerArtistId !== artistId) ?? null;
  return {
    ownedCount: owned.length,
    strongestOwnedTerritoryId: strongestOwned?.id ?? null,
    nearestContestedTerritoryId: null,
    recommendation: connectedNonOwned
      ? { kind: "capture", territoryId: connectedNonOwned.id }
      : strongestOwned ? { kind: "defend", territoryId: strongestOwned.id } : null,
  };
}
