import { cookies } from "next/headers";
import { proxyKtownRequest } from "@/lib/server/ktown-gateway";
import { readSessionPayload, SESSION_COOKIE_NAME } from "@/lib/server/session";

type RouteContext = { params: Promise<{ path: string[] }> };

async function resolvePlatformUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const session = readSessionPayload(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (session) return session.platformSubject;

  return process.env.NODE_ENV !== "production" ? process.env.KTOWN_DEV_USER_ID ?? null : null;
}

async function proxy(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  return proxyKtownRequest(request, path, {
    baseUrl: process.env.KTOWN_API_BASE_URL ?? null,
    platformUserId: await resolvePlatformUserId(),
    gatewaySecret: process.env.KTOWN_GATEWAY_SECRET ?? null,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
