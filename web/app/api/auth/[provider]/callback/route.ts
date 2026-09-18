import { NextResponse } from "next/server";
import { exchangeCodeForProfile, isSocialProvider } from "@/lib/server/social-auth";
import {
  createSessionCookieValue,
  readOAuthStateCookiePayload,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
  OAUTH_STATE_COOKIE_PREFIX,
} from "@/lib/server/session";
import { requestOrigin } from "@/lib/server/request-origin";

type RouteContext = { params: Promise<{ provider: string }> };

function failureRedirect(origin: string, reason: string): Response {
  const url = new URL("/signin", origin);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { provider } = await context.params;
  const origin = requestOrigin(request);
  if (!isSocialProvider(provider)) return failureRedirect(origin, "unknown_provider");

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const stateCookieName = `${OAUTH_STATE_COOKIE_PREFIX}${provider}`;
  const stateCookieValue = request.headers
    .get("cookie")
    ?.split("; ")
    .find((entry) => entry.startsWith(`${stateCookieName}=`))
    ?.slice(stateCookieName.length + 1);
  const statePayload = readOAuthStateCookiePayload(stateCookieValue);

  if (!code || !state || !statePayload || statePayload.state !== state) {
    return failureRedirect(origin, "invalid_state");
  }

  const profile = await exchangeCodeForProfile(provider, {
    code,
    redirectUri: `${origin}/api/auth/${provider}/callback`,
    codeVerifier: statePayload.codeVerifier,
  });
  if (!profile) return failureRedirect(origin, "profile_unavailable");

  const backendBaseUrl = process.env.KTOWN_API_BASE_URL;
  if (!backendBaseUrl) return failureRedirect(origin, "backend_not_configured");

  const gatewaySecret = process.env.KTOWN_GATEWAY_SECRET;
  const upsertResponse = await fetch(`${backendBaseUrl.replace(/\/$/, "")}/api/v1/auth/social/upsert`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(gatewaySecret ? { "x-ktown-gateway-secret": gatewaySecret } : {}),
    },
    body: JSON.stringify({
      platformSubject: profile.platformSubject,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    }),
  });
  if (!upsertResponse.ok) return failureRedirect(origin, "profile_upsert_failed");
  const upserted = (await upsertResponse.json()) as { userId: string };

  const response = NextResponse.redirect(new URL(statePayload.returnTo, origin));
  response.cookies.set(
    SESSION_COOKIE_NAME,
    createSessionCookieValue(profile.platformSubject, upserted.userId),
    sessionCookieOptions,
  );
  response.cookies.delete(stateCookieName);
  return response;
}
