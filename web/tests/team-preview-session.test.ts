import { describe, expect, it } from "vitest";
import {
  DEMO_SESSION_KEY,
  DEMO_SESSION_VERSION,
  createInitialDemoSession,
  demoSessionReducer,
  loadDemoSession,
  saveDemoSession,
} from "@/features/team-preview/demo-session";
import type { MissionAward } from "@/features/team-preview/game-rules";

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

describe("demo preview session", () => {
  it("changes the selected artist, territory, and locale through the single reducer", () => {
    const selected = demoSessionReducer(createInitialDemoSession(), { type: "selectArtist", artistId: "blackpink" });
    const territory = demoSessionReducer(selected, { type: "selectTerritory", territoryId: "gunpo" });
    const localized = demoSessionReducer(territory, { type: "setLocale", locale: "ko" });

    expect(localized.selectedArtistId).toBe("blackpink");
    expect(localized.selectedTerritoryId).toBe("gunpo");
    expect(localized.locale).toBe("ko");
  });

  it("completes a mission, grows a stronghold at the exact threshold, and records the mission", () => {
    const state = demoSessionReducer(createInitialDemoSession(), { type: "completeMission", missionId: "busan-1", award: award(80) });
    const busan = state.territories.find((territory) => territory.id === "busan")!;
    const army = state.fandoms.find((fandom) => fandom.artistId === "bts")!;

    expect(busan.standings.find((standing) => standing.artistId === "bts")!.validPoints).toBe(1000);
    expect(busan.strongholdStage).toBe("tree");
    expect(army.strongholds).toBe(1);
    expect(state.completedMissionIds).toContain("busan-1");
    expect(state.contributedToday).toBe(80);
  });

  it("transfers territory ownership only when the challenger becomes the strict leader", () => {
    const before = createInitialDemoSession();
    const tied = demoSessionReducer(before, { type: "completeMission", missionId: "busan-1", award: award(80) });
    const tiedBusan = tied.territories.find((territory) => territory.id === "busan")!;
    expect(tiedBusan.ownerArtistId).toBe("bts");

    const challenger = demoSessionReducer(tied, { type: "selectArtist", artistId: "blackpink" });
    const transferred = demoSessionReducer(challenger, { type: "completeMission", missionId: "busan-2", award: award(161) });
    expect(transferred.territories.find((territory) => territory.id === "busan")!.ownerArtistId).toBe("blackpink");
  });

  it("resets every mutable preview-game selection and impact", () => {
    const impacted = demoSessionReducer(createInitialDemoSession(), { type: "completeMission", missionId: "busan-1", award: award(80) });
    const reset = demoSessionReducer(impacted, { type: "reset" });

    expect(reset).toEqual(createInitialDemoSession());
  });

  it("falls back to a new session for corrupt or version-mismatched persistence", () => {
    expect(loadDemoSession(storageWith("not json"))).toEqual(createInitialDemoSession());
    expect(loadDemoSession(storageWith(JSON.stringify({ ...createInitialDemoSession(), version: DEMO_SESSION_VERSION + 1 })))).toEqual(createInitialDemoSession());
  });

  it("saves the versioned session under its dedicated key", () => {
    const storage = storageWith(null);
    const state = createInitialDemoSession();
    saveDemoSession(storage, state);

    expect(JSON.parse(storage.saved()!)).toEqual(state);
    expect(DEMO_SESSION_KEY).toBe("ktown-team-preview-v1");
  });
});
