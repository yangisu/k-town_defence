import { expect, it } from "vitest";
import { summarizeTerritories } from "@/features/team-preview/territory-summary";
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
    recommendation: { kind: "capture", territoryId: "target" },
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
    recommendation: { kind: "capture", territoryId: "connected" },
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
    recommendation: { kind: "capture", territoryId: "connected" },
  });
});
