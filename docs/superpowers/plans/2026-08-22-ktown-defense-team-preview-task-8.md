# K-Town Defense Team Preview Task 8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the preview's responsive presentation and keyboard/screen-reader contracts without changing integrated service behavior.

**Architecture:** Keep the existing preview composition and reducer ownership intact. Add reusable modal focus management to the artist drawer, reset dialog, and shared check-in flow; express stronghold stages through semantic markup and CSS silhouettes; and make the existing map/list/tactical composition responsive entirely through stable classes and media queries.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, MapLibre GL, CSS.

**Spec:** `docs/superpowers/plans/2026-08-22-ktown-defense-team-preview.md` Task 8 and `.superpowers/sdd/2026-08-22-ktown-defense-team-preview/task-8-brief.md`

## Global Constraints

- Use Node.js `>=22.13.0`, matching `web/package.json`.
- Preserve demo mode inside the service shell and all integrated membership, live-place, and evidence-submission flows.
- Missing Amazon Location configuration retains the configuration state, accessible territory list, and visible Amazon Location/geoBoundaries attribution.
- Korean and English remain complete for the golden path.
- Every production change follows a witnessed red-green cycle.

---

### Task 1: Accessibility interaction contract

**Files:**
- Create: `web/tests/team-preview-accessibility.test.tsx`
- Modify: `web/components/team-preview/artist-drawer.tsx`
- Modify: `web/features/ktown-app.tsx`
- Modify: `web/components/check-in/check-in-flow.tsx`
- Create: `web/components/ui/use-modal-focus.ts`

**Interfaces:**
- Consumes: existing public buttons, dialogs, session/provider behavior, and check-in impact output.
- Produces: `useModalFocus(containerRef, initialFocusRef, onClose)` with Tab/Shift+Tab trapping, Escape close, invoking-control focus return, and dialog-title initial focus.

- [ ] Write Testing Library tests that open the artist drawer from its public trigger, verify initial focus and Tab wrapping, close with Escape, and assert focus returns to the trigger.
- [ ] Add equivalent check-in dialog title focus/trapping/Escape/return assertions using the public expedition route.
- [ ] Assert the reset control has a localized accessible name, the reset title receives focus, Escape cancels, focus returns, and exactly one navigation button is current among the visible desktop navigation items.
- [ ] Assert locale controls are grouped by a localized accessible label, mission impact is a polite live region with the complete before/after summary, and filtered territory buttons retain selection and accessible stage names.
- [ ] Run `cd web && npm test -- team-preview-accessibility.test.tsx` and capture expected failures before implementation.
- [ ] Implement only the shared focus hook and semantic attributes required by the failing tests, then rerun the focused suite to green.

### Task 2: Responsive and reduced-motion contract

**Files:**
- Create: `web/tests/team-preview-responsive-contract.test.ts`
- Modify: `web/app/globals.css`
- Modify: `web/components/team-preview/tactical-panel.tsx`
- Modify: `web/components/team-preview/record-view.tsx`
- Modify: `web/components/team-preview/territory-map.tsx`

**Interfaces:**
- Consumes: `.preview-map-layout`, `.preview-territory-map`, `.tactical-panel`, `.artist-drawer`, MapLibre's `.maplibregl-map`, and `StrongholdStage`.
- Produces: desktop `minmax(0,1fr) 360px`, mobile `52dvh` map plus scrollable safe-area tactical sheet, visible focus, and semantic seed/tree/landmark marks with distinct silhouettes and names.

- [ ] Write a source contract test for the exact 768px desktop split, max-width 767px mobile map/sheet/safe-area rules, MapLibre sizing/attribution, visible focus, reduced motion, and absence of `.territory-map .map-grid` from preview components.
- [ ] Add render assertions that seed, tree, and landmark expose distinct localized labels and accessible names independent of motion.
- [ ] Run `cd web && npm test -- team-preview-accessibility.test.tsx team-preview-responsive-contract.test.ts` and capture expected contract failures.
- [ ] Add minimal semantic stage markup and scoped CSS, ensuring the mobile sheet scrolls while its primary action remains above `env(safe-area-inset-bottom)` and attribution stays visible.
- [ ] Rerun both Task 8 tests, then `npm test -- team-preview` to green.

### Task 3: Verification, report, and focused commit

**Files:**
- Create: `.superpowers/sdd/2026-08-22-ktown-defense-team-preview/task-8-report.md`
- Modify: `.superpowers/sdd/2026-08-22-ktown-defense-team-preview/progress.md`

**Interfaces:**
- Consumes: the completed Task 8 diff and fresh command output.
- Produces: verification evidence and the required focused commit.

- [ ] Run `cd web && npm test -- team-preview` and record exact file/test totals.
- [ ] Run `cd web && npm test`, `npm run lint`, and `npm run build`; record exact outcomes and unchanged warnings.
- [ ] Run `git diff --check`, inspect `git diff --stat`, and confirm no preview component uses `.map-grid`.
- [ ] Write `task-8-report.md`, update the progress ledger, stage only intentional Task 8 files, and commit as `feat(web): polish preview responsiveness and accessibility`.
