type GatewayDependencies = {
  baseUrl: string;
  platformUserId: string | null;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}";
const allowedRoutes = [
  { method: "GET", pattern: /^api\/v1\/places$/ },
  { method: "GET", pattern: new RegExp(`^api/v1/places/${UUID}$`) },
  { method: "POST", pattern: /^api\/v1\/checkins$/ },
  { method: "GET", pattern: new RegExp(`^api/v1/checkins/${UUID}$`) },
  { method: "POST", pattern: new RegExp(`^api/v1/checkins/${UUID}/(?:gps|photo|submit)$`) },
] as const;

const jsonError = (status: number, code: string, message: string) =>
  Response.json({ code, message }, { status });

export async function proxyKtownRequest(
  request: Request,
  pathSegments: string[],
  dependencies: GatewayDependencies,
): Promise<Response> {
  const path = pathSegments.join("/");
  if (
    pathSegments.some((segment) => !segment || segment.includes("%") || segment === "." || segment === "..") ||
    !allowedRoutes.some(
      (route) => route.method === request.method && route.pattern.test(path),
    )
  ) {
    return jsonError(404, "GATEWAY_ROUTE_NOT_FOUND", "허용되지 않은 API 경로입니다.");
  }

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const idempotencyKey = request.headers.get("idempotency-key");
  if (contentType) headers.set("content-type", contentType);
  if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);
  if (dependencies.platformUserId) {
    headers.set("x-ktown-user-id", dependencies.platformUserId);
  }

  let body: ArrayBuffer | undefined;
  if (!new Set(["GET", "HEAD"]).has(request.method)) {
    body = await request.arrayBuffer();
    const maximumBodyBytes = path.endsWith("/photo") ? 11 * 1024 * 1024 : 1024 * 1024;
    if (body.byteLength > maximumBodyBytes) {
      return jsonError(413, "REQUEST_TOO_LARGE", "요청 본문이 너무 큽니다.");
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? 10_000);
  try {
    const query = new URLSearchParams();
    if (path === "api/v1/places") {
      const incoming = new URL(request.url).searchParams;
      for (const key of ["regionCode", "category", "query", "limit", "offset"]) {
        const value = incoming.get(key);
        if (value !== null) query.set(key, value);
      }
    }
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    const upstream = await (dependencies.fetcher ?? fetch)(
      `${dependencies.baseUrl.replace(/\/$/, "")}/${path}${suffix}`,
      { method: request.method, headers, body, signal: controller.signal },
    );
    const responseHeaders = new Headers();
    const upstreamContentType = upstream.headers.get("content-type");
    if (upstreamContentType) responseHeaders.set("content-type", upstreamContentType);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return jsonError(502, "UPSTREAM_UNAVAILABLE", "백엔드에 연결할 수 없습니다.");
  } finally {
    clearTimeout(timeout);
  }
}
