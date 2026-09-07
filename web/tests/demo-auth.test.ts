import { describe, expect, it, vi } from "vitest";
import {
  DEMO_LOGIN_SESSION_KEY,
  clearDemoLogin,
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

  it("clears only the login marker when the visitor returns to the login screen", () => {
    const values = new Map<string, string>([[DEMO_LOGIN_SESSION_KEY, "authenticated"], ["other", "keep"]]);
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      removeItem: vi.fn((key: string) => { values.delete(key); }),
    };

    clearDemoLogin(storage);

    expect(storage.removeItem).toHaveBeenCalledWith(DEMO_LOGIN_SESSION_KEY);
    expect(hasDemoLogin(storage)).toBe(false);
    expect(values.get("other")).toBe("keep");
  });

  it("falls back safely when storage access throws", () => {
    expect(hasDemoLogin({ getItem: () => { throw new Error("blocked"); } })).toBe(false);
    expect(() => saveDemoLogin({ setItem: () => { throw new Error("blocked"); } })).not.toThrow();
    expect(() => clearDemoLogin({ removeItem: () => { throw new Error("blocked"); } })).not.toThrow();
  });
});
