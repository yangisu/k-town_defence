import {
  DEFAULT_TUTORIAL_STATE,
  TUTORIAL_CONTENT_VERSION,
  TUTORIAL_STORAGE_KEY,
  type StoredTutorialState,
  type TutorialState,
} from "@/features/tutorial/tutorial-config";

function isTutorialState(value: unknown): value is StoredTutorialState {
  if (!value || typeof value !== "object") return false;

  const state = value as Partial<StoredTutorialState>;
  return (
    state.contentVersion === TUTORIAL_CONTENT_VERSION &&
    (state.status === "idle" || state.status === "running" || state.status === "completed" || state.status === "skipped") &&
    (state.step === "choose-fandom" || state.step === "open-territory" || state.step === "start-expedition" || state.step === "open-checkin") &&
    typeof state.isReplay === "boolean"
  );
}

export function loadTutorialState(storage: Pick<Storage, "getItem">): TutorialState {
  try {
    const raw = storage.getItem(TUTORIAL_STORAGE_KEY);
    if (!raw) return DEFAULT_TUTORIAL_STATE;

    const parsed: unknown = JSON.parse(raw);
    if (!isTutorialState(parsed)) return DEFAULT_TUTORIAL_STATE;

    return {
      status: parsed.status,
      step: parsed.step,
      isReplay: parsed.isReplay,
    };
  } catch {
    return DEFAULT_TUTORIAL_STATE;
  }
}

export function saveTutorialState(storage: Pick<Storage, "setItem">, state: TutorialState) {
  const storedState: StoredTutorialState = {
    ...state,
    contentVersion: TUTORIAL_CONTENT_VERSION,
  };

  try {
    storage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(storedState));
  } catch {
    // Tutorial progress remains available in memory when storage is blocked.
  }
}

export function clearTutorialState(storage: Pick<Storage, "removeItem">) {
  try {
    storage.removeItem(TUTORIAL_STORAGE_KEY);
  } catch {
    // Clearing progress is best effort when storage is unavailable.
  }
}