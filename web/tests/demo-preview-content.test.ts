import { describe, expect, it } from "vitest";
import { previewContent, validateConnectionEvidence } from "@/features/team-preview/content";
import { validateRecommendedRoute } from "@/features/team-preview/expedition-selection";

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

  it("gives every artist a sourced regional story without requiring an artist-branded route", () => {
    for (const artist of previewContent.artists) {
      const connections = previewContent.connections.filter((item) => item.artistId === artist.id);
      expect(connections.length, artist.id).toBeGreaterThanOrEqual(1);
      expect(connections.every((item) => item.sourceUrls.length > 0)).toBe(true);
      expect(connections.flatMap((item) => item.sourceUrls).every((url) => url.startsWith("https://"))).toBe(true);
    }
  });

  it("labels direct connections and nearby recommendations honestly", () => {
    for (const connection of previewContent.connections) {
      expect(validateConnectionEvidence(connection), connection.id).toEqual([]);
      const sources = (connection as typeof connection & {
        sources?: Array<{
          publisher: string;
          reliability: "authoritative" | "reliable_public" | "team_input";
          claimSpecific: boolean;
        }>;
      }).sources;
      expect(sources, connection.id).toBeDefined();
      if (!sources) continue;

      if (connection.evidenceClass === "verified") {
        expect(sources.length, connection.id).toBeGreaterThanOrEqual(2);
        expect(new Set(sources.map((source) => source.publisher)).size, connection.id).toBeGreaterThanOrEqual(2);
        expect(sources.every((source) => source.claimSpecific && source.reliability !== "team_input"), connection.id).toBe(true);
      } else if (connection.evidenceClass === "official") {
        expect(sources.some((source) => source.claimSpecific && source.reliability === "authoritative"), connection.id).toBe(true);
      } else {
        expect(connection.evidenceClass, connection.id).toBe("team_data");
      }
    }
    for (const place of previewContent.places) {
      expect(place.access, place.id).toBe("public");
      if (place.relationship === "nearby_recommendation") {
        expect(place.artistConnectionId).toBeNull();
      }
    }
  });

  it("rejects semantic evidence upgrades that do not meet their source burden", () => {
    const connection = previewContent.connections[0];
    expect(validateConnectionEvidence({ ...connection, evidenceClass: "verified" }))
      .toContain("verified evidence requires two independent claim-specific reliable sources");
    expect(validateConnectionEvidence({ ...connection, evidenceClass: "official" }))
      .toContain("official evidence requires a claim-specific authoritative source");
    expect(validateConnectionEvidence({
      ...connection,
      evidenceClass: "team_data",
      evidenceNote: { ko: "", en: "" },
    })).toContain("team-data evidence requires an explicit localized unverified note");
  });

  it("never upgrades generic artist profiles or team spreadsheet leads into verified facts", () => {
    const genericProfileHosts = new Set([
      "www.melon.com",
      "ibighit.com",
      "www.starship-ent.com",
      "kiiikiii.kr",
      "riizeofficial.com",
      "zerobaseone.jp",
      "boynextdoor-official.jp",
      "www.le-sserafim.jp",
      "www.smtown.com",
      "newjeans.kr",
      "www.seventeen-17.jp",
    ]);

    for (const connection of previewContent.connections) {
      if (connection.sourceUrls.some((url) => genericProfileHosts.has(new URL(url).hostname))) {
        expect(connection.evidenceClass, connection.id).toBe("team_data");
      }
    }
  });

  it("gives all 23 territories a same-territory public route with two sourced stops", () => {
    const placesById = new Map(previewContent.places.map((place) => [place.id, place]));

    for (const territory of previewContent.territories) {
      const route = previewContent.expeditions.find((expedition) => (
        expedition.territoryId === territory.id && expedition.artistId === null && expedition.connectionId === null
      ));
      expect(route, territory.id).toBeDefined();
      expect(route?.title.ko, territory.id).toContain("지역 응원 원정");
      expect(route?.title.en, territory.id).toContain("regional support expedition");
      expect(validateRecommendedRoute(route!, previewContent.places, "bts", previewContent.connections), territory.id).toBe(true);
      expect(route?.stopIds, territory.id).toHaveLength(2);
      for (const stopId of route?.stopIds ?? []) {
        const place = placesById.get(stopId);
        expect(place?.territoryId, `${territory.id}:${stopId}`).toBe(territory.id);
        const sources = (place as typeof place & {
          sources?: Array<{ reliability: string; claimSpecific: boolean }>;
        } | undefined)?.sources;
        expect(sources, `${territory.id}:${stopId}`).toBeDefined();
        expect(sources?.some((source) => source.claimSpecific
          && ["authoritative", "official_tourism"].includes(source.reliability)), `${territory.id}:${stopId}`).toBe(true);
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
      const connection = expedition.connectionId === null ? undefined : connectionsById.get(expedition.connectionId);
      if (expedition.connectionId === null) {
        expect(expedition.artistId, expedition.id).toBeNull();
        expect(connection, expedition.id).toBeUndefined();
      } else {
        expect(connection, expedition.id).toMatchObject({
          artistId: expedition.artistId,
          territoryId: expedition.territoryId,
        });
      }

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
        expect(place.name.ko, place.id).toMatch(/시장|마을|거리|차이나타운/);
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
