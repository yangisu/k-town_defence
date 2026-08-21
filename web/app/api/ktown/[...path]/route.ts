import { headers } from "next/headers";
import { proxyKtownRequest } from "@/lib/server/ktown-gateway";

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, context: RouteContext): Promise<Response> {
  const requestHeaders = await headers();
  const { path } = await context.params;
  return proxyKtownRequest(request, path, {
    baseUrl: process.env.KTOWN_API_BASE_URL ?? "http://127.0.0.1:8000",
    platformUserId:
      requestHeaders.get("oai-authenticated-user-id") ??
      (process.env.NODE_ENV !== "production"
        ? process.env.KTOWN_DEV_USER_ID ?? null
        : null),
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
