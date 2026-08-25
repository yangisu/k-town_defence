import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const compactCss = css.replace(/\s+/g, "");
const previewSource = readdirSync(resolve(process.cwd(), "components/team-preview"))
  .filter((file) => file.endsWith(".tsx"))
  .map((file) => readFileSync(resolve(process.cwd(), "components/team-preview", file), "utf8"))
  .join("\n");

it("defines the stable desktop map and tactical-panel split", () => {
  const desktop = compactCss.slice(compactCss.indexOf("@media(min-width:768px)"));

  expect(desktop).toMatch(/\.preview-map-layout\{[^}]*grid-template-columns:minmax\(0,1fr\)360px/);
  expect(desktop).toMatch(/\.preview-territory-map\{[^}]*height:clamp\(26rem,52dvh,36rem\)/);
  expect(desktop).toMatch(/\.tactical-panel\{[^}]*position:static[^}]*max-height:none[^}]*overflow:visible/);
  expect(desktop).toMatch(/\.territory-view\{[^}]*padding-top:18px/);
  expect(compactCss).not.toContain(".territory-view{padding-top:0}");
  expect(compactCss).toMatch(/\.preview-map-boundary\{[^}]*min-width:0/);
  expect(compactCss).toMatch(/\.maplibregl-map\{[^}]*width:100%[^}]*height:100%/);
  expect(previewSource).not.toContain('style={{ minHeight: "32rem", width: "100%" }}');
  expect(compactCss).toContain(".tactical-panel");
  expect(compactCss).toContain(".artist-drawer");
});

it("renders territory filters as distinct wrapping controls aligned with the workspace", () => {
  expect(compactCss).toMatch(/\.map-filters\{[^}]*display:flex[^}]*flex-wrap:wrap[^}]*gap:8px/);
  expect(compactCss).toMatch(/\.map-filtersbutton\{[^}]*min-height:40px[^}]*border-radius:999px/);
  expect(compactCss).toMatch(/\.map-filtersbutton\[aria-pressed="true"\]\{[^}]*background:var\(--ink\)[^}]*color:white/);
  expect(compactCss).toMatch(/\.tactical-connection>div:has\(>p\)\{[^}]*display:block/);
});

it("keeps a 52dvh map and scrollable safe-area tactical sheet below 768px", () => {
  const mobileStart = compactCss.indexOf("@media(max-width:767px)");
  expect(mobileStart).toBeGreaterThanOrEqual(0);
  const mobile = compactCss.slice(mobileStart);

  expect(mobile).toMatch(/\.preview-territory-map\{[^}]*min-height:52dvh/);
  expect(mobile).toMatch(/\.tactical-panel\{[^}]*overflow-y:auto/);
  expect(mobile).toMatch(/\.tactical-panel>\.primary-button\{[^}]*position:sticky/);
  expect(mobile).toContain("env(safe-area-inset-bottom)");
});

it("gives objective/reset and locale controls distinct mobile rows and desktop columns", () => {
  expect(compactCss).toMatch(/\.shell-status\{[^}]*display:grid[^}]*grid-template-columns:minmax\(0,1fr\)auto/);
  expect(compactCss).toMatch(/\.shell-status>\.objective-strip\{[^}]*grid-column:1\/-1[^}]*min-width:0/);
  expect(compactCss).toMatch(/\.objective-stripbutton\{[^}]*flex-shrink:0/);

  const desktop = compactCss.slice(compactCss.indexOf("@media(min-width:768px)"));
  expect(desktop).toMatch(/\.shell-status\{[^}]*grid-template-columns:autominmax\(0,1fr\)auto/);
  expect(desktop).toMatch(/\.shell-status>\.objective-strip\{[^}]*grid-column:auto/);
});

it("keeps visible focus and removes motion without disabling layout transforms", () => {
  expect(compactCss).toContain(":focus-visible");
  expect(compactCss).toContain("@media(prefers-reduced-motion:reduce)");
  const reducedMotion = compactCss.slice(compactCss.indexOf("@media(prefers-reduced-motion:reduce)"));
  expect(reducedMotion).toContain("transition:none!important");
  expect(reducedMotion).toContain("animation:none!important");
  expect(reducedMotion).not.toMatch(/\*,\*::before,\*::after\{[^}]*transform:none!important/);
});

it("centers the reset dialog with an interaction-blocking inset overlay", () => {
  expect(compactCss).toMatch(/\.reset-dialog-overlay\{[^}]*position:fixed[^}]*inset:0[^}]*display:grid[^}]*place-items:center/);
  expect(compactCss).not.toMatch(/\.reset-dialog\{[^}]*transform:translate/);
});

it("never reinstates the decorative map grid in preview components", () => {
  expect(previewSource).not.toContain("map-grid");
  expect(previewSource).not.toContain("territory-map .map-grid");
  expect(previewSource).toContain("preview-map-attribution");
});

it("defines cross-flow profile, ranking, record, mobile, and reduced-motion contracts", () => {
  for (const selector of [
    "profile-setup",
    "profile-menu",
    "ranking-podium",
    "ranking-me-card",
    "record-metrics",
    "record-timeline",
  ]) {
    expect(compactCss).toMatch(new RegExp(`\\.${selector}(?:,[^{]+)?\\{`));
  }
  expect(compactCss).toContain("@media(max-width:767px)");
  expect(compactCss).toContain("@media(prefers-reduced-motion:reduce)");
});

it("keeps the demo entry screens full-height and mobile-safe", () => {
  expect(compactCss).toMatch(/\.demo-entry-screen\{[^}]*min-height:100(?:svh|vh)/);
  expect(compactCss).toMatch(/\.demo-login-card\{[^}]*width:min\(100%,420px\)/);
  expect(compactCss).toMatch(/\.demo-brand-transition\{[^}]*position:fixed[^}]*inset:0/);
  expect(compactCss).toMatch(/@media\(prefers-reduced-motion:reduce\)\{[^}]*\.demo-brand-lockup/);
});
