# K-Town Defense Personalized Territory UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn fandom selection into persistent profile setup, personalize and clarify the territory map, prioritize evidence-backed artist destinations, and redesign Ranking and My Record as actionable dashboards.

**Architecture:** Keep `DemoSession` as the single client-side source of truth and preserve integrated mode. Add focused profile, map-presentation, and expedition-selection units around the existing preview catalog; Ranking and My Record remain projections of the same territory and check-in state.

**Tech Stack:** TypeScript 5.9, React 19, vinext/Vite, Vitest, Testing Library, MapLibre GL JS 5, CSS

**Spec:** `docs/superpowers/specs/2026-08-23-ktown-personalized-territory-ux-design.md`

## Global Constraints

- Use Node.js `>=22.13.0`, matching `web/package.json`.
- Preserve integrated mode and all backend service contracts.
- `DemoSession` is the only persisted profile, battle, and check-in state.
- Color means fandom ownership; size means stronghold stage.
- Use exact role labels `내 팬덤`, `목표 지역`, `현재 소유`, `도전자`, and `지역 연결 스토리` in Korean and equivalent explicit English labels.
- Remove `게스트 데모` and unexplained compact rank text from the profile identity area.
- A direct artist place must be public, visitable, non-sensitive, claim-specific, and source-backed.
- Public-only routes must be named `지역 응원 원정`, not artist-branded expeditions.
- Do not use private homes, schools, or sensitive personal addresses.
- Korean and English must cover every changed flow.
- Every task follows red-green-refactor and ends with a focused commit.

## File Structure

### New focused units

- `web/components/team-preview/profile-setup.tsx` — blocking first-run fandom profile setup.
- `web/components/team-preview/profile-menu.tsx` — compact header identity and profile-change control.
- `web/features/team-preview/map-presentation.ts` — pure owner-color, stage-radius, and bounds helpers.
- `web/features/team-preview/expedition-selection.ts` — pure evidence-aware route classification and fallback selection.

### Existing units to modify

- `web/features/ktown-app.tsx` — entry/profile routing and changed screen callbacks.
- `web/features/team-preview/demo-session.ts` — safe profile change transition and versioned persistence contract.
- `web/components/app-shell.tsx` — explicit profile identity instead of guest/rank shorthand.
- `web/components/team-preview/artist-drawer.tsx` — reusable selection content with explicit confirmation.
- `web/components/team-preview/territory-view.tsx` — personalized map summary and territory navigation.
- `web/components/team-preview/territory-map.tsx` — semantic map layers, selection camera, and national reset.
- `web/components/team-preview/territory-list.tsx` — explicit owner/target labels.
- `web/components/team-preview/stronghold-mark.tsx` — owner-colored, size-only stage presentation.
- `web/components/team-preview/tactical-panel.tsx` — role-separated ownership and artist-story copy.
- `web/components/team-preview/expedition-view.tsx` — artist-first and regional-support route heroes.
- `web/components/team-preview/ranking-view.tsx` — podium, selected-fandom goal, leaderboard, and contested cards.
- `web/components/team-preview/record-view.tsx` — summary, progression, timeline, rewards, and empty state.
- `web/features/team-preview/i18n.ts` — complete Korean/English copy.
- `web/lib/demo-preview/missions.ts` — honest expedition classification and qualified direct-place fixtures.
- `web/app/globals.css` — responsive visual system for all changed views.

---

### Task 1: Persistent Profile Setup and Explicit Identity

**Files:**
- Create: `web/components/team-preview/profile-setup.tsx`
- Create: `web/components/team-preview/profile-menu.tsx`
- Modify: `web/components/team-preview/artist-drawer.tsx`
- Modify: `web/features/team-preview/demo-session.ts`
- Modify: `web/features/team-preview/i18n.ts`
- Modify: `web/features/ktown-app.tsx`
- Modify: `web/components/app-shell.tsx`
- Test: `web/tests/team-preview-entry.test.tsx`
- Test: `web/tests/team-preview-session.test.ts`
- Test: `web/tests/team-preview-i18n.test.ts`

