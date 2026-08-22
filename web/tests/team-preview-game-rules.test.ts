import { describe, expect, it } from "vitest";
import { calculateMissionAward, rankFandoms, stageForPoints } from "@/features/team-preview/game-rules";

describe("preview game rules", () => {
  it("rewards longer local impact and the population-decline multiplier", () => {
    const award = calculateMissionAward({
      visitBase: 100,
      dwellMinutes: 45,
      localSpendVerified: true,
      accommodationVerified: false,
      balanceMultiplier: 1.8,
      fandomSizeMultiplier: 1,
      repeatCount: 0,
      contributedToday: 0,
    });

    expect(award).toEqual({
      visit: 100,
      dwell: 60,
      localSpend: 100,
      accommodation: 0,
      subtotal: 260,
      multiplier: 1.8,
      validPoints: 468,
      cappedPoints: 468,
    });
  });

  it("applies repeat efficiencies of one half on a second visit and zero on a fourth", () => {
    expect(calculateMissionAward({
      visitBase: 100, dwellMinutes: 0, localSpendVerified: false, accommodationVerified: false,
      balanceMultiplier: 1, fandomSizeMultiplier: 1, repeatCount: 1, contributedToday: 0,
    }).validPoints).toBe(50);
    expect(calculateMissionAward({
      visitBase: 100, dwellMinutes: 0, localSpendVerified: false, accommodationVerified: false,
      balanceMultiplier: 1, fandomSizeMultiplier: 1, repeatCount: 3, contributedToday: 0,
    }).validPoints).toBe(0);
  });

  it("applies fandom-size multipliers before enforcing the 1200-point daily cap", () => {
    const award = calculateMissionAward({
      visitBase: 600, dwellMinutes: 40, localSpendVerified: true, accommodationVerified: true,
      balanceMultiplier: 1, fandomSizeMultiplier: 1.5, repeatCount: 0, contributedToday: 1150,
    });

    expect(award.validPoints).toBe(1590);
    expect(award.cappedPoints).toBe(50);
  });

  it("uses exact seed, tree, and landmark thresholds", () => {
    expect(stageForPoints(999)).toBe("seed");
    expect(stageForPoints(1000)).toBe("tree");
    expect(stageForPoints(2999)).toBe("tree");
    expect(stageForPoints(3000)).toBe("landmark");
  });

  it("ranks by strongholds before points", () => {
    const ranked = rankFandoms([
      { artistId: "bts", fandomName: "ARMY", strongholds: 3, validPoints: 9000, trend: "same" },
      { artistId: "blackpink", fandomName: "BLINK", strongholds: 4, validPoints: 6000, trend: "same" },
    ]);

    expect(ranked.map((item) => item.fandomName)).toEqual(["BLINK", "ARMY"]);
    expect(ranked.map((item) => item.rank)).toEqual([1, 2]);
  });
});
