import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8").replace(/\s+/g, "");

function paletteColor(token: string) {
  const palette = css.match(/:root\{([^}]*)\}/)?.[1] ?? "";
  return palette.match(new RegExp(`${token}:(#[0-9a-f]{6})`))?.[1] ?? "";
}

function luminance(hex: string) {
  return [1, 3, 5].reduce((sum, start, index) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    const linear = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
}

function contrast(foreground: string, background: string) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

it("keeps the RIIZE fandom name readable while retaining orange as a non-text accent", () => {
  const fandomNameRule = [...css.matchAll(/\.artist-optionb\{([^}]*)\}/g)].at(-1)?.[1] ?? "";
  const foregroundToken = fandomNameRule.match(/color:var\((--[a-z0-9-]+)\)/)?.[1] ?? "";
  const background = paletteColor("--white");

  expect(contrast("#f28a45", background)).toBeLessThan(4.5);
  expect(contrast(paletteColor(foregroundToken), background)).toBeGreaterThanOrEqual(4.5);
  expect(css).toMatch(/\.artist-swatch\{[^}]*background:var\(--artist-color\)/);
});

it("keeps locked Record labels at AA contrast and dims only the decorative marker", () => {
  const lockedStatusRule = css.match(/\.record-(?:growth|rewards)li\.locked>span:last-child\{([^}]*)\}/)?.[1] ?? "";
  const foregroundToken = lockedStatusRule.match(/color:var\((--[a-z0-9-]+)\)/)?.[1] ?? "";

  expect(contrast(paletteColor(foregroundToken), paletteColor("--white"))).toBeGreaterThanOrEqual(4.5);
  const lockedContainerRule = [...css.matchAll(/\.record-growthli\.locked,.record-rewardsli\.locked\{([^}]*)\}/g)].at(-1)?.[1] ?? "";
  expect(lockedContainerRule).toContain("opacity:1");
  expect(css).toMatch(/\.record-growthli\.locked\.stronghold-silhouette,.record-rewardsli\.locked\.stronghold-silhouette\{[^}]*opacity:/);
});
