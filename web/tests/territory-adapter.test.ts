import { describe, expect, it } from "vitest";
import { mapTerritorySnapshots } from "@/lib/adapters/territory";

describe("territory DTO adapter", () => {
  it("maps backend fandom ownership into the unchanged preview view model", () => {
    const [territory] = mapTerritorySnapshots([{
      id: "busan",
      nameKo: "부산",
      nameEn: "Busan",
      latitude: 35.1796,
      longitude: 129.0756,
      populationDecline: false,
      balanceMultiplier: 1,
      balanceReasonKo: "기본 지역균형 배율",
      balanceReasonEn: "Standard regional-balance multiplier",
      ownerFandomId: "fandom-army",
      strongholdStage: "tree",
      standings: [
        { fandomId: "fandom-army", fandomName: "ARMY", artistName: "방탄소년단", validPoints: 1200 },
        { fandomId: "fandom-blink", fandomName: "BLINK", artistName: "BLACKPINK", validPoints: 900 },
      ],
    }]);

    expect(territory.ownerArtistId).toBe("bts");
    expect(territory.strongholdStage).toBe("tree");
    expect(territory.standings).toEqual([
      { artistId: "bts", fandomName: "ARMY", validPoints: 1200 },
      { artistId: "blackpink", fandomName: "BLINK", validPoints: 900 },
    ]);
  });

  it("drops unknown fandom contracts instead of inventing UI ownership", () => {
    expect(mapTerritorySnapshots([{
      id: "unknown",
      nameKo: "미지",
      nameEn: "Unknown",
      latitude: 0,
      longitude: 0,
      populationDecline: false,
      balanceMultiplier: 1,
      balanceReasonKo: "",
      balanceReasonEn: "",
      ownerFandomId: "unknown-fandom",
      strongholdStage: "seed",
      standings: [{ fandomId: "unknown-fandom", fandomName: "UNKNOWN", artistName: null, validPoints: 0 }],
    }])).toEqual([]);
  });
});
