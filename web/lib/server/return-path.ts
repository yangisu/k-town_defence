const RESERVED_AUTH_PATHS = new Set([
  "/signin-with-chatgpt",
  "/signout-with-chatgpt",
  "/callback",
  "/signin",
]);

/**
 * Collapses an arbitrary post-login redirect target down to a same-origin
 * relative path, so a crafted `return_to` value can never send a signed-in
 * user off-site.
 */
export function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (RESERVED_AUTH_PATHS.has(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}
