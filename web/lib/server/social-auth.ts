import { createHash, randomBytes } from "node:crypto";

export type SocialProvider = "kakao" | "naver" | "google";

export type SocialProfile = {
  platformSubject: string;
  displayName: string | null;
  avatarUrl: string | null;
};

type ProviderEnv = { clientId: string; clientSecret: string | null };

type ProviderConfig = {
  authorizeUrl: string;
  scope: string;
  tokenUrl: string;
  userInfoUrl: string;
  usesPkce: boolean;
  env: () => ProviderEnv | null;
  parseProfile: (tokenJson: unknown, userJson: unknown) => SocialProfile | null;
};

/** RFC 7636 PKCE pair. Only Google currently requires this to avoid `invalid_grant`. */
export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

export const SOCIAL_PROVIDERS: readonly SocialProvider[] = ["kakao", "naver", "google"];

export function isSocialProvider(value: string): value is SocialProvider {
  return (SOCIAL_PROVIDERS as readonly string[]).includes(value);
}

function readEnv(clientIdVar: string, clientSecretVar: string, secretRequired: boolean): ProviderEnv | null {
  const clientId = process.env[clientIdVar]?.trim();
  const clientSecret = process.env[clientSecretVar]?.trim() || null;
  if (!clientId) return null;
  if (secretRequired && !clientSecret) return null;
  return { clientId, clientSecret };
}

const PROVIDERS: Record<SocialProvider, ProviderConfig> = {
  kakao: {
    authorizeUrl: "https://kauth.kakao.com/oauth/authorize",
    tokenUrl: "https://kauth.kakao.com/oauth/token",
    userInfoUrl: "https://kapi.kakao.com/v2/user/me",
    scope: "",
    usesPkce: false,
    // Kakao enables the client secret for newly-created apps. Treat it as
    // required so a partially configured production button cannot start a
    // flow that is guaranteed to fail during the token exchange.
    env: () => readEnv("KAKAO_CLIENT_ID", "KAKAO_CLIENT_SECRET", true),
    parseProfile: (_token, user) => {
      const body = user as { id?: number; kakao_account?: { profile?: { nickname?: string; profile_image_url?: string } } };
      if (typeof body.id !== "number") return null;
      return {
        platformSubject: `kakao:${body.id}`,
        displayName: body.kakao_account?.profile?.nickname ?? null,
        avatarUrl: body.kakao_account?.profile?.profile_image_url ?? null,
      };
    },
  },
  naver: {
    authorizeUrl: "https://nid.naver.com/oauth2.0/authorize",
    tokenUrl: "https://nid.naver.com/oauth2.0/token",
    userInfoUrl: "https://openapi.naver.com/v1/nid/me",
    scope: "",
    usesPkce: false,
    env: () => readEnv("NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET", true),
    parseProfile: (_token, user) => {
      const body = user as { response?: { id?: string; nickname?: string; profile_image?: string } };
      const id = body.response?.id;
      if (!id) return null;
      return {
        platformSubject: `naver:${id}`,
        displayName: body.response?.nickname ?? null,
        avatarUrl: body.response?.profile_image ?? null,
      };
    },
  },
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid profile",
    usesPkce: true,
    env: () => readEnv("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", true),
    parseProfile: (_token, user) => {
      const body = user as { sub?: string; name?: string; picture?: string };
      if (!body.sub) return null;
      return {
        platformSubject: `google:${body.sub}`,
        displayName: body.name ?? null,
        avatarUrl: body.picture ?? null,
      };
    },
  },
};

export function isProviderConfigured(provider: SocialProvider): boolean {
  return PROVIDERS[provider].env() !== null;
}

export function buildAuthorizeUrl(
  provider: SocialProvider,
  { state, redirectUri, codeChallenge }: { state: string; redirectUri: string; codeChallenge?: string },
): string | null {
  const config = PROVIDERS[provider];
  const env = config.env();
  if (!env) return null;
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  if (config.scope) url.searchParams.set("scope", config.scope);
  if (config.usesPkce && codeChallenge) {
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

/**
 * Exchanges an authorization code for the provider's profile fields. Runs
 * entirely server-to-server: the client secret never reaches the browser,
 * and only the minimal `SocialProfile` shape is returned to the caller.
 */
export async function exchangeCodeForProfile(
  provider: SocialProvider,
  { code, redirectUri, codeVerifier }: { code: string; redirectUri: string; codeVerifier?: string },
  fetcher: typeof fetch = fetch,
): Promise<SocialProfile | null> {
  const config = PROVIDERS[provider];
  const env = config.env();
  if (!env) return null;

  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: env.clientId,
    redirect_uri: redirectUri,
    code,
  });
  if (env.clientSecret) tokenBody.set("client_secret", env.clientSecret);
  if (config.usesPkce && codeVerifier) tokenBody.set("code_verifier", codeVerifier);

  const tokenResponse = await fetcher(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: tokenBody,
  });
  if (!tokenResponse.ok) return null;
  const tokenJson = await tokenResponse.json();
  const accessToken = (tokenJson as { access_token?: string }).access_token;
  if (!accessToken) return null;

  const userResponse = await fetcher(config.userInfoUrl, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!userResponse.ok) return null;
  const userJson = await userResponse.json();

  return config.parseProfile(tokenJson, userJson);
}
