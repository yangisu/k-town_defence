# Vercel Demo Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the existing Cloudflare/Sites workflow while adding a reproducible Vercel Preview and Production build for the K-Town Defense demo frontend.

**Architecture:** Keep `web/vite.config.ts` as the Cloudflare-specific build and add a second Vite configuration that combines `vinext` with Nitro's Vercel preset. Vercel deploys only the `web` directory in `demo` mode; FastAPI, PostgreSQL, uploads, and production identity remain outside this phase.

**Tech Stack:** Node.js >=22.13, React 19.2.6, vinext 1.0.0-beta.2, Vite 8.0.13, Nitro 3.0.260610-beta, Tailwind CSS 4.3.3, Vitest 4.1.10, Vercel

**Spec:** `docs/superpowers/specs/2026-08-22-vercel-demo-frontend-design.md`

## Global Constraints

- The Vercel project Root Directory is exactly `web`.
- Preview and Production use `KTOWN_SERVICE_MODE=demo` until the AWS API and Vercel-compatible identity adapter exist.
- Do not set `KTOWN_API_BASE_URL`, `KTOWN_DEV_USER_ID`, `KTOUR_SERVICE_KEY`, or a database URL in this deployment phase.
- Do not add any secret or deployment identifier to Git; `.vercel/` and `.env.local` remain ignored.
- Keep existing `npm run dev`, `npm run build`, and the Cloudflare/Sites Vite configuration operational.
- Build Vercel output with `NITRO_PRESET=vercel` and verify `.vercel/output/config.json` exists.

## File Structure

- Create `web/vite.config.vercel.ts`: isolated vinext + Nitro Vercel build graph.
- Create `web/vercel.json`: repository-owned Vercel build contract.
- Create `web/tests/vercel-deployment.test.ts`: static deployment contract tests.
- Modify `web/package.json`: pin Nitro and add `build:vercel`.
- Modify `web/package-lock.json`: lock the Nitro dependency graph.
- Modify `web/.env.example`: document local integrated values and the Vercel demo override without adding secrets.
- Modify `web/README.md`: document import, environment, preview validation, production promotion, and future AWS handoff.
- Modify `docs/superpowers/plans/2026-08-22-vercel-demo-frontend.md`: mark completed steps as execution progresses.

---

### Task 1: Add a Tested Vercel Build Contract

**Files:**
- Create: `web/tests/vercel-deployment.test.ts`
- Create: `web/vite.config.vercel.ts`
- Create: `web/vercel.json`
- Modify: `web/package.json`
- Modify: `web/package-lock.json`

**Interfaces:**
- Consumes: the existing `vinext()` plugin and Vite 8 configuration API.
- Produces: npm script `build:vercel`, Vite config `vite.config.vercel.ts`, and Vercel project config `vercel.json`.

- [x] **Step 1: Write the failing deployment contract test**

```ts
import { existsSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("Vercel deployment", () => {
  it("builds a Nitro artifact without local backend or secret configuration", () => {
    rmSync(".vercel/output", { recursive: true, force: true });
    const result = spawnSync("npm", ["run", "build:vercel"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, KTOWN_SERVICE_MODE: "demo" },
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(existsSync(".vercel/output/config.json")).toBe(true);
    const artifact = readFileSync(
      ".vercel/output/functions/__server.func/_ssr/route.mjs",
      "utf8",
    );
    expect(artifact).not.toMatch(/127\.0\.0\.1:8000|KTOUR_SERVICE_KEY/);
  }, 120_000);
});
```

- [x] **Step 2: Run the test to verify RED**

Run: `cd web && npm test -- --run tests/vercel-deployment.test.ts`

Expected: FAIL because the `build:vercel` script does not exist.

- [x] **Step 3: Install the pinned Nitro adapter**

Run: `cd web && npm install --save-dev --save-exact nitro@3.0.260610-beta`

Expected: `package.json` and `package-lock.json` contain exactly `3.0.260610-beta`.

- [x] **Step 4: Add the isolated Vercel Vite configuration**

```ts
import vinext from "vinext";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vinext(), tailwindcss(), nitro()],
});
```

- [x] **Step 5: Add the package script and Vercel config**

Add this script to `web/package.json`:

```json
"build:vercel": "cross-env NITRO_PRESET=vercel vite build --config vite.config.vercel.ts"
```

Create `web/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nitro",
  "buildCommand": "npm run build:vercel"
}
```

- [x] **Step 6: Run the deployment contract test to verify GREEN**

Run: `cd web && npm test -- --run tests/vercel-deployment.test.ts`

Expected: 1 test file and 1 test PASS.

- [x] **Step 7: Commit the build contract**

```bash
git add web/tests/vercel-deployment.test.ts web/vite.config.vercel.ts web/vercel.json web/package.json web/package-lock.json docs/superpowers/plans/2026-08-22-vercel-demo-frontend.md
git commit -m "build(web): add Vercel Nitro target"
```

---

### Task 2: Prove the Vercel Artifact Is Deployable

**Files:**
- Modify if required by the real build only: `web/vite.config.vercel.ts`
- Modify if required by the real build only: `web/vercel.json`
- Modify: `web/tests/vercel-deployment.test.ts`

**Interfaces:**
- Consumes: `npm run build:vercel` from Task 1.
- Produces: `.vercel/output` with Build Output API v3 configuration, a Vercel function, and public assets.

- [x] **Step 1: Run the Vercel build and capture the initial result**

Run: `cd web && npm run build:vercel`

Expected: either a successful `.vercel/output` build or a concrete Nitro/vinext compatibility error. Do not change the existing Cloudflare config to resolve Vercel-only errors.

