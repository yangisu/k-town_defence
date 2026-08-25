import { describe, expect, it, vi } from "vitest";
import {
  DEMO_LOGIN_SESSION_KEY,
  hasDemoLogin,
  isValidDemoEmail,
  saveDemoLogin,
} from "@/features/demo-entry/demo-auth";

describe("demo authentication helpers", () => {
  it.each([
    ["fan@example.com", true],
    [" fan@example.com ", true],
    ["fan@example", false],
    ["fan example.com", false],
    ["", false],
  ])("validates %j as %s", (email, expected) => {
    expect(isValidDemoEmail(email)).toBe(expected);
  });

  it("persists and reads only the session completion marker", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    };

    expect(hasDemoLogin(storage)).toBe(false);
    saveDemoLogin(storage);
    expect(storage.setItem).toHaveBeenCalledWith(DEMO_LOGIN_SESSION_KEY, "authenticated");
    expect(hasDemoLogin(storage)).toBe(true);
  });

  it("falls back safely when storage access throws", () => {
    expect(hasDemoLogin({ getItem: () => { throw new Error("blocked"); } })).toBe(false);
    expect(() => saveDemoLogin({ setItem: () => { throw new Error("blocked"); } })).not.toThrow();
  });
});
