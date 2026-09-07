"use client";

import { createContext, useContext } from "react";

/**
 * Lets a screen rendered inside the demo entry gate return the visitor to the
 * login screen. It stays null outside the gate so the same screens keep working
 * in integrated mode and in isolated tests.
 */
const DemoSignOutContext = createContext<(() => void) | null>(null);

export const DemoSignOutProvider = DemoSignOutContext.Provider;

export function useDemoSignOut() {
  return useContext(DemoSignOutContext);
}
