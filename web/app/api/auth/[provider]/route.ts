import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { buildAuthorizeUrl, generatePkcePair, isSocialProvider } from "@/lib/server/social-auth";
import { createOAuthStateCookieValue, oauthStateCookieOptions, OAUTH_STATE_COOKIE_PREFIX } from "@/lib/server/session";
import { safeRelativeReturnPath } from "@/lib/server/return-path";
import { requestOrigin } from "@/lib/server/request-origin";

type RouteContext = { params: Promise<{ provider: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { provider } = await context.params;
  if (!isSocialProvider(provider)) {
    return NextResponse.json({ code: "UNKNOWN_PROVIDER", message: "지원하지 않는 로그인 방식입니다." }, { status: 404 });
  }

  const returnTo = safeRelativeReturnPath(new URL(request.url).searchParams.get("return_to") ?? "/");
  const state = randomUUID();
  const redirectUri = `${requestOrigin(request)}/api/auth/${provider}/callback`;
  const pkce = provider === "google" ? generatePkcePair() : null;
  const authorizeUrl = buildAuthorizeUrl(provider, { state, redirectUri, codeChallenge: pkce?.codeChallenge });
  if (!authorizeUrl) {
    return NextResponse.json(
      { code: "PROVIDER_NOT_CONFIGURED", message: "로그인 제공자 설정이 없습니다." },
      { status: 503 },
    );
  }

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(
    `${OAUTH_STATE_COOKIE_PREFIX}${provider}`,
    createOAuthStateCookieValue(state, returnTo, pkce?.codeVerifier),
    oauthStateCookieOptions,
  );
  return response;
}
