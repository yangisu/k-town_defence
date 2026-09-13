import { describe, expect, it, vi } from "vitest";
import { createInitialDemoSession } from "@/features/team-preview/demo-session";
import { createRemoteDemoSessionStore } from "@/features/team-preview/remote-session-store";

describe("remote demo session store", () => {
  it("loads the signed-in user's state without caching", async () => {
    const state = createInitialDemoSession();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ state }), { status: 200 }));
    const store = createRemoteDemoSessionStore(fetcher as typeof fetch);

    await expect(store.load()).resolves.toEqual(state);
    expect(fetcher).toHaveBeenCalledWith("/api/ktown/api/v1/me/game-state", { cache: "no-store" });
  });

  it("saves the complete validated state through the authenticated gateway", async () => {
    const state = createInitialDemoSession();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ state }), { status: 200 }));
    const store = createRemoteDemoSessionStore(fetcher as typeof fetch);

    await store.save(state);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/ktown/api/v1/me/game-state",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ state }) }),
    );
  });

  it("fails closed when the authenticated gateway rejects the request", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ code: "IDENTITY_REQUIRED" }), { status: 401 }));
    await expect(createRemoteDemoSessionStore(fetcher as typeof fetch).load()).rejects.toThrow("GAME_STATE_401");
  });
});
