import type { ArtistId } from "./types";
import { artists, connections } from "@/lib/demo-preview/artists";
import { expeditions, places } from "@/lib/demo-preview/missions";
import { territories } from "@/lib/demo-preview/territories";

export const previewContent = {
  artists,
  connections,
  territories,
  places,
  expeditions,
} as const;

export function getArtistHomeTerritories(artistId: ArtistId) {
  const ids = new Set(connections.filter((item) => item.artistId === artistId).map((item) => item.territoryId));
  return territories.filter((item) => ids.has(item.id));
}

export function getExpeditionsForArtist(artistId: ArtistId) {
  return expeditions.filter((item) => item.artistId === artistId);
}
