export const DEMO_LOGIN_SESSION_KEY = "ktown-demo-login-v1";
const COMPLETED_VALUE = "authenticated";

export type DemoLoginStorage = Pick<Storage, "getItem" | "setItem">;

export function isValidDemoEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function hasDemoLogin(storage: Pick<Storage, "getItem">) {
  try {
    return storage.getItem(DEMO_LOGIN_SESSION_KEY) === COMPLETED_VALUE;
  } catch {
    return false;
  }
}

export function saveDemoLogin(storage: Pick<Storage, "setItem">) {
  try {
    storage.setItem(DEMO_LOGIN_SESSION_KEY, COMPLETED_VALUE);
  } catch {
    // The in-memory gate state still lets the current demo continue.
  }
}
