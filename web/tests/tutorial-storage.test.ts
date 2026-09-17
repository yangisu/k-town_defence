import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TUTORIAL_STATE,
  TUTORIAL_CONTENT_VERSION,
  TUTORIAL_STORAGE_KEY,
} from "@/features/tutorial/tutorial-config";
import {
  clearTutorialState,
  loadTutorialState,
  saveTutorialState,
} from "@/features/tutorial/tutorial-storage";

describe("tutorial storage", () => {
  it("starts at the first step when no state exists", () => {
    expect(loadTutorialState({ getItem: () => null })).toEqual(DEFAULT_TUTORIAL_STATE);
  });

  it("saves and restores state with the current content version", () => {
    let saved = "";
    const state = { status: "running" as const, step: "open-territory" as const, isReplay: false };
    const storage = {
      getItem: () => saved,
      setItem: vi.fn((_key: string, value: string) => { saved = value; }),
    };

    saveTutorialState(storage, state);

    expect(storage.setItem).toHaveBeenCalledWith(
      TUTORIAL_STORAGE_KEY,
      JSON.stringify({ ...state, contentVersion: TUTORIAL_CONTENT_VERSION }),
    );
    expect(loadTutorialState(storage)).toEqual(state);
  });

  it("discards malformed or outdated state", () => {
    const outdated = JSON.stringify({
      status: "completed",
      step: "open-checkin",
      isReplay: false,
      contentVersion: TUTORIAL_CONTENT_VERSION - 1,
    });

    expect(loadTutorialState({ getItem: () => outdated })).toEqual(DEFAULT_TUTORIAL_STATE);
    expect(loadTutorialState({ getItem: () => "not-json" })).toEqual(DEFAULT_TUTORIAL_STATE);
  });

  it("does not throw when storage is unavailable", () => {
    expect(() => saveTutorialState({ setItem: () => { throw new Error("blocked"); } }, DEFAULT_TUTORIAL_STATE)).not.toThrow();
    expect(() => loadTutorialState({ getItem: () => { throw new Error("blocked"); } })).not.toThrow();
    expect(() => clearTutorialState({ removeItem: () => { throw new Error("blocked"); } })).not.toThrow();
  });
});