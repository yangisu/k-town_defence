import type { ArtistConnection, ArtistId } from "./types";
import { artists, connections } from "@/lib/demo-preview/artists";
import { expeditions, places } from "@/lib/demo-preview/missions";
import { territories } from "@/lib/demo-preview/territories";
import { selectRecommendedExpedition } from "./expedition-selection";

export const previewContent = {
  artists,
  connections,
  territories,
  places,
  expeditions,
} as const;

export function getArtistHomeTerritories(artistId: ArtistId) {
  const artist = artists.find((item) => item.id === artistId);
  return (artist?.representativeTerritoryIds ?? [])
    .map((territoryId) => territories.find((item) => item.id === territoryId))
    .filter((territory): territory is (typeof territories)[number] => territory !== undefined);
}

export function getExpeditionsForArtist(artistId: ArtistId) {
  return expeditions.filter((item) => item.artistId === artistId);
}

export function getPlayableExpedition(artistId: ArtistId, territoryId: string) {
  return selectRecommendedExpedition(artistId, territoryId)?.expedition ?? null;
}

export function expeditionBelongsToArtist(expeditionId: string, artistId: ArtistId) {
  const expedition = expeditions.find((item) => item.id === expeditionId);
  return Boolean(expedition && (expedition.artistId === null || expedition.artistId === artistId));
}

export function validateConnectionEvidence(connection: ArtistConnection) {
  const claimSources = connection.sources.filter((source) => source.claimSpecific && source.reliability !== "team_input");
  if (connection.evidenceClass === "official") {
    return claimSources.some((source) => source.reliability === "authoritative")
      ? []
      : ["official evidence requires a claim-specific authoritative source"];
  }
  if (connection.evidenceClass === "verified") {
    return claimSources.length >= 2 && new Set(claimSources.map((source) => source.publisher)).size >= 2
      ? []
      : ["verified evidence requires two independent claim-specific reliable sources"];
  }
  return connection.evidenceNote.ko.length > 0 && connection.evidenceNote.en.length > 0
    ? []
    : ["team-data evidence requires an explicit localized unverified note"];
}