**Interfaces:**
- Consumes: `previewContent.artists`, `getArtistHomeTerritories()`, `DemoSessionAction`, and `saveDemoSession()`.
- Produces: `ProfileSetup`, `ProfileMenu`, and reducer action `{ type: "changeProfile"; artistId: ArtistId }`.

- [ ] **Step 1: Write failing profile-flow tests**

Add these behaviors to `team-preview-entry.test.tsx`:

```tsx
it("requires profile setup before showing the territory workspace", async () => {
  renderTeamPreview();
  expect(screen.getByRole("heading", { name: "응원할 아티스트를 선택하세요" })).toBeVisible();
  expect(screen.queryByRole("region", { name: "대한민국 팬덤 영토 지도" })).not.toBeInTheDocument();
  expect(screen.queryByText("게스트 데모")).not.toBeInTheDocument();
});

it("confirms a fandom profile and exposes an explicit profile control", async () => {
  const user = userEvent.setup();
  renderTeamPreview();
  await user.click(screen.getByRole("radio", { name: /방탄소년단.*ARMY/ }));
  await user.click(screen.getByRole("button", { name: "이 팬덤으로 시작" }));
  expect(screen.getByRole("button", { name: "내 팬덤 · ARMY" })).toBeVisible();
  expect(screen.getByRole("region", { name: "대한민국 팬덤 영토 지도" })).toBeVisible();
});
```

In `team-preview-session.test.ts`, prove that `changeProfile` preserves
`approvedCheckIns` and `completedExpeditionIds`, clears
`selectedExpeditionId`, selects a representative territory for the new artist,
and returns `activeTab` to `explore`.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `cd web && npm test -- team-preview-entry.test.tsx team-preview-session.test.ts team-preview-i18n.test.ts`

Expected: FAIL because the setup screen, confirmation action, and
`changeProfile` action do not exist.

- [ ] **Step 3: Implement the profile transition in the reducer**

Add the exact action:

```ts
| { type: "changeProfile"; artistId: ArtistId }
```

Its transition must set `artistConfirmed: true`, set the new artist, choose the
first territory from `getArtistHomeTerritories(artistId)`, set
`activeTab: "explore"`, and clear `selectedExpeditionId`. Do not clear battle or
record fields. Keep `selectArtist` as a compatibility alias only if existing
tests still require it; new UI code dispatches `changeProfile`.

- [ ] **Step 4: Implement setup and profile controls**

`ProfileSetup` owns a temporary radio selection and dispatches only after the
confirmation button is pressed. `ProfileMenu` renders `내 팬덤 · {fandom}` and
opens the reusable artist selector. Disable primary navigation while setup is
incomplete. Remove the shell's `guestDemo` identity and compact `#rank` output;
ranking views remain the only location for rank identity.

- [ ] **Step 5: Complete bilingual copy and rerun tests**

Add typed keys for setup explanation, confirmation, profile change, `myFandom`,
and explicit rank wording. Run the Step 2 command.

Expected: PASS.

- [ ] **Step 6: Commit the profile flow**

```bash
git add web/components/team-preview/profile-setup.tsx web/components/team-preview/profile-menu.tsx web/components/team-preview/artist-drawer.tsx web/features/team-preview/demo-session.ts web/features/team-preview/i18n.ts web/features/ktown-app.tsx web/components/app-shell.tsx web/tests/team-preview-entry.test.tsx web/tests/team-preview-session.test.ts web/tests/team-preview-i18n.test.ts
git commit -m "feat(web): make fandom choice a persistent profile"
```

### Task 2: One-Legend Map Presentation and Territory Zoom

**Files:**
- Create: `web/features/team-preview/map-presentation.ts`
- Create: `web/tests/team-preview-map-presentation.test.ts`
- Modify: `web/components/team-preview/territory-map.tsx`
- Modify: `web/components/team-preview/territory-list.tsx`
- Modify: `web/components/team-preview/stronghold-mark.tsx`
- Modify: `web/components/team-preview/map-filters.tsx`
- Modify: `web/tests/team-preview-territory.test.tsx`
- Modify: `web/app/globals.css`

