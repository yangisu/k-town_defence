import { isContestedTerritory } from "./territory-rules";
import type { ArtistConnection, ArtistId, PreviewTerritory, TerritoryId } from "./types";

export interface TerritoryAction {
  kind: "defend" | "capture";
  territoryId: TerritoryId;
  pointsRequired: number;
  anchorTerritoryId: TerritoryId | null;
  distanceKm: number | null;
}

export interface PersonalizedTerritorySummary {
  ownedCount: number;
  strongestOwnedTerritoryId: TerritoryId | null;
  nearestContestedTerritoryId: TerritoryId | null;
  nearestContestedAnchorTerritoryId: TerritoryId | null;
  nearestContestedDistanceKm: number | null;
  recommendation: TerritoryAction | null;
}

export interface ContestedTerritoryCandidate {
  territory: PreviewTerritory;
  kind: TerritoryAction["kind"];
  pointsRequired: number;
  anchorTerritoryId: TerritoryId | null;
  distanceKm: number | null;
}

const nationwideCenter = { latitude: 36.3, longitude: 127.8 };
const EARTH_RADIUS_KM = 6371;

function hasFiniteCentroid(territory: PreviewTerritory) {
  return Number.isFinite(territory.centroid.latitude) && Number.isFinite(territory.centroid.longitude);
}

function haversineDistanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const latitudeA = radians(a.latitude);
  const latitudeB = radians(b.latitude);
  const chord = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(chord), Math.sqrt(1 - chord));
}

function closestAnchor(
  territory: PreviewTerritory,
  anchors: readonly PreviewTerritory[],
): { territoryId: TerritoryId | null; distanceKm: number | null } {
  if (!hasFiniteCentroid(territory)) return { territoryId: null, distanceKm: null };
  const finiteAnchors = anchors.filter(hasFiniteCentroid);
  if (finiteAnchors.length === 0) {
    return { territoryId: null, distanceKm: Math.round(haversineDistanceKm(nationwideCenter, territory.centroid)) };
  }
  const nearest = finiteAnchors.reduce((best, anchor) => {
    const distanceKm = haversineDistanceKm(anchor.centroid, territory.centroid);
    return !best || distanceKm < best.distanceKm ? { anchor, distanceKm } : best;
  }, null as { anchor: PreviewTerritory; distanceKm: number } | null)!;
  return { territoryId: nearest.anchor.id, distanceKm: Math.round(nearest.distanceKm) };
}

function actionGap(territory: PreviewTerritory, artistId: ArtistId) {
  const selectedPoints = territory.standings.find((standing) => standing.artistId === artistId)?.validPoints ?? 0;
  const rivals = territory.standings.filter((standing) => standing.artistId !== artistId);
  const rivalPoints = Math.max(...rivals.map((standing) => standing.validPoints), 0);
  return territory.ownerArtistId === artistId
    ? Math.max(selectedPoints - rivalPoints, 0)
    : Math.max(rivalPoints - selectedPoints + 1, 1);
}

export function orderContestedTerritories(
  territories: readonly PreviewTerritory[],
  artistId: ArtistId,
  anchors: readonly PreviewTerritory[],
): ContestedTerritoryCandidate[] {
  return territories
    .filter(isContestedTerritory)
    .map((territory) => {
      const anchor = closestAnchor(territory, anchors);
      return {
        territory,
        kind: territory.ownerArtistId === artistId ? "defend" as const : "capture" as const,
        pointsRequired: actionGap(territory, artistId),
        anchorTerritoryId: anchor.territoryId,
        distanceKm: anchor.distanceKm,
      };
    })
    .sort((a, b) => (
      Number(a.kind === "capture") - Number(b.kind === "capture")
      || a.pointsRequired - b.pointsRequired
      || (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY)
      || b.territory.balanceMultiplier - a.territory.balanceMultiplier
      || a.territory.name.ko.localeCompare(b.territory.name.ko, "ko")
    ));
}

export function summarizeTerritories(
  territories: readonly PreviewTerritory[],
  artistId: ArtistId,
  connections: readonly ArtistConnection[],
): PersonalizedTerritorySummary {
  const connectedIds = new Set(connections
    .filter((connection) => connection.artistId === artistId)
    .map((connection) => connection.territoryId));
  const owned = territories.filter((territory) => territory.ownerArtistId === artistId);
  const strongestOwned = owned.reduce<PreviewTerritory | null>((strongest, territory) => {
    if (!strongest) return territory;
    const strongestPoints = strongest.standings.find((standing) => standing.artistId === artistId)?.validPoints ?? 0;
    const territoryPoints = territory.standings.find((standing) => standing.artistId === artistId)?.validPoints ?? 0;
    return territoryPoints > strongestPoints ? territory : strongest;
  }, null);
  const connectedAnchor = territories.find((territory) => connectedIds.has(territory.id) && hasFiniteCentroid(territory));
  const anchors = owned.some(hasFiniteCentroid) ? owned : connectedAnchor ? [connectedAnchor] : [];
  const contested = orderContestedTerritories(territories, artistId, anchors);
  const nearestContested = [...contested].sort((a, b) => (
    (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY)
    || a.pointsRequired - b.pointsRequired
  ))[0] ?? null;
  const recommended = contested[0] ?? null;

  if (recommended || nearestContested) {
    return {
      ownedCount: owned.length,
      strongestOwnedTerritoryId: strongestOwned?.id ?? null,
      nearestContestedTerritoryId: nearestContested?.territory.id ?? null,
      nearestContestedAnchorTerritoryId: nearestContested?.anchorTerritoryId ?? null,
      nearestContestedDistanceKm: nearestContested?.distanceKm ?? null,
      recommendation: recommended ? {
        kind: recommended.kind,
        territoryId: recommended.territory.id,
        pointsRequired: recommended.pointsRequired,
        anchorTerritoryId: recommended.anchorTerritoryId,
        distanceKm: recommended.distanceKm,
      } : null,
    };
  }

  const connectedNonOwned = territories.find((territory) => connectedIds.has(territory.id) && territory.ownerArtistId !== artistId) ?? null;
  const fallbackAnchor = connectedNonOwned ? closestAnchor(connectedNonOwned, anchors) : null;
  return {
    ownedCount: owned.length,
    strongestOwnedTerritoryId: strongestOwned?.id ?? null,
    nearestContestedTerritoryId: null,
    nearestContestedAnchorTerritoryId: null,
    nearestContestedDistanceKm: null,
    recommendation: connectedNonOwned ? {
      kind: "capture",
      territoryId: connectedNonOwned.id,
      pointsRequired: actionGap(connectedNonOwned, artistId),
      anchorTerritoryId: fallbackAnchor?.territoryId ?? null,
      distanceKm: fallbackAnchor?.distanceKm ?? null,
    } : strongestOwned ? {
      kind: "defend",
      territoryId: strongestOwned.id,
      pointsRequired: actionGap(strongestOwned, artistId),
      anchorTerritoryId: strongestOwned.id,
      distanceKm: 0,
    } : null,
  };
}
