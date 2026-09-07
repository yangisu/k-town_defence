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
  expect(compactCss).toMatch(/\.map-filters\{[^}]*display:flex[^}]*flex-wrap:wrap/);
  // The group now sits inside the map action row, so it carries no page framing.
  expect(compactCss).toContain(".preview-map-actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between");
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

it("keeps the objective card and locale switch side by side on one header row", () => {
  // identity | objective (shrinks) | locale (natural width) at every width, so
  // the switch never stretches across its own row.
  expect(compactCss).toContain("grid-template-columns:autominmax(0,1fr)auto");
  expect(compactCss).toContain(".shell-status>.objective-strip{min-width:0}");
  expect(compactCss).toContain(".shell-status>.locale-switch{flex-shrink:0;justify-self:end}");
  expect(compactCss).not.toContain(".shell-status>.objective-strip{grid-column:1/-1");
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

it("stacks the map and side panel until both columns fit", () => {
  // A 210px rail, 34px gutters, a 24px gap and a 390px panel leave the map
  // under 100px wide at 768px, so the split only starts once both columns fit.
  const query = "@media(min-width:768px)and(max-width:1079px)";
  const narrow = compactCss.slice(compactCss.indexOf(query));

  expect(compactCss).toContain(query);
  expect(narrow).toContain(".preview-map-layout{grid-template-columns:minmax(0,1fr)}");
  expect(narrow).toContain(".expedition-layout{grid-template-columns:minmax(0,1fr)}");
  expect(narrow).toContain(".battle-card{position:static}");
  // A full-width standings card reads as one row instead of a left-packed column.
  expect(narrow).toContain(".preview-expedition-view.battle-card{display:flex");
  expect(narrow).toContain(".preview-expedition-view.battle-card>.eyebrow{flex:10100%}");
  expect(narrow).toContain(".preview-expedition-view.battle-card>p{margin:000auto}");
  expect(compactCss.indexOf(query))
    .toBeGreaterThan(compactCss.lastIndexOf("grid-template-columns:minmax(0,1fr)390px"));
  expect(compactCss.indexOf(query))
    .toBeGreaterThan(compactCss.lastIndexOf("grid-template-columns:minmax(0,1fr)330px"));
});

it("pairs the expedition hero with the territory standings once both columns fit", () => {
  // The standings card fills what used to be a dead hero column, so the route
  // and the territory it contests read together. Below 1080px it stacks inside
  // the hero and the itinerary keeps the full width. The integrated hero keeps
  // its poster.
  expect(compactCss).toContain(".preview-expedition-view.expedition-hero{grid-template-columns:minmax(0,1fr);");
  expect(compactCss).toContain("@media(min-width:1080px){.preview-expedition-view.expedition-hero{grid-template-columns:minmax(0,1fr)300px");
  expect(compactCss).toContain(".preview-expedition-view.expedition-hero>.battle-card{position:static");
  expect(compactCss).toContain(".preview-expedition-view.expedition-layout{grid-template-columns:minmax(0,1fr)}");
  expect(compactCss).toContain(".expedition-hero{grid-template-columns:1.3fr.7fr}");
  expect(compactCss).toContain(".battle-cardul{line-height:1.8}");
  expect(compactCss).not.toContain(".battle-cardul{padding-left");
});

it("fits the login card into a shortened viewport instead of scrolling it", () => {
  // Every vertical step of the card scales with the small viewport height, so
  // shrinking the window compacts the card rather than pushing it off-screen.
  expect(compactCss).toContain(".demo-login-screen{display:grid;place-items:center;padding:clamp(14px,3svh,24px)clamp(14px,4vw,24px)}");
  expect(compactCss).toContain(".demo-login-card{width:min(100%,420px);padding:clamp(20px,4.2svh,32px)clamp(20px,5vw,32px)");
  expect(compactCss).toContain(".demo-login-cardh1{margin:clamp(16px,4.4svh,34px)08px;font-size:clamp(24px,4svh,30px)}");
  expect(compactCss).toContain(".demo-login-cardinput{width:100%;min-height:clamp(44px,6.8svh,52px);margin-top:clamp(5px,.9svh,7px)");
  expect(compactCss).toContain(".demo-login-cardbutton{width:100%;min-height:clamp(46px,7.1svh,54px);margin-top:clamp(14px,3.2svh,24px)");
  // The brand lockup shrinks with the card instead of keeping a fixed 56px tile.
  expect(compactCss).toContain(".demo-login-card.demo-brand-lockup>span{width:clamp(44px,7.4svh,56px)");
  expect(compactCss).not.toContain(".demo-login-card{width:min(100%,420px);padding:32px");
  // The in-field reveal toggle must not inherit the full-width submit button.
  expect(compactCss).toContain(".demo-login-card.demo-login-reveal{position:absolute;top:50%;right:7px;width:38px;height:38px;min-height:0");
  expect(compactCss).toContain(".demo-login-card.demo-login-field>input{margin-top:0;padding-right:52px}");
});

it("keeps the expedition total and its stop actions readable at every width", () => {
  // The estimated total owns a line under the chips instead of floating to the
  // far right of the hero row, where wide layouts stranded it.
  expect(compactCss).toContain(".hero-total{margin:14px00}");
  expect(compactCss).not.toContain(".hero-metastrong{margin-left:auto");
  // Under 560px the stop card is a single column with a full-width action, so
  // the number chip, the points and the check-in stop drifting apart.
  expect(compactCss).toContain("@media(max-width:560px){.preview-expedition-view.stop-listli{padding:14px}");
  expect(compactCss).toContain(".preview-expedition-view.stop-action{flex-direction:column;align-items:stretch");
  // No number column survives, so the copy owns the card's full width.
  expect(compactCss).toContain(".stop-listli{grid-template-columns:minmax(0,1fr);gap:0");
  expect(compactCss).toMatch(/\.stop-source\{[^}]*position:absolute[^}]*right:14px/);
  expect(compactCss).toContain(".preview-expedition-view.stop-actionbutton,.preview-expedition-view.stop-done{width:100%");
});

it("gives the territory page one inset and puts the map above the summary cards", () => {
  // The page title used to pad twice: the view's inset plus its own.
  expect(compactCss).toContain(".territory-view{max-width:none;padding-inline:0}");
  expect(compactCss).toContain(".territory-view>.preview-page-title,.ranking-view>.preview-page-title{max-width:none;padding-inline:0}");
  // Four wide rows, not a four-column band that pushes the map off screen.
  expect(compactCss).toContain(".territory-summary-grid{display:grid;grid-template-columns:minmax(0,1fr)");
  // Phones show no scrollbar tracks at all.
  expect(compactCss).toContain("*{scrollbar-width:none}*::-webkit-scrollbar{width:0;height:0;display:none}");
  // The timeline only splits into two columns once there is real room.
  // The stacked timeline is the phone layout; wider screens right-align the meta.
  expect(compactCss).toContain("@media(min-width:768px){.record-historyli{grid-template-columns:minmax(0,1fr)auto");
});

it("keeps the phone-only record chrome out of the desktop stylesheet path", () => {
  // These rules were once nested inside the phone block, where they never matched.
  const desktop = compactCss.slice(compactCss.indexOf("@media(min-width:768px){.record-historyli"));
  expect(desktop).toContain(".record-history-meta{justify-content:flex-end");
  expect(desktop).toContain(".record-season-chip{display:none}");
  expect(compactCss).not.toContain("@media(max-width:767px){@media(min-width:768px)");
  // A shallower header bar at every width.
  expect(compactCss).toContain(".shell-status{min-height:clamp(42px,11vw,52px)");
});
