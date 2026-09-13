import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOAuthStateCookieValue,
  createSessionCookieValue,
  readOAuthStateCookiePayload,
  readSessionPayload,
} from "@/lib/server/session";

const ORIGINAL_SECRET = process.env.KTOWN_SESSION_SECRET;

describe("session cookie signing", () => {
  beforeEach(() => {
    process.env.KTOWN_SESSION_SECRET = "test-secret-at-least-16-chars";
  });
  afterEach(() => {
    process.env.KTOWN_SESSION_SECRET = ORIGINAL_SECRET;
  });

  it("round-trips a session payload", () => {
    const token = createSessionCookieValue("kakao:1234", "user-1");
    const payload = readSessionPayload(token);

    expect(payload?.platformSubject).toBe("kakao:1234");
    expect(payload?.userId).toBe("user-1");
  });

  it("rejects a tampered payload", () => {
    const token = createSessionCookieValue("kakao:1234", "user-1");
    const [encoded] = token.split(".");
    const tampered = `${encoded}.0000000000000000000000000000000000000000000000000000000000000000`;

    expect(readSessionPayload(tampered)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = createSessionCookieValue("kakao:1234", "user-1");
    process.env.KTOWN_SESSION_SECRET = "a-completely-different-secret-value";

    expect(readSessionPayload(token)).toBeNull();
  });

  it("returns null instead of throwing for garbage input", () => {
    expect(readSessionPayload(undefined)).toBeNull();
    expect(readSessionPayload(null)).toBeNull();
    expect(readSessionPayload("not-a-token")).toBeNull();
    expect(readSessionPayload("")).toBeNull();
  });

  it("returns null when the session secret is not configured", () => {
    delete process.env.KTOWN_SESSION_SECRET;
    expect(() => readSessionPayload("anything.anything")).not.toThrow();
    expect(readSessionPayload("anything.anything")).toBeNull();
  });

  it("round-trips an OAuth state payload and rejects a mismatched one", () => {
    const token = createOAuthStateCookieValue("state-abc", "/journey");
    const payload = readOAuthStateCookiePayload(token);

    expect(payload).toEqual({ state: "state-abc", returnTo: "/journey" });
    expect(readOAuthStateCookiePayload(undefined)).toBeNull();
  });
});