**Interfaces:**
- Consumes: `PreviewTerritory`, `StrongholdStage`, artist colors, GeoJSON boundary features, and selected artist/territory IDs.
- Produces: `strongholdRadius(stage): 7 | 11 | 16`, `territoryBounds(feature): [[number, number], [number, number]] | null`, owner-colored layers, and national camera reset.

- [ ] **Step 1: Write failing pure map-presentation tests**

```ts
expect(strongholdRadius("seed")).toBe(7);
expect(strongholdRadius("tree")).toBe(11);
expect(strongholdRadius("landmark")).toBe(16);
expect(territoryBounds(gwangjuPolygon)).toEqual([[126.7, 35.0], [127.0, 35.3]]);
```

Also assert that owner color does not vary by stage and invalid or empty
geometry returns `null` rather than throwing.

- [ ] **Step 2: Write failing component contracts**

In `team-preview-territory.test.tsx`, assert that the personalized filter is
labeled `내 팬덤`, the selected fandom summary reports owned territory count,
territory cards include `현재 소유 · ONEDOOR`, and a `전국 보기` button is
available after selecting a territory.

- [ ] **Step 3: Run tests and verify failure**

Run: `cd web && npm test -- team-preview-map-presentation.test.ts team-preview-territory.test.tsx territory-map.test.tsx`

Expected: FAIL on missing helpers and old card/filter labels.

- [ ] **Step 4: Implement semantic MapLibre layers**

Use owner color for fill and stronghold markers. Replace stage glyph/color
encoding with a circle layer whose diameter expression is:

```ts
["match", ["get", "stage"], "seed", 7, "tree", 11, "landmark", 16, 7]
```

Assign this expression to `circle-radius`, yielding the specified 14, 22, and
32 px marker diameters.

Add a selected-fandom ownership outline filtered by `ownerArtistId`, and use a
neutral high-contrast selected-territory outline. Keep text/ARIA stage labels.

- [ ] **Step 5: Implement polygon fit and national reset**

On polygon or accessible-card selection, call `map.fitBounds(bounds, {
padding: { top: 56, right: 420, bottom: 56, left: 56 }, maxZoom: 9,
duration: reducedMotion ? 0 : 700 })`. At widths below `768px`, use uniform
`32` padding. `전국 보기` calls `fitBounds([[124.5, 32.8], [131.9, 38.9]])`.

- [ ] **Step 6: Align the accessible list and visual CSS**

Cards show territory, explicit owner, owner-colored marker, stage, and
defend/capture gap. CSS custom property `--owner-color` controls color while
stage modifiers control only width and height.

- [ ] **Step 7: Run map tests and commit**

Run the Step 3 command; expected PASS.

```bash
git add web/features/team-preview/map-presentation.ts web/components/team-preview/territory-map.tsx web/components/team-preview/territory-list.tsx web/components/team-preview/stronghold-mark.tsx web/components/team-preview/map-filters.tsx web/tests/team-preview-map-presentation.test.ts web/tests/team-preview-territory.test.tsx web/app/globals.css
git commit -m "feat(web): clarify fandom ownership on the territory map"
```

### Task 3: Explicit Territory Context and Evidence-First Expeditions

**Files:**
- Create: `web/features/team-preview/expedition-selection.ts`
- Create: `web/tests/team-preview-expedition-selection.test.ts`
- Modify: `web/features/team-preview/types.ts`
- Modify: `web/features/team-preview/content.ts`
- Modify: `web/components/team-preview/objective-strip.tsx`
- Modify: `web/components/team-preview/tactical-panel.tsx`
- Modify: `web/components/team-preview/expedition-view.tsx`
- Modify: `web/lib/demo-preview/missions.ts`
- Modify: `web/tests/team-preview-expedition.test.tsx`
- Modify: `web/tests/team-preview-golden-path.test.tsx`