- [x] **Step 2: Add artifact assertions to the contract test**

Append a test that uses `existsSync` after the build:

```ts
it("emits the Nitro Vercel artifact", () => {
  expect(existsSync(".vercel/output/config.json")).toBe(true);
  expect(existsSync(".vercel/output/functions/__server.func/index.mjs")).toBe(true);
});
```

- [x] **Step 3: Run the contract test against the built artifact**

Run: `cd web && npm test -- --run tests/vercel-deployment.test.ts`

Expected: 3 tests PASS. If Nitro emits a different documented Vercel entrypoint, update the assertion to that exact emitted path and record it in the README.

- [x] **Step 4: Scan the artifact for forbidden configuration**

Run from the repository root:

```powershell
$matches = rg -l "KTOUR_SERVICE_KEY|postgresql\+asyncpg|KTOWN_DEV_USER_ID=|127\.0\.0\.1:8000" web/.vercel/output
if ($matches) { $matches; exit 1 }
```

Expected: exit code 0 with no matching files.

- [x] **Step 5: Re-run the existing Cloudflare/Sites build**

Run: `cd web && npm run build`

Expected: exit code 0 and existing vinext route summary remains present.

- [x] **Step 6: Commit any compatibility correction and artifact test**

```bash
git add web/tests/vercel-deployment.test.ts web/vite.config.vercel.ts web/vercel.json docs/superpowers/plans/2026-08-22-vercel-demo-frontend.md
git commit -m "test(web): verify Vercel deployment artifact"
```

---

### Task 3: Document Safe Vercel Connection and Verify Regressions

**Files:**
- Modify: `web/.env.example`
- Modify: `web/README.md`
- Modify: `web/tests/vercel-deployment.test.ts`

**Interfaces:**
- Consumes: the `web` Root Directory, `build:vercel`, and `.vercel/output` contract.
- Produces: an operator runbook that does not require repository secrets and a test-enforced demo-mode deployment boundary.

- [x] **Step 1: Review the environment runbook against the deployment contract**

Confirm that Preview and Production require only `KTOWN_SERVICE_MODE=demo`,
while local integrated values stay in the ignored `.env.local` workflow.

- [x] **Step 2: Confirm the prior runbook lacks the approved Vercel workflow**

Inspect the pre-change `web/README.md` and confirm it documents only the
Cloudflare/Sites and local integrated workflows.

- [x] **Step 3: Document environment separation**

Add this non-secret comment to `web/.env.example` while preserving local integrated values:

```dotenv
# Vercel Preview/Production: KTOWN_SERVICE_MODE=demo만 설정한다.
# AWS 연동 전에는 아래 API URL과 개발 사용자 ID를 Vercel에 설정하지 않는다.
```

- [x] **Step 4: Add the exact Dashboard workflow to the README**

Document these values:

```text
Import Git Repository: yangisu/k-town_defence
Root Directory: web
Framework Preset: Nitro
Build Command: npm run build:vercel
Output Directory: leave the Dashboard override disabled; Nitro emits `.vercel/output`
Environment Variable (Preview, Production): KTOWN_SERVICE_MODE=demo
```

Also document Preview checks for `/`, demo fandom selection, explore navigation, and demo check-in start; Production promotion; and the future AWS variables and identity prerequisite.

- [x] **Step 5: Review the completed runbook for exact values and secret safety**

Confirm the runbook states `web`, `Nitro`, `npm run build:vercel`, no Output
Directory override, and `KTOWN_SERVICE_MODE=demo`, and contains no token value.

- [x] **Step 6: Run the complete web verification**

Run each command from `web`:

```bash
npm test -- --run
npm run lint
npm run build
npm run build:vercel
```

Expected: all test files PASS, lint exits 0, and both build targets exit 0.

- [x] **Step 7: Verify repository hygiene**

Run from the repository root:

```powershell
git diff --check
git status --short
git ls-files | Select-String -Pattern '(^|/)(\.vercel|\.env\.local)($|/)'
```

Expected: no whitespace errors, only task files plus pre-existing user changes are visible, and no local Vercel or environment files are tracked.

- [x] **Step 8: Commit the runbook**

```bash
git add web/.env.example web/README.md web/tests/vercel-deployment.test.ts docs/superpowers/plans/2026-08-22-vercel-demo-frontend.md
git commit -m "docs(web): add Vercel deployment runbook"
```

---

### Task 4: Preview Deployment Handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-08-22-vercel-demo-frontend.md`

**Interfaces:**
- Consumes: a Vercel account authorized for `yangisu/k-town_defence` and the tested repository configuration.
- Produces: either a READY Preview URL or an exact external account action needed before deployment.

- [ ] **Step 1: Check Vercel CLI authentication without printing secrets**

Run: `cd web && npx vercel whoami`

Expected: the authenticated account name, or an authentication error with no repository mutation.

- [ ] **Step 2: Link and deploy a Preview when account authorization is available**

Run from `web`:

```bash
npx vercel link --yes --project k-town-defence
npx vercel deploy --yes
```

Expected: ignored `.vercel/` metadata and a READY Preview URL. Do not use `--prod` before the Preview smoke test succeeds.

- [ ] **Step 3: Smoke-test the Preview**

Verify over HTTPS:

```text
GET / -> 200
팬덤 선택 -> 데모 홈 표시
탐색 탭 -> 데모 장소 표시
체크인 시작 -> 데모 체크인 단계 표시
```

- [ ] **Step 4: Record the outcome**

If authorization is unavailable, stop after the repository is deployment-ready and report the exact Dashboard import and environment steps. If Preview succeeds, record its URL and deployment status without committing account IDs or tokens.
