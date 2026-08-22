# K-Town Defense Team Preview Task 9 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship repeatable Vercel demo configuration, a bilingual full-product golden path, and auditable release evidence for the K-Town Defense team preview.

**Architecture:** Keep the preview on the existing demo session reducer and role/text-based public UI. Extend the build-owning deployment test to execute and inspect the Vercel artifact, use the existing nullable map configuration seam for jsdom, and localize TerritoryMap through the existing locale/copy boundary without test-only product branches.

**Tech Stack:** Node.js 22.13+, TypeScript 5.9, React 19, Vitest 4, Testing Library, Vinext/Vite, Nitro Vercel Build Output API.

**Spec:** `.superpowers/sdd/2026-08-22-ktown-defense-team-preview/task-9-brief.md`

## Global Constraints

- Use Node.js `>=22.13.0`, matching `web/package.json`.
- Demo mode must open inside the service shell; do not add a marketing landing page.
- Preserve the existing integrated membership, live place, and evidence-submission flows.
- Include all 14 spreadsheet artists plus SEVENTEEN; the exact slug order is defined in Task 1.
- Every selectable artist needs at least one sourced regional connection and two mission places.
- Direct artist connections require an `official` or `verified` evidence class and at least one HTTPS source URL.
- Nearby tourism recommendations must be labeled `nearby_recommendation` and must not claim a direct artist relationship.
- Private homes, schools, and sensitive personal addresses are not mission places.
- All territories are capturable; officially designated population-decline territories receive a visible multiplier greater than `1`.
- Fandom rank is ordered by stronghold count, then adjusted valid season points.
- Korean and English must cover the complete golden path.
- Missing Amazon Location configuration must show a configuration state plus an accessible territory list, never the decorative grid map.
- Browser-visible Amazon Location credentials must be restricted to required map actions and Vercel origins or referrers.
- Do not add backend credentials, Korea Tourism API secrets, or production identity data to the browser bundle.
- Every implementation task follows red-green-refactor and ends in a focused commit.

---

### Task 1: Deployment Contract and Release Documentation

**Files:**
- Modify: `web/tests/vercel-deployment.test.ts`
- Modify: `web/.env.example`
- Modify: `web/README.md`

**Interfaces:**
- Consumes: `npm run build:vercel`, `.vercel/output/config.json`, Nitro `__server.func`, and public/static output.
- Produces: the exact four-variable demo environment contract and a runnable artifact safety gate.

- [x] **Step 1: Extend the deployment test before editing configuration or documentation**

Assert the exact demo value, all three `NEXT_PUBLIC_AWS_LOCATION_*` variables, explicit map-action restriction language, explicit Vercel Preview and Production origin restriction language, and artifact output paths. Scan built text for secret names, database URLs, development user data, and localhost/private backend origins while allowing the public map variable name and example value.

- [x] **Step 2: Run `npm test -- vercel-deployment.test.ts` and record RED**

Expected: FAIL because `web/.env.example` lacks the three public map variables and `web/README.md` lacks the required restriction/reset/attribution/determinism contract.

- [x] **Step 3: Add the minimal environment and README contract**

Document `KTOWN_SERVICE_MODE=demo`, `NEXT_PUBLIC_AWS_LOCATION_API_KEY=example-restricted-map-key`, `NEXT_PUBLIC_AWS_LOCATION_REGION=ap-northeast-2`, and `NEXT_PUBLIC_AWS_LOCATION_STYLE=Standard`; map-action and Preview/Production HTTPS origin restrictions; deploy and reset steps; Amazon Location and geoBoundaries attribution; deterministic check-in, territory battle, and Korea Tourism content behavior; and the external pending restricted-key smoke check.

- [x] **Step 4: Run `npm test -- vercel-deployment.test.ts` and record GREEN**

Expected: PASS with Vercel output and artifact safety assertions green.

### Task 2: Bilingual Territory Map Handoff

**Files:**
- Modify: `web/tests/territory-map.test.tsx`
- Modify: `web/components/team-preview/territory-map.tsx`