**Interfaces:**
- Consumes: `PreviewExpedition`, `PreviewMissionPlace`, `ArtistConnection`, selected artist ID, and territory ID.
- Produces: `PlaceAccess = "public" | "restricted" | "sensitive"`, `selectRecommendedExpedition(artistId, territoryId, catalog?): { kind: "artist_linked" | "regional_support"; expedition: PreviewExpedition } | null`, and explicit context labels.

- [ ] **Step 1: Write failing selector tests**

```ts
it("prefers a route with an eligible artist-linked first stop", () => {
  const result = selectRecommendedExpedition("bts", "busan", syntheticCatalog({
    firstStop: artistPlace({ access: "public", evidenceClass: "verified", claimSpecific: true }),
  }));
  expect(result?.kind).toBe("artist_linked");
  expect(result?.expedition.stopIds[0]).toBe("verified-public-artist-stop");
});

it("labels a public-only fallback as regional support", () => {
  const result = selectRecommendedExpedition("bts", "gwangju", syntheticCatalog({
    firstStop: nearbyPlace({ access: "public" }),
  }));
  expect(result?.kind).toBe("regional_support");
  expect(result?.expedition.title.ko).toContain("지역 응원 원정");
  expect(result?.expedition.title.ko).not.toContain("BTS");
});
```

The test-local `syntheticCatalog`, `artistPlace`, and `nearbyPlace` builders
return complete `PreviewMissionPlace` and `PreviewExpedition` fixtures; they are
defined at the top of the test file and are not shipped in product code. The
eligibility helper must reject direct places whose `access` is not `public`,
that lack a claim-specific source, or that have neither `official` nor
`verified` evidence.

- [ ] **Step 2: Write the Gwangju context regression test**

Render BTS with Gwangju selected and assert all of these exact roles are visible:

```text
내 팬덤 · ARMY
목표 지역 · 광주
현재 소유 · ONEDOOR
도전자 · ARMY
지역 연결 스토리 · 제이홉
```

Assert that the public-only route does not contain `BTS 광주 원정` or
`아티스트 연관 장소 중심`.

- [ ] **Step 3: Run selector, expedition, and golden-path tests**

Run: `cd web && npm test -- team-preview-expedition-selection.test.ts team-preview-expedition.test.tsx team-preview-golden-path.test.tsx`

Expected: FAIL because the current selector always falls back to a public
expedition while preserving artist context.

- [ ] **Step 4: Implement evidence-aware route selection**

An artist-linked expedition is eligible only when at least one stop has
`relationship === "artist_connection"`, a non-null `evidenceClass` of
`official` or `verified`, `access === "public"`, and at least one
claim-specific HTTPS source. Add required `access: PlaceAccess` to
`PreviewMissionPlace`; assign `public` to current official-tourism fixtures.
Search the selected territory first, then connected territories ordered by
geographic distance, then the selected territory's `regional_support` route.

- [ ] **Step 5: Normalize demo route content**

Rename every public-only fixture to `{territory} 지역 응원 원정` and set
`artistId: null`. Keep artist-linked fixtures only where their first stop meets
the evidence policy. Do not invent direct locations during implementation;
new fixtures require recorded source URLs and a content-integrity test.

- [ ] **Step 6: Separate ownership and story in the UI**

`ObjectiveStrip` shows `내 팬덤` and `목표 지역`. `TacticalPanel` separately
renders owner, challenger, and regional story. `ExpeditionView` uses
`아티스트 연관 장소 중심` only for `artist_linked` and `지역을 응원하는 공공
관광 코스` for `regional_support`.

- [ ] **Step 7: Run tests and commit**

Run the Step 3 command; expected PASS.

```bash
git add web/features/team-preview/expedition-selection.ts web/features/team-preview/types.ts web/features/team-preview/content.ts web/components/team-preview/objective-strip.tsx web/components/team-preview/tactical-panel.tsx web/components/team-preview/expedition-view.tsx web/lib/demo-preview/missions.ts web/tests/team-preview-expedition-selection.test.ts web/tests/team-preview-expedition.test.tsx web/tests/team-preview-golden-path.test.tsx
git commit -m "feat(web): prioritize verified artist-linked expeditions"
```

### Task 4: Ranking Dashboard

