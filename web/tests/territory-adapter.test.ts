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

  it("keeps a territory a member-named fandom holds, under an id derived from that fandom", () => {
    // A fandom a member named has no catalogued artist behind it by design.
    // Dropping it used to take the whole territory off the board the moment
    // one took ground, so the artist id is derived from the fandom the server
    // reported rather than invented or discarded.
    const [territory] = mapTerritorySnapshots([{
      id: "busan",
      nameKo: "부산",
      nameEn: "Busan",
      latitude: 35.1796,
      longitude: 129.0756,
      populationDecline: false,
      balanceMultiplier: 1,
      balanceReasonKo: "",
      balanceReasonEn: "",
      ownerFandomId: "c0ffee00-0000-4000-8000-000000000001",
      strongholdStage: "seed",
      standings: [
        { fandomId: "c0ffee00-0000-4000-8000-000000000001", fandomName: "MEMBER-NAMED", artistName: "직접 추가", validPoints: 40 },
        { fandomId: "fandom-army", fandomName: "ARMY", artistName: "방탄소년단", validPoints: 10 },
      ],
    }]);

    expect(territory.ownerArtistId).toBe("fandom:c0ffee00-0000-4000-8000-000000000001");
    expect(territory.standings).toEqual([
      { artistId: "fandom:c0ffee00-0000-4000-8000-000000000001", fandomName: "MEMBER-NAMED", validPoints: 40 },
      { artistId: "bts", fandomName: "ARMY", validPoints: 10 },
    ]);
  });
});
