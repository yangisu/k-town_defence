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
  let serverArtifact = "";
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
    browserArtifact = textFilesUnder(".vercel/output/static")
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    serverArtifact = textFilesUnder(".vercel/output/functions")
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
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
});
