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
  expect(compactCss).toMatch(/\.preview-map-boundary\{[^}]*min-width:0/);
  expect(compactCss).toMatch(/\.maplibregl-map\{[^}]*width:100%[^}]*height:100%/);
  expect(compactCss).toContain(".tactical-panel");
  expect(compactCss).toContain(".artist-drawer");
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

it("keeps visible focus and removes all nonessential motion for reduced-motion users", () => {
  expect(compactCss).toContain(":focus-visible");
  expect(compactCss).toContain("@media(prefers-reduced-motion:reduce)");
  const reducedMotion = compactCss.slice(compactCss.indexOf("@media(prefers-reduced-motion:reduce)"));
  expect(reducedMotion).toContain("transition:none!important");
  expect(reducedMotion).toContain("animation:none!important");
  expect(reducedMotion).toContain("transform:none!important");
});

it("never reinstates the decorative map grid in preview components", () => {
  expect(previewSource).not.toContain("map-grid");
  expect(previewSource).not.toContain("territory-map .map-grid");
  expect(previewSource).toContain("preview-map-attribution");
});
