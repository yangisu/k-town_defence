import { expect, it } from "vitest";
import { orderContestedTerritories, summarizeTerritories } from "@/features/team-preview/territory-summary";
import type { ArtistConnection, PreviewTerritory } from "@/features/team-preview/types";

const territory = (
  id: string,
  ownerArtistId: PreviewTerritory["ownerArtistId"],
  latitude: number,
  longitude: number,
  selectedPoints: number,
  rivalPoints = 900,
): PreviewTerritory => ({
  id,
  name: { ko: id, en: id },
  centroid: { latitude, longitude },
  populationDecline: false,
  balanceMultiplier: 1,
  balanceReason: { ko: "", en: "" },
  sourceUrls: [],
  ownerArtistId,
  strongholdStage: "seed",
  standings: [
    { artistId: "bts", fandomName: "ARMY", validPoints: selectedPoints },
    { artistId: "blackpink", fandomName: "BLINK", validPoints: rivalPoints },
  ],
});

const connection = (territoryId: string): ArtistConnection => ({
  id: `bts-${territoryId}`,
  artistId: "bts",
  territoryId,
  memberName: { ko: "", en: "" },
  relationType: "hometown",
  evidenceClass: "team_data",
  evidenceNote: { ko: "", en: "" },
  story: { ko: "", en: "" },
  sourceUrls: [],
  sources: [],
});

it("summarizes ownership, the strongest owned territory, and the nearest contested action", () => {
  const territories = [
    territory("home", "bts", 35, 127, 920, 600),
    territory("stronghold", "bts", 35.2, 127, 980, 600),
    territory("target", "blackpink", 35.21, 127, 850),
    territory("far", "blackpink", 37, 129, 850),
  ];

  expect(summarizeTerritories(territories, "bts", [connection("stronghold"), connection("target")])).toEqual({
    ownedCount: 2,
    strongestOwnedTerritoryId: "stronghold",
    nearestContestedTerritoryId: "target",
    nearestContestedAnchorTerritoryId: "stronghold",
    nearestContestedDistanceKm: 1,
    recommendation: { kind: "capture", territoryId: "target", pointsRequired: 51, anchorTerritoryId: "stronghold", distanceKm: 1 },
  });
});

it("uses the first connected catalog territory as the zero-owned anchor without claiming ownership", () => {
  const territories = [
    territory("connected", "blackpink", 35, 127, 0, 80),
    territory("closest", "blackpink", 35.1, 127, 0, 80),
    territory("invalid", "blackpink", Number.NaN, 127, 0),
  ];

  expect(summarizeTerritories(territories, "bts", [connection("connected"), connection("closest")])).toEqual({
    ownedCount: 0,
    strongestOwnedTerritoryId: null,
    nearestContestedTerritoryId: "connected",
    nearestContestedAnchorTerritoryId: "connected",
    nearestContestedDistanceKm: 0,
    recommendation: { kind: "capture", territoryId: "connected", pointsRequired: 81, anchorTerritoryId: "connected", distanceKm: 0 },
  });
});

it("falls back from an invalid strongest-owned centroid to a finite connected anchor", () => {
  const territories = [
    territory("invalid-owned", "bts", Number.NaN, 127, 980, 600),
    territory("far", "blackpink", 38, 130, 850),
    territory("connected", "blackpink", 35, 127, 850),
  ];

  expect(summarizeTerritories(territories, "bts", [connection("connected")])).toEqual({
    ownedCount: 1,
    strongestOwnedTerritoryId: "invalid-owned",
    nearestContestedTerritoryId: "connected",
    nearestContestedAnchorTerritoryId: "connected",
    nearestContestedDistanceKm: 0,
    recommendation: { kind: "capture", territoryId: "connected", pointsRequired: 51, anchorTerritoryId: "connected", distanceKm: 0 },
  });
});

it("measures the nearest contested territory from every owned stronghold instead of only the strongest one", () => {
  const territories = [
    territory("near-home", "bts", 35, 127, 940, 600),
    territory("far-strongest", "bts", 37, 129, 1400, 600),
    territory("home-target", "blackpink", 35.01, 127, 880, 900),
    territory("strongest-target", "blackpink", 37.05, 129, 880, 900),
  ];

  const summary = summarizeTerritories(territories, "bts", []);

  expect(summary.nearestContestedTerritoryId).toBe("home-target");
  expect(summary.nearestContestedAnchorTerritoryId).toBe("near-home");
  expect(summary.nearestContestedDistanceKm).toBe(1);
});

it("recommends urgent defense before easy capture and exposes the points needed for the action", () => {
  const territories = [
    territory("safe-home", "bts", 35, 127, 1200, 700),
    territory("urgent-defense", "bts", 36, 128, 920, 900),
    territory("easy-capture", "blackpink", 35.01, 127, 890, 900),
  ];

  expect(summarizeTerritories(territories, "bts", []).recommendation).toMatchObject({
    kind: "defend",
    territoryId: "urgent-defense",
    pointsRequired: 20,
  });
});

it("orders contested territories by defense urgency, capture gap, distance, and balance value", () => {
  const home = territory("home", "bts", 35, 127, 1400, 700);
  const defense100 = territory("defense-100", "bts", 37, 129, 1000, 900);
  const defense20 = territory("defense-20", "bts", 36, 128, 920, 900);
  const capture51 = territory("capture-51", "blackpink", 35.01, 127, 850, 900);
  const capture11 = territory("capture-11", "blackpink", 38, 130, 890, 900);

  expect(orderContestedTerritories(
    [capture51, defense100, capture11, defense20],
    "bts",
    [home, defense100, defense20],
  ).map((candidate) => candidate.territory.id)).toEqual([
    "defense-20",
    "defense-100",
    "capture-11",
    "capture-51",
  ]);
});
