import { cookies, headers } from "next/headers";
import { proxyKtownRequest } from "@/lib/server/ktown-gateway";
import { readSessionPayload, SESSION_COOKIE_NAME } from "@/lib/server/session";

type RouteContext = { params: Promise<{ path: string[] }> };

async function resolvePlatformUserId(requestHeaders: Headers): Promise<string | null> {
  const platformHeaderUserId = requestHeaders.get("oai-authenticated-user-id");
  if (platformHeaderUserId) return platformHeaderUserId;

  const cookieStore = await cookies();
  const session = readSessionPayload(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (session) return session.platformSubject;

  return process.env.NODE_ENV !== "production" ? process.env.KTOWN_DEV_USER_ID ?? null : null;
}

async function proxy(request: Request, context: RouteContext): Promise<Response> {
  const requestHeaders = await headers();
  const { path } = await context.params;
  return proxyKtownRequest(request, path, {
    baseUrl: process.env.KTOWN_API_BASE_URL ?? null,
    platformUserId: await resolvePlatformUserId(requestHeaders),
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