**Files:**
- Modify: `web/components/team-preview/ranking-view.tsx`
- Modify: `web/features/team-preview/i18n.ts`
- Modify: `web/tests/team-preview-ranking.test.tsx`
- Modify: `web/app/globals.css`

**Interfaces:**
- Consumes: `rankFandoms()`, `isContestedTerritory()`, `territoryGap()`, selected artist ID, and territory-selection callback.
- Produces: top-three podium, selected-fandom goal card, full leaderboard, and actionable contested-territory cards.

- [ ] **Step 1: Write failing ranking presentation tests**

Assert three podium list items, an explicit `내 팬덤 · ARMY` card, `팬덤 순위
1위`, stronghold-first ordering, a progress element with an accessible name,
and contested cards containing owner/challenger/gap. Clicking a contested card
must call `onInspectTerritory(territoryId)`.

- [ ] **Step 2: Run the ranking test and verify failure**

Run: `cd web && npm test -- team-preview-ranking.test.tsx`

Expected: FAIL because the current component renders one flat ordered list and
has no territory action.

- [ ] **Step 3: Implement the dashboard without alternate ranking state**

Use the first three entries from `rankFandoms()` for the podium and the same
array for the leaderboard. Calculate selected progress as
`selected.strongholds / max(next.strongholds + 1, 1)` clamped to `[0, 1]`;
render the exact stronghold gap text beside the bar. Do not change ranking
rules.

- [ ] **Step 4: Implement responsive and accessible ranking CSS**

Desktop uses a three-card podium and two-column dashboard; mobile uses a
horizontal podium scroller and one-column cards. Color accents use artist color
with WCAG-readable text; rank, labels, and numbers remain visible without color.

- [ ] **Step 5: Run the ranking test and commit**

Run the Step 2 command; expected PASS.

```bash
git add web/components/team-preview/ranking-view.tsx web/features/team-preview/i18n.ts web/tests/team-preview-ranking.test.tsx web/app/globals.css
git commit -m "feat(web): turn rankings into an actionable dashboard"
```

### Task 5: My Record Season Dashboard

**Files:**
- Modify: `web/components/team-preview/record-view.tsx`
- Modify: `web/features/team-preview/i18n.ts`
- Modify: `web/tests/team-preview-record.test.tsx`
- Modify: `web/app/globals.css`

**Interfaces:**
- Consumes: `DemoSession.approvedCheckIns`, completed expeditions, place/territory catalog, and `StrongholdMark`.
- Produces: season hero, metric cards, growth track, activity timeline, reward collection, and `onExploreTerritories()` empty-state action.

- [ ] **Step 1: Write failing populated and empty-state tests**

For a session with approved check-ins, assert a `내 시즌 요약` region,
contribution rank, four labeled metrics, all three growth stages, a
reverse-chronological timeline, and unlocked/locked reward labels. For an empty
session, assert `아직 원정 기록이 없어요` and an enabled `영토 둘러보기`
button that invokes the callback.

- [ ] **Step 2: Run the record test and verify failure**

Run: `cd web && npm test -- team-preview-record.test.tsx`

Expected: FAIL because the current record is a flat summary/history/reward
layout and has no empty-state action.

- [ ] **Step 3: Derive all record presentation from session history**

Calculate approved check-in count, influenced territory set, highest achieved
stage, contribution rank, and timeline rows with pure local selectors. Sort the
timeline by original check-in index descending; do not create or persist a
second history structure.

- [ ] **Step 4: Implement dashboard and progression presentation**

Use semantic `dl` metric cards, an ordered activity timeline, and a three-step
growth track. Pass the owning artist color to `StrongholdMark`; locked stages
use reduced opacity and a text lock label, not a different semantic color.

- [ ] **Step 5: Run the record test and commit**

Run the Step 2 command; expected PASS.

```bash
git add web/components/team-preview/record-view.tsx web/features/team-preview/i18n.ts web/tests/team-preview-record.test.tsx web/app/globals.css
git commit -m "feat(web): visualize personal season progress"
```

### Task 6: Cross-Flow Accessibility, Responsiveness, and Release Verification

