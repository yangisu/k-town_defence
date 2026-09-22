import { previewContent } from "@/features/team-preview/content";
import type { ArtistId, ArtistProfile } from "@/features/team-preview/types";
import type { FandomSummary } from "@/lib/domain";

/** Marks an artist a member named themselves rather than one the catalog
 *  documents. The fandom's own id follows, so the identifier is stable across
 *  sessions and devices. */
export const CUSTOM_ARTIST_PREFIX = "fandom:";

// Picked to stay legible against both themes, and far enough apart that two
// neighbouring fandoms do not read as the same colour.
const CUSTOM_COLORS = [
  "#c2410c", "#0f766e", "#7e22ce", "#b91c1c", "#1d4ed8",
  "#15803d", "#a16207", "#be185d", "#0369a1", "#4d7c0f",
];

export function isCustomArtistId(artistId: string): boolean {
  return artistId.startsWith(CUSTOM_ARTIST_PREFIX);
}

export function artistIdForFandom(fandomId: string): ArtistId {
  return `${CUSTOM_ARTIST_PREFIX}${fandomId}`;
}

function colorFor(seed: string): string {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return CUSTOM_COLORS[hash % CUSTOM_COLORS.length];
}

function markerFor(name: string): string {
  const words = name.trim().split(/\s+/);
  const initials = words.length > 1
    ? words.slice(0, 2).map((word) => word[0]).join("")
    : name.trim().slice(0, 3);
  return initials.toLocaleUpperCase() || "?";
}

/**
 * The artist behind a fandom. A fandom the catalog knows resolves to its
 * documented artist, with the territories and ties written for it; one a
 * member named themselves is built from its two names alone. The second kind
 * holds no ground and has no routes of its own — nobody has documented a tie
 * between that artist and a place — so it plays the open board.
 */
export function artistProfileForFandom(fandom: FandomSummary): ArtistProfile {
  const documented = previewContent.artists.find((artist) => artist.fandomName === fandom.name);
  if (documented) return documented;
  const artistName = fandom.artistName?.trim() || fandom.name;
  return {
    id: artistIdForFandom(fandom.id),
    artistName: { ko: artistName, en: artistName },
    fandomName: fandom.name,
    color: colorFor(fandom.id),
    markerLabel: markerFor(artistName),
    representativeTerritoryIds: [],
  };
}

/** The profile behind a standing, which names the fandom but carries no id of
 *  its own. Used so a board a member-named fandom appears on still renders. */
export function artistProfileForFandomName(fandomName: string): ArtistProfile {
  return artistProfileForFandom({ id: fandomName, name: fandomName, artistName: null });
}
