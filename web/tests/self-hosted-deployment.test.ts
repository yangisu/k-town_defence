import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const textFilesUnder = (directory: string): string[] => readdirSync(directory)
  .flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return textFilesUnder(path);
    return /\.(?:avif|gif|ico|jpe?g|png|webp|woff2?)$/i.test(path) ? [] : [path];
  });

describe("self-hosted production build", () => {
  let browserArtifact = "";
  let diagnostic = "";

  beforeAll(() => {
    rmSync(".output", { force: true, recursive: true });
    const command = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : "npm";
    const args = process.platform === "win32"
      ? ["/d", "/s", "/c", "npm run build:server"]
      : ["run", "build:server"];
    const result = spawnSync(command, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        NEXT_PUBLIC_AWS_LOCATION_API_KEY: "public-map-key",
        NEXT_PUBLIC_AWS_LOCATION_REGION: "ap-northeast-2",
        NEXT_PUBLIC_AWS_LOCATION_STYLE: "Standard",
        KTOWN_API_BASE_URL: "http://api:8000",
        KTOWN_SESSION_SECRET: "server-only-session-secret-sentinel",
      },
    });
    diagnostic = `${result.stdout}\n${result.stderr}`;
    expect(result.status, diagnostic).toBe(0);
    browserArtifact = textFilesUnder(".output/public")
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
  }, 120_000);

  it("emits a runnable Node server and public assets", () => {
    expect(existsSync(".output/server/index.mjs"), diagnostic).toBe(true);
    expect(existsSync(".output/public"), diagnostic).toBe(true);
  });

  it("does not expose server-only configuration in browser assets", () => {
    expect(browserArtifact).not.toContain("server-only-session-secret-sentinel");
    expect(browserArtifact).not.toContain("http://api:8000");
    expect(browserArtifact).not.toMatch(/KTOWN_SESSION_SECRET|KTOWN_API_BASE_URL/);
  });

  it("has no Vercel deployment configuration", () => {
    expect(existsSync("vercel.json")).toBe(false);
    expect(existsSync("vite.config.vercel.ts")).toBe(false);
  });

  it("deploys the production server from main", () => {
    const bootstrap = readFileSync(join("..", "deploy", "bootstrap-ec2.sh"), "utf8");
    expect(bootstrap).toContain('readonly DEPLOY_BRANCH="main"');
    expect(bootstrap).not.toContain('readonly DEPLOY_BRANCH="feat/');
  });
});
