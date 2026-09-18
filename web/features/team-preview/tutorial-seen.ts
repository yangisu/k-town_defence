export const TUTORIAL_SEEN_KEY = "ktown-tutorial-v1";
const SEEN_VALUE = "seen";

export type TutorialStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * The guide is a first-run greeting, so a visitor who already dismissed it in
 * this tab should not meet it again while picking another artist. Storage can
 * throw in a private window, and a blocked read simply shows the guide again.
 */
export function hasSeenTutorial(storage: Pick<Storage, "getItem">) {
  try {
    return storage.getItem(TUTORIAL_SEEN_KEY) === SEEN_VALUE;
  } catch {
    return false;
  }
}

export function markTutorialSeen(storage: Pick<Storage, "setItem">) {
  try {
    storage.setItem(TUTORIAL_SEEN_KEY, SEEN_VALUE);
  } catch {
    // The in-memory state still closes the guide for this visit.
  }
}
