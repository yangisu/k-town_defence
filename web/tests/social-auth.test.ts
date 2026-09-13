import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAuthorizeUrl, exchangeCodeForProfile, isProviderConfigured } from "@/lib/server/social-auth";

const ORIGINAL_ENV = { ...process.env };

function setProviderEnv(overrides: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("social auth provider configuration", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("requires both the Kakao REST API key and client secret", () => {
    setProviderEnv({ KAKAO_CLIENT_ID: undefined, KAKAO_CLIENT_SECRET: undefined });
    expect(isProviderConfigured("kakao")).toBe(false);

    setProviderEnv({ KAKAO_CLIENT_ID: "kakao-id" });
    expect(isProviderConfigured("kakao")).toBe(false);

    setProviderEnv({ KAKAO_CLIENT_SECRET: "kakao-secret" });
    expect(isProviderConfigured("kakao")).toBe(true);
  });

  it("requires a client secret for providers that need one", () => {
    setProviderEnv({ NAVER_CLIENT_ID: "naver-id", NAVER_CLIENT_SECRET: undefined });
    expect(isProviderConfigured("naver")).toBe(false);

    setProviderEnv({ NAVER_CLIENT_SECRET: "naver-secret" });
    expect(isProviderConfigured("naver")).toBe(true);
  });

  it("builds an authorize URL carrying the state and redirect URI", () => {
    setProviderEnv({ GOOGLE_CLIENT_ID: "google-id", GOOGLE_CLIENT_SECRET: "google-secret" });

    const url = buildAuthorizeUrl("google", {
      state: "state-xyz",
      redirectUri: "https://app.example/api/auth/google/callback",
    });

    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("client_id")).toBe("google-id");
    expect(parsed.searchParams.get("state")).toBe("state-xyz");
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://app.example/api/auth/google/callback");
  });

  it("returns null for an unconfigured provider instead of throwing", () => {
    setProviderEnv({ GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined });
    expect(buildAuthorizeUrl("google", { state: "s", redirectUri: "https://x" })).toBeNull();
  });
});

describe("exchangeCodeForProfile", () => {
  beforeEach(() => {
    setProviderEnv({
      KAKAO_CLIENT_ID: "kakao-id",
      KAKAO_CLIENT_SECRET: "kakao-secret",
      NAVER_CLIENT_ID: "naver-id",
      NAVER_CLIENT_SECRET: "naver-secret",
      GOOGLE_CLIENT_ID: "google-id",
      GOOGLE_CLIENT_SECRET: "google-secret",
    });
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("maps a Kakao profile to the common shape and prefixes the subject", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: "token-1" }))
      .mockResolvedValueOnce(Response.json({
        id: 555,
        kakao_account: { profile: { nickname: "아미", profile_image_url: "https://img/kakao.png" } },
      }));

    const profile = await exchangeCodeForProfile(
      "kakao",
      { code: "code-1", redirectUri: "https://app.example/callback" },
      fetcher,
    );

    expect(profile).toEqual({
      platformSubject: "kakao:555",
      displayName: "아미",
      avatarUrl: "https://img/kakao.png",
    });
    expect(fetcher.mock.calls[0]?.[1]?.body?.toString()).toContain("client_secret=kakao-secret");
  });

  it("maps a Naver profile to the common shape", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: "token-2" }))
      .mockResolvedValueOnce(Response.json({
        response: { id: "n-1", nickname: "블링크", profile_image: "https://img/naver.png" },
      }));

    const profile = await exchangeCodeForProfile(
      "naver",
      { code: "code-2", redirectUri: "https://app.example/callback" },
      fetcher,
    );

    expect(profile?.platformSubject).toBe("naver:n-1");
  });

  it("returns null when the token exchange fails", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 400 }));

    const profile = await exchangeCodeForProfile(
      "google",
      { code: "bad-code", redirectUri: "https://app.example/callback" },
      fetcher,
    );

    expect(profile).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns null when the provider is not configured", async () => {
    setProviderEnv({ GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined });
    const fetcher = vi.fn();

    const profile = await exchangeCodeForProfile(
      "google",
      { code: "code", redirectUri: "https://app.example/callback" },
      fetcher,
    );

    expect(profile).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
