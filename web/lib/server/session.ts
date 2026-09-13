import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A minimal signed session cookie for the standalone (non-ChatGPT-embedded)
 * deployment. It deliberately avoids a full auth framework: the payload is
 * only ever the same opaque identity string every other route already
 * trusts (see `UserModel.platform_subject`), never a capability or role.
 *
 * Format: base64url(json payload) + "." + hex HMAC-SHA256(payload, secret).
 * Verification is constant-time; an invalid or expired cookie yields `null`
 * rather than throwing, so callers can always fall back to "signed out".
 */

export const SESSION_COOKIE_NAME = "ktown_session";
export const OAUTH_STATE_COOKIE_PREFIX = "ktown_oauth_state_";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const STATE_MAX_AGE_SECONDS = 60 * 10; // 10 minutes

export type SessionPayload = {
  platformSubject: string;
  userId: string;
  issuedAt: number;
};

function sessionSecret(): string {
  const secret = process.env.KTOWN_SESSION_SECRET;
  if (!secret || secret.trim().length < 16) {
    throw new Error(
      "KTOWN_SESSION_SECRET must be set to a random string of at least 16 characters.",
    );
  }
  return secret;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = sign(payload, secret);
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(signature, "hex");
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function encode(json: unknown): string {
  const encoded = base64UrlEncode(JSON.stringify(json));
  return `${encoded}.${sign(encoded, sessionSecret())}`;
}

function decode<T>(token: string | undefined | null): T | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  let secret: string;
  try {
    secret = sessionSecret();
  } catch {
    return null;
  }
  if (!verifySignature(encoded, signature, secret)) return null;
  const json = base64UrlDecode(encoded);
  if (json === null) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function createSessionCookieValue(platformSubject: string, userId: string): string {
  const payload: SessionPayload = { platformSubject, userId, issuedAt: Date.now() };
  return encode(payload);
}

export function readSessionPayload(token: string | undefined | null): SessionPayload | null {
  const payload = decode<SessionPayload>(token);
  if (!payload) return null;
  const ageSeconds = (Date.now() - payload.issuedAt) / 1000;
  if (ageSeconds < 0 || ageSeconds > SESSION_MAX_AGE_SECONDS) return null;
  if (!payload.platformSubject || !payload.userId) return null;
  return payload;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};

export function createOAuthStateCookieValue(
  state: string,
  returnTo: string,
  codeVerifier?: string,
): string {
  return encode({ state, returnTo, codeVerifier, issuedAt: Date.now() });
}

export function readOAuthStateCookiePayload(
  token: string | undefined | null,
): { state: string; returnTo: string; codeVerifier?: string } | null {
  const payload = decode<{ state: string; returnTo: string; codeVerifier?: string; issuedAt: number }>(token);
  if (!payload) return null;
  const ageSeconds = (Date.now() - payload.issuedAt) / 1000;
  if (ageSeconds < 0 || ageSeconds > STATE_MAX_AGE_SECONDS) return null;
  return { state: payload.state, returnTo: payload.returnTo, codeVerifier: payload.codeVerifier };
}

export const oauthStateCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: STATE_MAX_AGE_SECONDS,
};