**Interfaces:**
- Consumes: `DemoSession.locale`, `t(locale, key)`, and the existing configured/error/fallback render branches.
- Produces: localized configured-map name, configuration status, retry action, attribution names, and unchanged accessible territory controls.

- [x] **Step 1: Add an English configured/fallback/error accessibility regression before production edits**

Render `TerritoryMap` with an English session, assert English configured-map region and fallback status text, trigger a style failure and assert English retry text while proving Korean strings are absent.

- [x] **Step 2: Run `npm test -- territory-map.test.tsx` and record RED**

Expected: FAIL because the configured map name, configuration state, and retry action are currently Korean-only.

- [x] **Step 3: Localize TerritoryMap through locale-derived copy**

Use the existing i18n `mapConfigError` and `retry` keys plus localized map region and attribution accessible names. Do not add environment or test-mode branches.

- [x] **Step 4: Run `npm test -- territory-map.test.tsx` and record GREEN**

Expected: PASS for configured, missing-config, failure/retry, GeoJSON identity, and layer/list equivalence.

### Task 3: Full Role/Text Golden Path

**Files:**
- Create: `web/tests/team-preview-golden-path.test.tsx`
- Modify: `web/tests/fan-journey.test.tsx`

**Interfaces:**
- Consumes: `<KTownApp mode="demo" mapConfig={null} />`, locale controls, artist drawer/search, map-equivalent territory list, expedition/check-in flow, ranking/record tabs, `DEMO_SESSION_KEY`, and scoped reset dialog.
- Produces: one public-UI golden path covering bilingual entry, sourced direct/nearby content, deterministic award impact, ranking, record, persistence, and reset.

- [x] **Step 1: Write the complete golden-path test before any selector stabilization**

Render the service shell; switch English then Korean; open the artist drawer; search and select BTS; choose the population-decline/contested recommendation; inspect a direct HTTPS connection source and one nearby recommendation source; run demo evidence with local spending; review and submit; assert `260P` and territory-share/stronghold/rank before→after output; navigate to Ranking and My Record; unmount/remount and prove persisted mission state; reset and prove only the preview key was removed and the localized start panel returned.

- [x] **Step 2: Run `npm test -- vercel-deployment.test.ts team-preview-golden-path.test.tsx territory-map.test.tsx` and record RED**

Expected: golden path or localization selectors fail until the public UI and contract are complete.

- [x] **Step 3: Make only public role/label/text selector fixes needed for GREEN**

Keep map configuration injected as `null`, operate through the accessible territory list, and make no `NODE_ENV` test branches.

- [x] **Step 4: Run the focused release matrix and record GREEN**

Run `npm test -- vercel-deployment.test.ts team-preview-golden-path.test.tsx fan-journey.test.tsx territory-map.test.tsx` and expect all tests to pass.

### Task 4: Release Verification and Evidence

**Files:**
- Create: `.superpowers/sdd/2026-08-22-ktown-defense-team-preview/task-9-report.md`
- Modify: `.superpowers/sdd/2026-08-22-ktown-defense-team-preview/progress.md`

**Interfaces:**
- Consumes: the complete web suite, ESLint, standard Vinext build, Vercel build, committed content catalog, public source URLs, and git diff/status.
- Produces: reproducible Task 9 release evidence and a clean focused commit for browser-verification handoff.

- [x] **Step 1: Run source coverage and availability checks**

Assert all 15 artists have sourced connections and playable expeditions; issue bounded HTTPS requests to public artist/profile sources where practical and record status evidence without weakening content for transient failures.

- [x] **Step 2: Run full verification**

Run `npm test`, `npm run lint`, `npm run build`, `npm run build:vercel`, the focused artifact inspection, `git diff --check`, and a forbidden-pattern scan of `.vercel/output`.

- [x] **Step 3: Write the report and ledger update**

Record RED/GREEN outputs, passing counts, build output existence, artifact safety, source availability evidence, and the external pending live restricted-AWS-key desktop/mobile smoke check. State explicitly that no deploy or publish occurred.

- [x] **Step 4: Commit the focused release verification**

Stage only Task 9 implementation, tests, plan, report, and ledger files, then commit with `test(web): verify the K-Town team preview journey`.
