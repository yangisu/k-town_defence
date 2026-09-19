export const BRAND_WELCOME_KEY = "ktown-brand-welcome-v1";

/**
 * The demo greets a visitor with the brand lockup between logging in and the
 * product. Signing in for real deserves the same beat, once per browser
 * session, so returning to a tab does not replay it.
 */
export function hasSeenBrandWelcome(storage: Pick<Storage, "getItem">) {
  try {
    return storage.getItem(BRAND_WELCOME_KEY) === "seen";
  } catch {
    return true;
  }
}

export function markBrandWelcomeSeen(storage: Pick<Storage, "setItem">) {
  try {
    storage.setItem(BRAND_WELCOME_KEY, "seen");
  } catch {
    // Without storage the greeting simply shows again next time.
  }
}
