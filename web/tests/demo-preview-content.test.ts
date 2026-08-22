import { describe, expect, it } from "vitest";
import { previewContent } from "@/features/team-preview/content";

const expectedArtists = [
  ["bts", "ARMY"],
  ["blackpink", "BLINK"],
  ["rescene", "REMINE"],
  ["cortis", "COER"],
  ["btob", "MELODY"],
  ["ive", "DIVE"],
  ["kiiikiii", "TiiiKiii"],
  ["riize", "BRIIZE"],
  ["zerobaseone", "ZEROSE"],
  ["boynextdoor", "ONEDOOR"],
  ["le-sserafim", "FEARNOT"],
  ["aespa", "MY"],
  ["newjeans", "Bunnies"],
  ["iu", "UAENA"],
  ["seventeen", "CARAT"],
] as const;

describe("team preview content", () => {
  it("covers every approved artist and fandom in stable order", () => {
    expect(previewContent.artists.map(({ id, fandomName }) => [id, fandomName]))
      .toEqual(expectedArtists);
  });

  it("gives every artist a sourced connection and a playable expedition", () => {
    for (const artist of previewContent.artists) {
      const connections = previewContent.connections.filter((item) => item.artistId === artist.id);
      const expeditions = previewContent.expeditions.filter((item) => item.artistId === artist.id);
      expect(connections.length, artist.id).toBeGreaterThanOrEqual(1);
      expect(connections.every((item) => item.sourceUrls.length > 0)).toBe(true);
      expect(connections.flatMap((item) => item.sourceUrls).every((url) => url.startsWith("https://"))).toBe(true);
      expect(expeditions.length, artist.id).toBeGreaterThanOrEqual(1);
      expect(expeditions[0].stopIds.length, artist.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("labels direct connections and nearby recommendations honestly", () => {
    for (const connection of previewContent.connections) {
      expect(["official", "verified"]).toContain(connection.evidenceClass);
    }
    for (const place of previewContent.places) {
      if (place.relationship === "nearby_recommendation") {
        expect(place.artistConnectionId).toBeNull();
      }
    }
  });
});
