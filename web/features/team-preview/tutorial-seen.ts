export const TUTORIAL_SEEN_KEY = "ktown-tutorial-v2";
const SEEN_VALUE = "seen";

export type TutorialStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

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

/**
 * The flag belongs to the browser, not to the account, so whoever signs in
 * next would inherit a greeting someone else already dismissed. Signing out
 * and resetting the demo both hand the next visitor a genuine first run.
 */
export function forgetTutorial(storage: Pick<Storage, "removeItem">) {
  try {
    storage.removeItem(TUTORIAL_SEEN_KEY);
  } catch {
    // A blocked write only means this browser keeps its old answer.
  }
}
