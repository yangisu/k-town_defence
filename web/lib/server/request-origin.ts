/**
 * Resolves the public origin a request arrived on, honoring the reverse-proxy
 * headers the Caddy gateway sets. Used to build an OAuth `redirect_uri`
 * that matches whatever origin the provider was authorized against.
 */
export function requestOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) return `${forwardedProto ?? "https"}://${forwardedHost}`;
  return new URL(request.url).origin;
}
