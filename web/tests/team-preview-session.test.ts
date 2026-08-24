import { describe, expect, it } from "vitest";
import {
  DEMO_SESSION_KEY,
  DEMO_SESSION_VERSION,
  MAX_DEMO_SESSION_CHARS,
  createInitialDemoSession,
  demoSessionReducer,
  loadDemoSession,
  saveDemoSession,
  selectProfileTerritory,
} from "@/features/team-preview/demo-session";
import type { MissionAward } from "@/features/team-preview/game-rules";
import { calculateMissionAward } from "@/features/team-preview/game-rules";
import { previewContent } from "@/features/team-preview/content";

const award = (points: number): MissionAward => ({
  visit: points,
  dwell: 0,
  localSpend: 0,
  accommodation: 0,
  subtotal: points,
  multiplier: 1,
  validPoints: points,
  cappedPoints: points,
});

function storageWith(raw: string | null) {
  let value = raw;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; },
    saved: () => value,
  };
}

function readySession(artistId: "bts" | "blackpink" = "bts", territoryId = "busan") {
  let state = demoSessionReducer(createInitialDemoSession(), { type: "selectArtist", artistId });
  state = demoSessionReducer(state, { type: "selectTerritory", territoryId });
  const expedition = previewContent.expeditions.find((candidate) => (
    candidate.territoryId === territoryId && (candidate.artistId === artistId || candidate.artistId === null)
  ))!;
  return demoSessionReducer(state, { type: "openExpedition", expeditionId: expedition.id });
}

function approve(state: ReturnType<typeof createInitialDemoSession>, placeId: string, points: number) {
  return demoSessionReducer(state, {
    type: "completeCheckIn",
    expeditionId: state.selectedExpeditionId!,
    placeId,
    award: award(points),
  });
}

