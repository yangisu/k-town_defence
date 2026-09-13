import { describe, expect, it, vi } from "vitest";
import { proxyKtownRequest } from "@/lib/server/ktown-gateway";


describe("membership gateway contracts", () => {
  it("forwards only the approved membership reads", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ items: [] }));

    const fandoms = await proxyKtownRequest(
      new Request("http://site/api/ktown/api/v1/fandoms"),
      ["api", "v1", "fandoms"],
      { baseUrl: "http://backend", platformUserId: null, fetcher },
    );
    const membership = await proxyKtownRequest(
      new Request("http://site/api/ktown/api/v1/me/season-membership"),
      ["api", "v1", "me", "season-membership"],
      { baseUrl: "http://backend", platformUserId: "member-1", fetcher },
    );

    expect(fandoms.status).toBe(200);
    expect(membership.status).toBe(200);
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      "http://backend/api/v1/fandoms",
      "http://backend/api/v1/me/season-membership",
    ]);
  });

  it("forwards a bounded JSON selection with trusted identity", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ fandomId: "fandom-1" }));
    const request = new Request(
      "http://site/api/ktown/api/v1/me/season-membership",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fandomId: "10000000-0000-4000-8000-000000000001" }),
      },
    );

    const response = await proxyKtownRequest(
      request,
      ["api", "v1", "me", "season-membership"],
      { baseUrl: "http://backend", platformUserId: "member-1", fetcher },
    );

    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(response.status).toBe(200);
    expect(new Headers(init.headers).get("x-ktown-user-id")).toBe("member-1");
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toContain("fandomId");
  });

  it("forwards account game state through the trusted identity boundary", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ state: { version: 3 } }));
    const read = await proxyKtownRequest(
      new Request("http://site/api/ktown/api/v1/me/game-state"),
      ["api", "v1", "me", "game-state"],
      { baseUrl: "http://backend", platformUserId: "google:user-1", fetcher },
    );
    const write = await proxyKtownRequest(
      new Request("http://site/api/ktown/api/v1/me/game-state", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: { version: 3 } }),
      }),
      ["api", "v1", "me", "game-state"],
      { baseUrl: "http://backend", platformUserId: "google:user-1", fetcher },
    );

    expect(read.status).toBe(200);
    expect(write.status).toBe(200);
    const writeInit = fetcher.mock.calls[1][1] as RequestInit;
    expect(new Headers(writeInit.headers).get("x-ktown-user-id")).toBe("google:user-1");
  });

  it("rejects non-JSON and oversized membership selection bodies", async () => {
    const fetcher = vi.fn();
    const path = ["api", "v1", "me", "season-membership"];

    const wrongType = await proxyKtownRequest(
      new Request("http://site/api/ktown/api/v1/me/season-membership", {
        method: "PUT",
        headers: { "content-type": "text/plain" },
        body: "fandom",
      }),
      path,
      { baseUrl: "http://backend", platformUserId: "member-1", fetcher },
    );
    const oversized = await proxyKtownRequest(
      new Request("http://site/api/ktown/api/v1/me/season-membership", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fandomId: "x".repeat(4097) }),
      }),
      path,
      { baseUrl: "http://backend", platformUserId: "member-1", fetcher },
    );

    expect(wrongType.status).toBe(415);
    expect(oversized.status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
