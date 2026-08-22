import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const publicBuildEnvironment = {
  KTOWN_SERVICE_MODE: "demo",
  NEXT_PUBLIC_AWS_LOCATION_API_KEY: "task9-public-map-key-sentinel",
  NEXT_PUBLIC_AWS_LOCATION_REGION: "ap-northeast-2",
  NEXT_PUBLIC_AWS_LOCATION_STYLE: "Standard",
} as const;

const forbiddenBuildEnvironment = {
  KTOUR_SERVICE_KEY: "task9-ktour-secret-sentinel",
  KTOWN_DATABASE_URL: "postgresql+asyncpg://task9-ktown-db-sentinel@localhost/ktown",
  DATABASE_URL: "mysql://task9-generic-db-sentinel@[::1]/ktown",
  POSTGRES_URL: "postgresql://task9-postgres-db-sentinel@127.0.0.1:43117/ktown",
  KTOWN_DEV_USER_ID: "task9-development-identity-sentinel",
  KTOWN_API_BASE_URL: "http://[::1]/task9-local-api-portless-ipv6-sentinel",
} as const;

const forbiddenSentinels = [
  "task9-ktour-secret-sentinel",
  "task9-ktown-db-sentinel",
  "task9-generic-db-sentinel",
  "task9-postgres-db-sentinel",
  "task9-development-identity-sentinel",
  "task9-local-api-portless-ipv6-sentinel",
] as const;

const privateRuntimeIdentifierPattern = /\b(?:KTOUR_SERVICE_KEY|KTOWN_DATABASE_URL|DATABASE_URL|POSTGRES_URL|POSTGRES_PRISMA_URL|POSTGRES_URL_NON_POOLING|MYSQL_URL|MARIADB_URL|MONGODB_URI|MONGO_URL|REDIS_URL|UPSTASH_REDIS_REST_URL|KTOWN_DEV_USER_ID)\b/;
const browserForbiddenIdentifierPattern = /\b(?:KTOUR_SERVICE_KEY|KTOWN_DATABASE_URL|KTOWN_API_BASE_URL|DATABASE_URL|POSTGRES_URL|POSTGRES_PRISMA_URL|POSTGRES_URL_NON_POOLING|MYSQL_URL|MARIADB_URL|MONGODB_URI|MONGO_URL|REDIS_URL|UPSTASH_REDIS_REST_URL|KTOWN_DEV_USER_ID)\b/;
const databaseUrlPattern = /\b(?:postgres(?:ql)?(?:\+[a-z][a-z0-9_-]*)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss):\/\//i;
const localOriginPattern = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?=[/?#'"`\s]|$)/i;
const localHostWithPortPattern = /(?:^|[^a-z0-9.-])(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d+(?=[/?#'"`\s]|$)/i;
const developmentIdentityPattern = /\b(?:local-member|dev-member|development-user)\b/i;

type TextArtifact = { path: string; text: string };

const textFilesUnder = (directory: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...textFilesUnder(path));
    } else if (!/\.(?:avif|gif|ico|jpe?g|png|webp|woff2?)$/i.test(path)) {
      files.push(path);
    }
  }
  return files;
};

const textArtifactsUnder = (directory: string): TextArtifact[] => textFilesUnder(directory)
  .map((path) => ({ path, text: readFileSync(path, "utf8") }));

const windowsAround = (source: string, markers: readonly string[], radius = 600) => markers
  .flatMap((marker) => {
    const windows: string[] = [];
    let index = source.indexOf(marker);
    while (index >= 0) {
      windows.push(source.slice(Math.max(0, index - radius), index + marker.length + radius));
      index = source.indexOf(marker, index + marker.length);
    }
    return windows;
  });

const expectNoMatch = (label: string, source: string, pattern: RegExp) => {
  expect(source.match(pattern), `${label} matched ${pattern}`).toBeNull();
};

const buildEnvironmentAllowlist = /^(?:APPDATA|CI|COMSPEC|HOME|HOMEDRIVE|HOMEPATH|LANG|LC_ALL|LOCALAPPDATA|NODE_OPTIONS|PATH|PATHEXT|SHELL|SYSTEMROOT|TEMP|TMP|USERPROFILE|WINDIR)$/i;

const sanitizedBuildEnvironment = () => Object.fromEntries([
  ...Object.entries(process.env).filter(([key]) => buildEnvironmentAllowlist.test(key)),
  ...Object.entries(publicBuildEnvironment),
  ...Object.entries(forbiddenBuildEnvironment),
]);

const parseEnvironmentAssignments = (source: string) => source
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith("#"))
  .map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)] as const;
  });

