import { connections } from "@/lib/demo-preview/artists";
import { expeditionConnections, expeditions, places } from "@/lib/demo-preview/missions";
import { territories } from "@/lib/demo-preview/territories";
import type {
  ArtistConnection,
  ArtistId,
  PreviewExpedition,
  PreviewMissionPlace,
  PreviewTerritory,
  TerritoryId,
} from "./types";

export interface ExpeditionCatalog {
  territories: readonly PreviewTerritory[];
  connections: readonly ArtistConnection[];
  places: readonly PreviewMissionPlace[];
  expeditions: readonly PreviewExpedition[];
}

export interface RecommendedExpedition {
  kind: "artist_linked" | "regional_support";
  territoryId: TerritoryId;
  expedition: PreviewExpedition;
}

const EARTH_RADIUS_KM = 6371.0088;
const NATIONAL_ANCHOR = { latitude: 36.3, longitude: 127.8 };
const defaultCatalog: ExpeditionCatalog = {
  territories,
  connections: [...connections, ...expeditionConnections],
  places,
  expeditions,
};

function isHttps(url: string) {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function finiteCentroid(territory: PreviewTerritory | undefined) {
  return territory?.centroid
    && Number.isFinite(territory.centroid.latitude)
    && Number.isFinite(territory.centroid.longitude)
    ? territory.centroid
    : null;
}

function haversineKilometers(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const fromLatitude = radians(from.latitude);
  const toLatitude = radians(to.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function validateArtistPlaceEvidence(place: PreviewMissionPlace) {
  if (place.relationship !== "artist_connection" || place.access !== "public") return false;
  if (place.sourceUrls.length === 0
    || !place.sourceUrls.every(isHttps)
    || place.sources.length === 0
    || !place.sources.every((source) => isHttps(source.url))) return false;
  const eligibleSources = place.sources.filter((source) => source.claimSpecific && isHttps(source.url));
  if (place.evidenceClass === "official") {
    return eligibleSources.some((source) => source.reliability === "authoritative");
  }
  if (place.evidenceClass === "verified") {
    const reliable = eligibleSources.filter((source) => (
      source.reliability === "authoritative" || source.reliability === "reliable_public"
    ));
    return reliable.length >= 2 && new Set(reliable.map((source) => source.publisher)).size >= 2;
  }
  return false;
}

export function validateRecommendedRoute(
  expedition: PreviewExpedition,
  places: readonly PreviewMissionPlace[],
  artistId: ArtistId,
  connections: readonly ArtistConnection[] = defaultCatalog.connections,
) {
  if (expedition.stopIds.length === 0) return false;
  const routePlaces = expedition.stopIds.map((id) => places.find((place) => place.id === id));
  if (routePlaces.some((place) => !place)) return false;
  const stops = routePlaces as PreviewMissionPlace[];
  if (stops.some((place) => place.territoryId !== expedition.territoryId || place.access !== "public")) return false;

  if (expedition.artistId === null || expedition.connectionId === null) {
    return expedition.artistId === null
      && expedition.connectionId === null
      && stops.every((place) => (
        place.relationship === "nearby_recommendation"
        && place.artistConnectionId === null
      ));
  }

  const firstStop = stops[0];
  const connection = connections.find((candidate) => candidate.id === expedition.connectionId);
  return expedition.artistId === artistId
    && Boolean(connection)
    && connection?.artistId === artistId
    && connection.territoryId === expedition.territoryId
    && firstStop.artistConnectionId === expedition.connectionId
    && validateArtistPlaceEvidence(firstStop)
    && stops.slice(1).every((place) => (
      place.relationship === "nearby_recommendation"
      && place.artistConnectionId === null
    ));
}

function findRoute(
  catalog: ExpeditionCatalog,
  artistId: ArtistId,
  territoryId: TerritoryId,
  kind: RecommendedExpedition["kind"],
) {
  return catalog.expeditions.find((expedition) => (
    expedition.territoryId === territoryId
    && (kind === "artist_linked" ? expedition.artistId === artistId : expedition.artistId === null)
    && validateRecommendedRoute(expedition, catalog.places, artistId, catalog.connections)
  ));
}

export function selectRecommendedExpedition(
  artistId: ArtistId,
  territoryId: TerritoryId,
  catalog: ExpeditionCatalog = defaultCatalog,
): RecommendedExpedition | null {
  const selectedArtistRoute = findRoute(catalog, artistId, territoryId, "artist_linked");
  if (selectedArtistRoute) {
    return { kind: "artist_linked", territoryId: selectedArtistRoute.territoryId, expedition: selectedArtistRoute };
  }

  const anchorTerritory = catalog.territories.find((territory) => territory.id === territoryId);
  const anchor = finiteCentroid(anchorTerritory) ?? NATIONAL_ANCHOR;
  const catalogOrder = new Map(catalog.territories.map((territory, index) => [territory.id, index]));
  const connectedTerritoryIds = [...new Set(catalog.connections
    .filter((connection) => connection.artistId === artistId && connection.territoryId !== territoryId)
    .map((connection) => connection.territoryId))];
  const connectedTerritories = connectedTerritoryIds
    .map((id) => catalog.territories.find((territory) => territory.id === id))
    .filter((territory): territory is PreviewTerritory => finiteCentroid(territory) !== null)
    .sort((left, right) => {
      const distance = haversineKilometers(anchor, left.centroid) - haversineKilometers(anchor, right.centroid);
      return Math.abs(distance) > Number.EPSILON
        ? distance
        : (catalogOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER)
          - (catalogOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER);
    });

  for (const connectedTerritory of connectedTerritories) {
    const route = findRoute(catalog, artistId, connectedTerritory.id, "artist_linked");
    if (route) return { kind: "artist_linked", territoryId: route.territoryId, expedition: route };
  }

  const regionalRoute = findRoute(catalog, artistId, territoryId, "regional_support");
  return regionalRoute
    ? { kind: "regional_support", territoryId: regionalRoute.territoryId, expedition: regionalRoute }
    : null;
}
