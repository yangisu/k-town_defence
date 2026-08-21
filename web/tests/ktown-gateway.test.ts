import { describe, expect, it, vi } from "vitest";
import { proxyKtownRequest } from "@/lib/server/ktown-gateway";

describe("K-Town gateway", () => {
  it("rejects paths outside the exact place and check-in allowlist", async () => {
    const fetcher = vi.fn();
    const response = await proxyKtownRequest(
      new Request("http://site/api/ktown/admin/secrets"),
      ["admin", "secrets"],
      { baseUrl: "http://backend", platformUserId: "trusted-user", fetcher },
    );

    expect(response.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("strips browser credentials and replaces the trusted identity", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "session-1" }), {
        status: 201,
        headers: { "content-type": "application/json", "set-cookie": "secret=1" },
      }),
    );
    const request = new Request("http://site/api/ktown/api/v1/checkins", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer attacker",
        cookie: "session=attacker",
        "x-ktown-user-id": "attacker",
      },
      body: JSON.stringify({ placeId: "place-1" }),
    });

    const response = await proxyKtownRequest(request, ["api", "v1", "checkins"], {
      baseUrl: "http://backend",
      platformUserId: "trusted-user",
      fetcher,
    });

    const forwarded = fetcher.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(forwarded.headers);
    expect(headers.get("x-ktown-user-id")).toBe("trusted-user");
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("cookie")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
