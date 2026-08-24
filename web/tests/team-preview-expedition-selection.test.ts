import { describe, expect, it } from "vitest";
import {
  selectRecommendedExpedition,
  validateArtistPlaceEvidence,
  validateRecommendedRoute,
} from "@/features/team-preview/expedition-selection";
import type {
  ArtistConnection,
  ContentSource,
  PreviewExpedition,
  PreviewMissionPlace,
  PreviewTerritory,
  TerritoryId,
} from "@/features/team-preview/types";

function source(
  publisher: string,
  reliability: ContentSource["reliability"] = "reliable_public",
  url = `https://${publisher}.example/claim`,
): ContentSource {
  return { id: `${publisher}-source`, url, publisher, reliability, claimSpecific: true };
}

function verifiedSource(publisher: string) {
  return source(publisher, "reliable_public");
}

function nearbyPlace(overrides: Partial<PreviewMissionPlace> = {}): PreviewMissionPlace {
  return {
    id: "nearby-stop",
    territoryId: "busan",
    name: { ko: "공공 관광지", en: "Public attraction" },
    category: "culture",
    relationship: "nearby_recommendation",
    artistConnectionId: null,
    evidenceClass: null,
    access: "public",
    description: { ko: "지역 공공 관광 추천", en: "Regional public recommendation" },
    address: { ko: "부산광역시 중구", en: "Jung-gu, Busan" },
    coordinates: { latitude: 35.1, longitude: 129.03 },
    transport: {
      summary: { ko: "대중교통", en: "Transit" },
      nearestStation: { ko: "인근 정류장", en: "Nearby stop" },
      accessibilityNote: { ko: "공식 안내 확인", en: "Check official guidance" },
    },
    dwellMinutes: 45,
    visitBase: 100,
    localBenefit: { ko: "지역 상권", en: "Local commerce" },
    sourceUrls: ["https://tour.example/place"],
    sources: [source("tour", "official_tourism")],
    ...overrides,
  };
}

function artistPlace(overrides: Partial<PreviewMissionPlace> = {}): PreviewMissionPlace {
  return nearbyPlace({
    id: "verified-public-artist-stop",
    relationship: "artist_connection",
    artistConnectionId: "bts-busan-connection",
    evidenceClass: "verified",
    sources: [verifiedSource("publisher-a"), verifiedSource("publisher-b")],
    sourceUrls: ["https://publisher-a.example/claim", "https://publisher-b.example/claim"],
    ...overrides,
  });
}

function territory(id: TerritoryId, latitude: number, longitude: number): PreviewTerritory {
  return {
    id,
    name: { ko: id, en: id },
    centroid: { latitude, longitude },
    populationDecline: false,
    balanceMultiplier: 1,
    balanceReason: { ko: "기본", en: "Base" },
    sourceUrls: ["https://territory.example/data"],
    ownerArtistId: "boynextdoor",
    strongholdStage: "seed",
    standings: [
      { artistId: "boynextdoor", fandomName: "ONEDOOR", validPoints: 10 },
      { artistId: "bts", fandomName: "ARMY", validPoints: 9 },
    ],
  };
}

function connection(territoryId: TerritoryId, id = `bts-${territoryId}-connection`): ArtistConnection {
  return {
    id,
    artistId: "bts",
    territoryId,
    memberName: { ko: "멤버", en: "Member" },
    relationType: "official_activity",
    evidenceClass: "verified",
    evidenceNote: { ko: "검증", en: "Verified" },
    story: { ko: "연결 이야기", en: "Connection story" },
    sourceUrls: ["https://publisher-a.example/claim", "https://publisher-b.example/claim"],
    sources: [verifiedSource("publisher-a"), verifiedSource("publisher-b")],
  };
}

function route(
  id: string,
  territoryId: TerritoryId,
  stopIds: string[],
  artistId: PreviewExpedition["artistId"] = "bts",
  connectionId: string | null = `bts-${territoryId}-connection`,
): PreviewExpedition {
  return {
    id,
    artistId,
    territoryId,
    connectionId,
    title: artistId === null
      ? { ko: `${territoryId} 지역 응원 원정`, en: `${territoryId} regional support expedition` }
      : { ko: `BTS ${territoryId} 원정`, en: `BTS ${territoryId} expedition` },
    description: { ko: "원정", en: "Expedition" },
    stopIds,
    transitSummary: { ko: "90분", en: "90 minutes" },
    estimatedMinutes: 90,
  };
}

function syntheticCatalog({ firstStop = artistPlace() }: { firstStop?: PreviewMissionPlace } = {}) {
  const artistConnection = connection("busan", "bts-busan-connection");
  const busanNearby = nearbyPlace({ id: "busan-nearby", territoryId: "busan" });
  const gwangjuNearbyA = nearbyPlace({ id: "gwangju-nearby-a", territoryId: "gwangju" });
  const gwangjuNearbyB = nearbyPlace({ id: "gwangju-nearby-b", territoryId: "gwangju" });
  return {
    territories: [territory("gwangju", 35.16, 126.85), territory("busan", 35.18, 129.08)],
    connections: [artistConnection],
    places: [firstStop, busanNearby, gwangjuNearbyA, gwangjuNearbyB],
    expeditions: [
      route("bts-busan-route", "busan", [firstStop.id, busanNearby.id], "bts", artistConnection.id),
      route("gwangju-support", "gwangju", [gwangjuNearbyA.id, gwangjuNearbyB.id], null, null),
    ],
  };
}