describe("demo preview session", () => {
  it("changes profile without clearing approved progress and chooses the strongest owned territory", () => {
    const initial = createInitialDemoSession();
    const state = {
      ...initial,
      selectedExpeditionId: "busan-public-expedition",
      completedExpeditionIds: ["busan-public-expedition"],
      approvedCheckIns: [{
        expeditionId: "busan-public-expedition",
        placeId: "busan-1",
        artistId: "blackpink" as const,
        territoryId: "busan",
        awardedPoints: 80,
        strongholdStage: "tree" as const,
      }],
      territories: initial.territories.map((territory) => {
        if (territory.id !== "busan" && territory.id !== "daegu") return territory;
        const btsPoints = territory.id === "daegu" ? 1_500 : 1_000;
        return {
          ...territory,
          standings: territory.standings.map((standing) => standing.artistId === "bts"
            ? { ...standing, validPoints: btsPoints }
            : standing),
        };
      }),
    };

    const changed = demoSessionReducer(state, { type: "changeProfile", artistId: "bts" });

    expect(changed).toMatchObject({
      artistConfirmed: true,
      selectedArtistId: "bts",
      selectedTerritoryId: "daegu",
      selectedExpeditionId: null,
      activeTab: "explore",
    });
    expect(changed.approvedCheckIns).toEqual(state.approvedCheckIns);
    expect(changed.completedExpeditionIds).toEqual(state.completedExpeditionIds);
  });

  it("treats reconfirming the current profile as a no-op", () => {
    const state = readySession("bts", "busan");

    expect(demoSessionReducer(state, { type: "changeProfile", artistId: "bts" })).toBe(state);
  });

  it("falls back to the first catalog connection when the new fandom owns no territory", () => {
    const initial = createInitialDemoSession();
    const withoutBlackpinkOwnership = {
      ...initial,
      territories: initial.territories.map((territory) => territory.ownerArtistId === "blackpink"
        ? { ...territory, ownerArtistId: "bts" as const }
        : territory),
    };

    const changed = demoSessionReducer(withoutBlackpinkOwnership, { type: "changeProfile", artistId: "blackpink" });

    expect(changed.selectedTerritoryId).toBe("gunpo");
  });

  it("returns the first available representative territory after stronger choices are unavailable", () => {
    const initial = createInitialDemoSession();
    const representativeOnly = initial.territories.filter((territory) => territory.id === "seongnam")
      .map((territory) => ({ ...territory, ownerArtistId: "bts" as const }));

    expect(selectProfileTerritory("blackpink", representativeOnly)?.id).toBe("seongnam");
    expect(selectProfileTerritory("blackpink", [])).toBeNull();
  });

  it("changes the selected artist, territory, and locale through the single reducer", () => {
    const selected = demoSessionReducer(createInitialDemoSession(), { type: "selectArtist", artistId: "blackpink" });
    const territory = demoSessionReducer(selected, { type: "selectTerritory", territoryId: "gunpo" });
    const localized = demoSessionReducer(territory, { type: "setLocale", locale: "ko" });

    expect(localized.selectedArtistId).toBe("blackpink");
    expect(localized.artistConfirmed).toBe(true);
    expect(localized.selectedTerritoryId).toBe("gunpo");
    expect(localized.locale).toBe("ko");
  });

  it("completes a mission, counts every owned territory as a stronghold, and records the mission", () => {
    const state = approve(readySession(), "busan-1", 80);
    const busan = state.territories.find((territory) => territory.id === "busan")!;
    const army = state.fandoms.find((fandom) => fandom.artistId === "bts")!;

    expect(busan.standings.find((standing) => standing.artistId === "bts")!.validPoints).toBe(1000);
    expect(busan.strongholdStage).toBe("tree");
    expect(army.strongholds).toBe(3);
    expect(state.completedExpeditionIds).toEqual([]);
    expect(state.approvedCheckIns[0]).toMatchObject({ expeditionId: "bts-busan-expedition", placeId: "busan-1" });
    expect(state.contributedToday).toBe(80);
  });

  it("uses all owned territories as the primary stronghold ranking metric, including seed stages", () => {
    const state = createInitialDemoSession();
    const army = state.fandoms.find((fandom) => fandom.artistId === "bts")!;
    const seedOwnedByArmy = state.territories.filter(
      (territory) => territory.ownerArtistId === "bts" && territory.strongholdStage === "seed",
    );

    expect(seedOwnedByArmy).toHaveLength(3);
    expect(army.strongholds).toBe(3);
  });

  it("transfers territory ownership only when the challenger becomes the strict leader", () => {
    const before = readySession();
    const tied = approve(before, "busan-1", 80);
    const tiedBusan = tied.territories.find((territory) => territory.id === "busan")!;
    expect(tiedBusan.ownerArtistId).toBe("bts");

    let challenger = demoSessionReducer(tied, { type: "selectArtist", artistId: "blackpink" });
    challenger = demoSessionReducer(challenger, { type: "selectTerritory", territoryId: "busan" });
    challenger = demoSessionReducer(challenger, { type: "openExpedition", expeditionId: "busan-public-expedition" });
    const transferred = approve(challenger, "busan-2", 161);
    expect(transferred.territories.find((territory) => territory.id === "busan")!.ownerArtistId).toBe("blackpink");
  });

  it("resets every mutable preview-game selection and impact", () => {
    const impacted = approve(readySession(), "busan-1", 80);
    const reset = demoSessionReducer(impacted, { type: "reset" });

    expect(reset).toEqual({
      ...createInitialDemoSession(),
    });
  });

  it("limits a stale award to the remaining daily allowance everywhere it is applied", () => {
    const nearlyCapped = { ...readySession(), contributedToday: 1190 };
    const state = approve(nearlyCapped, "busan-1", 100);
    const busan = state.territories.find((territory) => territory.id === "busan")!;

    expect(busan.standings.find((standing) => standing.artistId === "bts")!.validPoints).toBe(930);
    expect(state.contributedToday).toBe(1200);
    expect(state.missionVisitCounts["busan-1"]).toBe(1);
  });

  it("falls back to a new session for corrupt or version-mismatched persistence", () => {
    const initial = createInitialDemoSession();
    const versionTwoPayload = {
      ...initial,
      version: 2,
      artistConfirmed: true,
      selectedArtistId: "bts",
      selectedTerritoryId: "busan",
      contributedToday: 999,
    };

    expect(loadDemoSession(storageWith(null))).toEqual(initial);
    expect(loadDemoSession(storageWith(""))).toEqual(initial);
    expect(loadDemoSession(storageWith("not json"))).toEqual(initial);
    expect(loadDemoSession(storageWith(JSON.stringify(versionTwoPayload)))).toEqual(initial);
    expect(loadDemoSession(storageWith(JSON.stringify({ ...initial, version: DEMO_SESSION_VERSION + 1 })))).toEqual(initial);
  });

  it("rejects primitive, thrown, and oversized persisted payloads before trusting them", () => {
    const initial = createInitialDemoSession();
    const malformed = [null, [], "profile", 3, true];

    for (const value of malformed) {
      expect(loadDemoSession(storageWith(JSON.stringify(value)))).toEqual(initial);
    }
    expect(loadDemoSession({ getItem: () => { throw new Error("storage unavailable"); } })).toEqual(initial);
    expect(loadDemoSession(storageWith(`{"padding":"${"x".repeat(MAX_DEMO_SESSION_CHARS)}"}`))).toEqual(initial);
    const deeplyNested = `${'{"nested":'.repeat(1_000)}"${"x".repeat(MAX_DEMO_SESSION_CHARS)}"${"}".repeat(1_000)}`;
    expect(loadDemoSession(storageWith(deeplyNested))).toEqual(initial);
  });

  it("rejects structurally invalid but correctly versioned persisted sessions", () => {
    const initial = createInitialDemoSession();
    const malformed = [
      { version: DEMO_SESSION_VERSION },
      { ...initial, locale: "fr" },
      { ...initial, artistConfirmed: "yes" },
      { ...initial, selectedArtistId: "unknown-artist" },
      { ...initial, selectedTerritoryId: "unknown-territory" },
      { ...initial, territories: [{}] },
      { ...initial, completedExpeditionIds: {} },
      { ...initial, approvedCheckIns: {} },
      { ...initial, missionVisitCounts: [] },
    ];

    for (const saved of malformed) {
      expect(loadDemoSession(storageWith(JSON.stringify(saved)))).toEqual(initial);
    }
  });

  it("rejects semantically corrupt ownership, stages, standings, selections, and derived fandom totals", () => {
    const initial = createInitialDemoSession();
    const busanIndex = initial.territories.findIndex((territory) => territory.id === "busan");
    const busan = initial.territories[busanIndex];
    const malformed = [
      {
        ...initial,
        territories: initial.territories.map((territory, index) => index === busanIndex
          ? { ...territory, ownerArtistId: "ive" as const }
          : territory),
      },
      {
        ...initial,
        territories: initial.territories.map((territory, index) => index === busanIndex
          ? { ...territory, strongholdStage: "landmark" as const }
          : territory),
      },
      {
        ...initial,
        territories: initial.territories.map((territory, index) => index === busanIndex
          ? { ...territory, standings: [...territory.standings, { ...territory.standings[0] }] }
          : territory),
      },
      {
        ...initial,
        fandoms: initial.fandoms.map((fandom) => fandom.artistId === "bts"
          ? { ...fandom, validPoints: fandom.validPoints + 1 }
          : fandom),
      },
      { ...initial, artistConfirmed: false, selectedArtistId: "bts" as const, selectedTerritoryId: "busan" },
    ];

    expect(busan.standings.some((standing) => standing.artistId === "ive")).toBe(false);
    for (const saved of malformed) {
      const loaded = loadDemoSession(storageWith(JSON.stringify(saved)));
      expect(loaded).toEqual(initial);
      expect(() => demoSessionReducer(loaded, {
        type: "completeCheckIn",
        expeditionId: "bts-busan-expedition",
        placeId: "busan-1",
        award: award(10),
      })).not.toThrow();
    }
  });

  it("keeps Yeongwol's 1.8x award and territory credit in Yeongwol", () => {
    const route = previewContent.expeditions.find((expedition) => expedition.territoryId === "yeongwol");
    const stop = previewContent.places.find((place) => place.id === route?.stopIds[0]);
    expect(route).toBeDefined();
    expect(stop?.territoryId).toBe("yeongwol");

    const missionAward = calculateMissionAward({
      visitBase: stop?.visitBase ?? 100,
      dwellMinutes: 45,
      localSpendVerified: true,
      accommodationVerified: false,
      balanceMultiplier: 1.8,
      fandomSizeMultiplier: 1,
      repeatCount: 0,
      contributedToday: 0,
    });
    expect(missionAward.cappedPoints).toBe(468);

    const before = readySession("bts", "yeongwol");
    const beforeBusan = before.territories.find((territory) => territory.id === "busan")!;
    const beforeYeongwol = before.territories.find((territory) => territory.id === "yeongwol")!;
    const after = demoSessionReducer(before, {
      type: "completeCheckIn",
      expeditionId: before.selectedExpeditionId!,
      placeId: stop?.id ?? "missing-yeongwol-stop",
      award: missionAward,
    });
    expect(after.territories.find((territory) => territory.id === "yeongwol")?.standings)
      .not.toEqual(beforeYeongwol.standings);
    expect(after.territories.find((territory) => territory.id === "busan")?.standings)
      .toEqual(beforeBusan.standings);
  });

  it("saves the versioned session under its dedicated key", () => {
    const storage = storageWith(null);
    const state = createInitialDemoSession();
    saveDemoSession(storage, state);

    expect(JSON.parse(storage.saved()!)).toEqual(state);
    expect(DEMO_SESSION_KEY).toBe("ktown-team-preview-v3");
  });

  it("hydrates a valid version-3 profile and progress unchanged", () => {
    const saved = approve(readySession(), "busan-1", 80);

    expect(loadDemoSession(storageWith(JSON.stringify(saved)))).toEqual(saved);
  });
});
