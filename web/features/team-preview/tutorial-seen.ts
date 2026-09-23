export const TUTORIAL_SEEN_KEY = "ktown-tutorial-v2";
const SEEN_VALUE = "seen";

export type TutorialStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * A signed-in reader keeps their own answer.
 *
 * The flag lives in this browser, so one key for everyone meant a reset — or
 * someone else's sign-out — handed a returning member the greeting again, and
 * a member who had never seen it could be robbed of it by whoever sat here
 * before. Keyed by account, each reader's answer is their own; the demo, which
 * has no account, keeps the plain key.
 */
export function tutorialSeenKey(accountId?: string | null) {
  return accountId ? `${TUTORIAL_SEEN_KEY}:${accountId}` : TUTORIAL_SEEN_KEY;
}

/**
 * The guide is a first-run greeting, so a visitor who already dismissed it in
 * this tab should not meet it again while picking another artist. Storage can
 * throw in a private window, and a blocked read simply shows the guide again.
 */
export function hasSeenTutorial(storage: Pick<Storage, "getItem">, accountId?: string | null) {
  try {
    return storage.getItem(tutorialSeenKey(accountId)) === SEEN_VALUE;
  } catch {
    return false;
  }
}

export function markTutorialSeen(storage: Pick<Storage, "setItem">, accountId?: string | null) {
  try {
    storage.setItem(tutorialSeenKey(accountId), SEEN_VALUE);
  } catch {
    // The in-memory state still closes the guide for this visit.
  }
}

/**
 * Hands the next visitor a genuine first run. The demo does this when it is
 * reset and when its gate is left; an account does not, because its answer is
 * its own and a reset is not a new reader.
 */
export function forgetTutorial(storage: Pick<Storage, "removeItem">, accountId?: string | null) {
  try {
    storage.removeItem(tutorialSeenKey(accountId));
  } catch {
    // A blocked write only means this browser keeps its old answer.
  }
}
