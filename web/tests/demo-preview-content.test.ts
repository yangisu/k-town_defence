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

  it("sources every declared representative territory", () => {
    for (const artist of previewContent.artists) {
      const connectedTerritoryIds = new Set(
        previewContent.connections
          .filter((connection) => connection.artistId === artist.id)
          .map((connection) => connection.territoryId),
      );
      expect(connectedTerritoryIds, artist.id).toEqual(new Set(artist.representativeTerritoryIds));
    }
  });

  it("keeps expeditions, stops, and direct relationship claims referentially honest", () => {
    const placesById = new Map(previewContent.places.map((place) => [place.id, place]));
    const connectionsById = new Map(previewContent.connections.map((connection) => [connection.id, connection]));

    for (const expedition of previewContent.expeditions) {
      const connection = connectionsById.get(expedition.connectionId);
      expect(connection, expedition.id).toMatchObject({
        artistId: expedition.artistId,
        territoryId: expedition.territoryId,
      });

      for (const stopId of expedition.stopIds) {
        const place = placesById.get(stopId);
        expect(place, `${expedition.id}:${stopId}`).toBeDefined();
        expect(place?.territoryId, `${expedition.id}:${stopId}`).toBe(expedition.territoryId);
      }
    }

    for (const place of previewContent.places) {
      if (place.relationship === "artist_connection") {
        const connection = connectionsById.get(place.artistConnectionId!);
        expect(connection, place.id).toBeDefined();
        expect(connection?.territoryId, place.id).toBe(place.territoryId);
      }
    }
  });

  it("uses place-specific public-source locations with accurate categories", () => {
    for (const place of previewContent.places) {
      expect(place.sourceUrls, place.id).not.toContain("https://korean.visitkorea.or.kr/");
      expect(place.sourceUrls.every((url) => new URL(url).pathname !== "/"), place.id).toBe(true);
      expect(place.address.ko, place.id).toMatch(/[시군구읍면동로길]/);
      expect(Number.isFinite(place.coordinates.latitude), place.id).toBe(true);
      expect(Number.isFinite(place.coordinates.longitude), place.id).toBe(true);
      if (place.category === "local_food") {
        expect(place.name.ko, place.id).toMatch(/시장|마을/);
      }
    }
  });

  it("backs every population-decline multiplier with a designation document", () => {
    for (const territory of previewContent.territories.filter((item) => item.populationDecline)) {
      expect(territory.balanceMultiplier, territory.id).toBe(1.8);
      expect(territory.sourceUrls.some((url) => /population|인구감소|download|board/i.test(url)), territory.id).toBe(true);
    }
  });
});
