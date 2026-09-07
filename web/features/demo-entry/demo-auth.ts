export const DEMO_LOGIN_SESSION_KEY = "ktown-demo-login-v1";
const COMPLETED_VALUE = "authenticated";

export type DemoLoginStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type DemoLoginListener = () => void;

const demoLoginListeners = new Set<DemoLoginListener>();

function notifyDemoLoginChange() {
  for (const listener of [...demoLoginListeners]) listener();
}

/**
 * Lets the entry gate re-read the login marker after this tab saves or clears
 * it. Storage events only cover other tabs, so same-tab sign-in and sign-out
 * would otherwise leave the gate showing a stale screen.
 */
export function subscribeToDemoLogin(listener: DemoLoginListener) {
  demoLoginListeners.add(listener);
  return () => {
    demoLoginListeners.delete(listener);
  };
}

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
  notifyDemoLoginChange();
}

export function clearDemoLogin(storage: Pick<Storage, "removeItem">) {
  try {
    storage.removeItem(DEMO_LOGIN_SESSION_KEY);
  } catch {
    // The in-memory gate state still returns the visitor to the login screen.
  }
  notifyDemoLoginChange();
}
