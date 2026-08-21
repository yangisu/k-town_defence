import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
  it(
    "builds a Nitro artifact without local backend or secret configuration",
    () => {
      rmSync(".vercel/output", { force: true, recursive: true });
      const command = process.platform === "win32"
        ? process.env.ComSpec ?? "cmd.exe"
        : "npm";
      const args = process.platform === "win32"
        ? ["/d", "/s", "/c", "npm run build:vercel"]
        : ["run", "build:vercel"];
      const result = spawnSync(
        command,
        args,
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, KTOWN_SERVICE_MODE: "demo" },
        },
      );
      const diagnostic = `${result.stdout}\n${result.stderr}`;

      expect(result.status, diagnostic).toBe(0);
      expect(existsSync(".vercel/output/config.json"), diagnostic).toBe(true);
      const artifact = textFilesUnder(".vercel/output")
        .map((path) => readFileSync(path, "utf8"))
        .join("\n");
      expect(artifact).not.toMatch(
        /KTOUR_SERVICE_KEY|postgresql\+asyncpg|KTOWN_DEV_USER_ID=|127\.0\.0\.1:8000/,
      );
    },
    120_000,
  );
});