**Files:**
- Modify: `web/tests/team-preview-accessibility.test.tsx`
- Modify: `web/tests/team-preview-responsive-contract.test.ts`
- Modify: `web/tests/team-preview-golden-path.test.tsx`
- Modify: `web/app/globals.css`
- Modify: `web/README.md`

**Interfaces:**
- Consumes: all components and selectors from Tasks 1 through 5.
- Produces: keyboard-complete profile/map/dashboard flow, mobile layouts, reduced-motion behavior, and release evidence.

- [ ] **Step 1: Extend accessibility tests**

Assert focus enters profile setup, arrow/radio and confirmation controls are
keyboard operable, profile change returns focus to its trigger, territory cards
mirror map selection, map camera changes have a textual selected-region update,
ranking progress has a label/value, and locked rewards do not rely on color.

- [ ] **Step 2: Extend responsive CSS contracts**

Assert `globals.css` contains rules for `.profile-setup`, `.profile-menu`,
`.ranking-podium`, `.ranking-me-card`, `.record-metrics`, `.record-timeline`,
`@media(max-width:767px)`, and `@media(prefers-reduced-motion:reduce)`.

- [ ] **Step 3: Update the golden path**

The test sequence is:

```text
open app -> confirm BTS profile -> see 내 팬덤 ARMY -> inspect an owned region
-> select Gwangju -> distinguish ONEDOOR owner, ARMY challenger, j-hope story
-> verify public-only route is regional support -> inspect an eligible
artist-linked route -> complete a check-in -> inspect Ranking dashboard ->
inspect My Record timeline -> remount -> verify profile and progress persist
```

- [ ] **Step 4: Run changed-flow tests and fix only observed regressions**

Run:

```bash
cd web
npm test -- team-preview-entry.test.tsx team-preview-session.test.ts team-preview-map-presentation.test.ts team-preview-territory.test.tsx team-preview-expedition-selection.test.ts team-preview-expedition.test.tsx team-preview-ranking.test.tsx team-preview-record.test.tsx team-preview-accessibility.test.tsx team-preview-responsive-contract.test.ts team-preview-golden-path.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run the complete verification gate**

Run:

```bash
cd web
npm test
npm run lint
npm run build
npm run build:vercel
```

Expected: all tests PASS and every command exits `0`.

- [ ] **Step 6: Perform browser verification**

At `1440x900` and `390x844`, verify profile setup, saved-profile return,
nationwide/territory camera transitions, selected-fandom emphasis, Gwangju role
labels, direct versus support route wording, ranking podium, record timeline,
keyboard focus, and reduced motion. Save screenshots under `tmp/` and do not
commit them unless explicitly requested.

- [ ] **Step 7: Document the changed demo contract and commit**

Update `web/README.md` to state that fandom is a persisted demo profile, public
routes are not artist-branded, and map color/size semantics are fixed. Then:

```bash
git add web/tests/team-preview-accessibility.test.tsx web/tests/team-preview-responsive-contract.test.ts web/tests/team-preview-golden-path.test.tsx web/app/globals.css web/README.md
git commit -m "test(web): verify personalized territory experience"
```

## Final Verification Checklist

- [ ] `git status --short` contains only intentional files.
- [ ] First entry blocks the map until fandom profile confirmation.
- [ ] Returning entry restores profile and progress.
- [ ] No visible `게스트 데모` or ambiguous compact `#1` remains.
- [ ] Gwangju clearly distinguishes ONEDOOR, ARMY, and j-hope roles.
- [ ] Every stronghold uses owner color and the exact 14/22/32 px marker diameters.
- [ ] Polygon and card selection enlarge the same territory and national reset works.
- [ ] Public-only expeditions use `지역 응원 원정` and no artist branding.
- [ ] Ranking shows podium, selected-fandom goal, leaderboard, and contested actions.
- [ ] My Record shows summary, growth, timeline, rewards, and an empty-state action.
- [ ] Korean/English, keyboard, mobile, reduced-motion, full tests, lint, standard build, and Vercel build pass.
- [ ] No unrelated user-owned change is staged or committed.