describe("evidence-first expedition selection", () => {
  it("prefers a route with an eligible artist-linked first stop", () => {
    const result = selectRecommendedExpedition("bts", "busan", syntheticCatalog({
      firstStop: artistPlace({
        access: "public",
        evidenceClass: "verified",
        sources: [verifiedSource("publisher-a"), verifiedSource("publisher-b")],
      }),
    }));

    expect(result?.kind).toBe("artist_linked");
    expect(result?.expedition.stopIds[0]).toBe("verified-public-artist-stop");
  });

  it("labels a public-only fallback as regional support", () => {
    const result = selectRecommendedExpedition("bts", "gwangju", syntheticCatalog({
      firstStop: nearbyPlace({ access: "public" }),
    }));

    expect(result?.kind).toBe("regional_support");
    expect(result?.expedition.title.ko).toContain("지역 응원 원정");
    expect(result?.expedition.title.ko).not.toContain("BTS");
  });

  it("requires the full official or verified HTTPS evidence burden for a direct place", () => {
    expect(validateArtistPlaceEvidence(artistPlace({
      evidenceClass: "official",
      sources: [source("agency", "authoritative")],
    }))).toBe(true);
    expect(validateArtistPlaceEvidence(artistPlace({
      evidenceClass: "official",
      sources: [
        source("agency", "authoritative"),
        source("insecure", "reliable_public", "http://insecure.example/claim"),
      ],
    }))).toBe(false);
    expect(validateArtistPlaceEvidence(artistPlace({
      sources: [verifiedSource("publisher-a")],
    }))).toBe(false);
    expect(validateArtistPlaceEvidence(artistPlace({
      sources: [verifiedSource("same"), { ...verifiedSource("same"), id: "same-source-2" }],
    }))).toBe(false);
    expect(validateArtistPlaceEvidence(artistPlace({
      sources: [verifiedSource("publisher-a"), verifiedSource("publisher-b")].map((item) => ({ ...item, url: "http://example.test/claim" })),
    }))).toBe(false);
  });

  it.each(["restricted", "sensitive"] as const)("rejects a %s direct place", (access) => {
    expect(validateArtistPlaceEvidence(artistPlace({ access }))).toBe(false);
  });

  it("rejects routes with a non-public or direct follow-up stop", () => {
    const catalog = syntheticCatalog();
    const artistRoute = catalog.expeditions[0];
    const first = catalog.places[0];
    const restricted = nearbyPlace({ id: "restricted-follow-up", access: "restricted" });
    const direct = artistPlace({ id: "second-direct-stop" });

    expect(validateRecommendedRoute(
      { ...artistRoute, stopIds: [first.id, restricted.id] },
      [...catalog.places, restricted],
      "bts",
      catalog.connections,
    )).toBe(false);
    expect(validateRecommendedRoute(
      { ...artistRoute, stopIds: [first.id, direct.id] },
      [...catalog.places, direct],
      "bts",
      catalog.connections,
    )).toBe(false);
  });

  it("requires artist identity and the direct connection at stop zero", () => {
    const catalog = syntheticCatalog();
    const artistRoute = catalog.expeditions[0];

    expect(validateRecommendedRoute({ ...artistRoute, artistId: "blackpink" }, catalog.places, "bts", catalog.connections)).toBe(false);
    expect(validateRecommendedRoute({ ...artistRoute, stopIds: [...artistRoute.stopIds].reverse() }, catalog.places, "bts", catalog.connections)).toBe(false);
  });

  it("accepts regional support for every artist only when identity and stop relationships are neutral", () => {
    const catalog = syntheticCatalog({ firstStop: nearbyPlace() });
    const support = catalog.expeditions[1];

    expect(validateRecommendedRoute(support, catalog.places, "bts", catalog.connections)).toBe(true);
    expect(validateRecommendedRoute(support, catalog.places, "blackpink", catalog.connections)).toBe(true);
    expect(validateRecommendedRoute({ ...support, artistId: "bts" }, catalog.places, "bts", catalog.connections)).toBe(false);
    expect(validateRecommendedRoute({ ...support, connectionId: "bts-busan-connection" }, catalog.places, "bts", catalog.connections)).toBe(false);
  });

  it("breaks equal-distance connected-territory ties by territory catalog order", () => {
    const firstA = artistPlace({ id: "a-direct", territoryId: "candidate-a", artistConnectionId: "bts-candidate-a-connection" });
    const firstB = artistPlace({ id: "b-direct", territoryId: "candidate-b", artistConnectionId: "bts-candidate-b-connection" });
    const nearbyA = nearbyPlace({ id: "a-nearby", territoryId: "candidate-a" });
    const nearbyB = nearbyPlace({ id: "b-nearby", territoryId: "candidate-b" });
    const catalog = {
      territories: [
        territory("selected", 0, 0),
        territory("candidate-b", 0, -1),
        territory("candidate-a", 0, 1),
      ],
      connections: [connection("candidate-a"), connection("candidate-b")],
      places: [firstA, nearbyA, firstB, nearbyB],
      expeditions: [
        route("candidate-a-route", "candidate-a", [firstA.id, nearbyA.id]),
        route("candidate-b-route", "candidate-b", [firstB.id, nearbyB.id]),
      ],
    };

    expect(selectRecommendedExpedition("bts", "selected", catalog)?.territoryId).toBe("candidate-b");
  });

  it("uses the national anchor for a malformed selection and skips malformed candidate geometry", () => {
    const catalog = syntheticCatalog();
    const malformed = {
      ...catalog,
      territories: catalog.territories.map((item) => item.id === "gwangju"
        ? { ...item, centroid: { latitude: Number.NaN, longitude: Number.NaN } }
        : item.id === "busan"
          ? { ...item, centroid: { latitude: Number.POSITIVE_INFINITY, longitude: 129.08 } }
          : item),
    };

    expect(selectRecommendedExpedition("bts", "gwangju", malformed)?.expedition.id).toBe("gwangju-support");
  });
});