describe("Vercel deployment", () => {
  let configArtifact = "";
  let browserArtifact = "";
  let browserApplicationArtifact = "";
  let serverArtifact = "";
  let serverApplicationArtifact = "";
  let diagnostic = "";

  beforeAll(() => {
    rmSync(".vercel/output", { force: true, recursive: true });
    const command = process.platform === "win32"
      ? process.env.ComSpec ?? "cmd.exe"
      : "npm";
    const args = process.platform === "win32"
      ? ["/d", "/s", "/c", "npm run build:vercel"]
      : ["run", "build:vercel"];
    const result = spawnSync(command, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      env: sanitizedBuildEnvironment(),
    });
    diagnostic = `${result.stdout}\n${result.stderr}`;

    expect(result.status, diagnostic).toBe(0);
    configArtifact = readFileSync(".vercel/output/config.json", "utf8");
    const browserArtifacts = textArtifactsUnder(".vercel/output/static");
    const serverArtifacts = textArtifactsUnder(".vercel/output/functions");
    browserArtifact = browserArtifacts.map(({ text }) => text).join("\n");
    browserApplicationArtifact = browserArtifacts
      .filter(({ path }) => /(?:^|[\\/])ktown-app-[^\\/]+\.js$/i.test(path))
      .map(({ text }) => text)
      .join("\n");
    serverArtifact = serverArtifacts.map(({ text }) => text).join("\n");

    // Vinext ships generic localhost URL parsers in framework chunks. Limit
    // literal-origin checks to app chunks and windows around stable product
    // markers, while identifier checks still cover the complete server output.
    serverApplicationArtifact = [
      ...serverArtifacts
        .filter(({ path }) => /(?:^|[\\/])(?:route|page|ktown-app)-[^\\/]+\.mjs$/i.test(path))
        .map(({ text }) => text),
      ...serverArtifacts.flatMap(({ text }) => windowsAround(text, [
        "K-Town Defense —",
        "BACKEND_NOT_CONFIGURED",
        "KTOWN_API_BASE_URL",
      ])),
    ].join("\n");
  }, 120_000);

  it("keeps the Vercel build config isolated from Cloudflare runtime imports", () => {
    const config = readFileSync("vite.config.vercel.ts", "utf8");

    expect(config).not.toMatch(/@cloudflare|sites-vite-plugin|\.openai\/hosting/);
  });

  it("documents the exact restricted public map environment contract", () => {
    const environment = readFileSync(".env.example", "utf8");
    const readme = readFileSync("README.md", "utf8");

    expect(Object.fromEntries(parseEnvironmentAssignments(environment))).toEqual({
      KTOWN_SERVICE_MODE: "demo",
      NEXT_PUBLIC_AWS_LOCATION_API_KEY: "example-restricted-map-key",
      NEXT_PUBLIC_AWS_LOCATION_REGION: "ap-northeast-2",
      NEXT_PUBLIC_AWS_LOCATION_STYLE: "Standard",
    });
    expect(parseEnvironmentAssignments(environment)).toHaveLength(4);
    expect(readme).toMatch(/map actions?/i);
    expect(readme).toMatch(/Preview[^\n]*(?:origin|referrer)/i);
    expect(readme).toMatch(/Production[^\n]*(?:origin|referrer)/i);
    expect(readme).toMatch(/Amazon Location[^\n]*geoBoundaries/i);
    expect(readme).toMatch(/deterministic/i);
    expect(readme).toMatch(/Reset demo/i);
  });

  it("emits the Nitro server function and static assets", () => {
    expect(existsSync(".vercel/output/config.json"), diagnostic).toBe(true);
    expect(
      existsSync(".vercel/output/functions/__server.func/index.mjs"),
      diagnostic,
    ).toBe(true);
    expect(existsSync(".vercel/output/static"), diagnostic).toBe(true);
    expect(
      textFilesUnder(".vercel/output/static").length,
      diagnostic,
    ).toBeGreaterThan(0);
  });

  it("does not bundle injected server-only secret, database, identity, or local API values", () => {
    for (const sentinel of forbiddenSentinels) {
      expect(configArtifact, `Vercel config leaked ${sentinel}`).not.toContain(sentinel);
      expect(browserArtifact, `browser artifact leaked ${sentinel}`).not.toContain(sentinel);
      expect(serverArtifact, `server artifact leaked ${sentinel}`).not.toContain(sentinel);
    }
  });

  it("rejects forbidden runtime identifiers at their config, browser, and server boundaries", () => {
    expectNoMatch("Vercel config private identifier", configArtifact, browserForbiddenIdentifierPattern);
    expectNoMatch("browser private identifier", browserArtifact, browserForbiddenIdentifierPattern);
    expectNoMatch("server private identifier", serverArtifact, privateRuntimeIdentifierPattern);

    expectNoMatch("Vercel config database URL", configArtifact, databaseUrlPattern);
    expectNoMatch("browser database URL", browserArtifact, databaseUrlPattern);
    expectNoMatch("server database URL", serverArtifact, databaseUrlPattern);
    expectNoMatch("Vercel config development identity", configArtifact, developmentIdentityPattern);
    expectNoMatch("browser development identity", browserArtifact, developmentIdentityPattern);
    expectNoMatch("server development identity", serverArtifact, developmentIdentityPattern);
  });

  it("keeps the integrated API base server-only without bundling an app-owned local default", () => {
    expectNoMatch("Vercel config local origin", configArtifact, localOriginPattern);
    expectNoMatch("Vercel config local host", configArtifact, localHostWithPortPattern);
    expectNoMatch("browser app local origin", browserApplicationArtifact, localOriginPattern);
    expectNoMatch("browser app local host", browserApplicationArtifact, localHostWithPortPattern);
    expectNoMatch("server app local origin", serverApplicationArtifact, localOriginPattern);
    expectNoMatch("server app local host", serverApplicationArtifact, localHostWithPortPattern);

    expectNoMatch("Vercel config API base identifier", configArtifact, /\bKTOWN_API_BASE_URL\b/);
    expectNoMatch("browser API base identifier", browserArtifact, /\bKTOWN_API_BASE_URL\b/);
    expect(serverArtifact).toMatch(/\bKTOWN_API_BASE_URL\b/);
  });
});
