import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

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

describe("Vercel deployment", () => {
  let artifact = "";
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
      env: { ...process.env, KTOWN_SERVICE_MODE: "demo" },
    });
    diagnostic = `${result.stdout}\n${result.stderr}`;

    expect(result.status, diagnostic).toBe(0);
    artifact = textFilesUnder(".vercel/output")
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

    expect(environment).toMatch(/^KTOWN_SERVICE_MODE=demo$/m);
    expect(environment).toMatch(/^NEXT_PUBLIC_AWS_LOCATION_API_KEY=example-restricted-map-key$/m);
    expect(environment).toMatch(/^NEXT_PUBLIC_AWS_LOCATION_REGION=ap-northeast-2$/m);
    expect(environment).toMatch(/^NEXT_PUBLIC_AWS_LOCATION_STYLE=Standard$/m);
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

  it("does not bundle local backend or secret configuration", () => {
    expect(artifact).not.toMatch(
      /KTOUR_SERVICE_KEY|KTOWN_DATABASE_URL|(?:postgres|mysql|mongodb)(?:ql)?(?:\+\w+)?:\/\/|KTOWN_DEV_USER_ID(?:=|\b)|local-member|https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(?:3000|8000)\b/i,
    );
  });
});
