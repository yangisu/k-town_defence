# Mobile Map and Admin Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a mobile-first map PWA and queue-oriented admin console that exercise the complete tourism, mission, check-in, and territory HTTP contracts.

**Architecture:** Use one Next.js application with member and admin route groups, a replaceable map adapter, server-state queries, and an explicit recoverable check-in state store. Treat the backend as the source of truth and recover territory updates by projection version.

**Tech Stack:** Next.js App Router, React, TypeScript, Kakao Maps JavaScript SDK behind an adapter, TanStack Query, Playwright, Vitest, Testing Library

## Global Constraints

- The first member screen is the map after fandom onboarding.
- Bottom navigation is `지도 | 지역 리그 | 탐험 기록 | 내 팬덤`.
- Tourism information appears before competition details in the place sheet.
- Fandom colors must not be the only state indicator; icons and text are required.
- Camera evidence must use live capture and never silently fall back to gallery upload.
- Losing foreground, network, GPS permission, or location confirmation pauses dwell immediately.
- Execution assumes Git has been initialized before commit steps.

---

## File Map

```text
web/package.json
web/src/app/(member)/layout.tsx
web/src/app/(member)/map/page.tsx
web/src/app/(member)/league/page.tsx
web/src/app/(member)/exploration/page.tsx
web/src/app/(member)/fandom/page.tsx
web/src/app/admin/*
web/src/features/map/MapAdapter.ts
web/src/features/map/KakaoMapAdapter.ts
web/src/features/map/PlaceSheet.tsx
web/src/features/checkin/CheckInFlow.tsx
web/src/features/checkin/useCheckInSession.ts
web/src/features/admin/*
web/src/lib/api.ts
web/tests/unit/*
web/tests/e2e/member-flow.spec.ts
web/tests/e2e/admin-flow.spec.ts
```

### Task 1: Web Scaffold, API Client, and Accessible Navigation

**Files:**
- Create: `web/package.json`
- Create: `web/src/app/layout.tsx`
- Create: `web/src/app/(member)/layout.tsx`
- Create: `web/src/lib/api.ts`
- Test: `web/tests/unit/member-layout.test.tsx`

**Interfaces:**
- Produces: `api.get<T>()`, `api.post<T>()`, `api.patch<T>()`
- Produces four member navigation destinations

- [ ] **Step 1: Write the failing navigation test**

```tsx
render(<MemberLayout><div>content</div></MemberLayout>)
expect(screen.getByRole('link', { name: '지도' })).toHaveAttribute('href', '/map')
expect(screen.getAllByRole('link')).toHaveLength(4)
```

- [ ] **Step 2: Run and observe missing web package**

Run: `cd web && npm test -- member-layout.test.tsx`  
Expected: FAIL because the package and component do not exist.

- [ ] **Step 3: Create the Next.js app shell and typed API error**

```ts
export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code) }
}
```

Use safe-area insets, 44px minimum touch targets, Korean labels, visible focus, and route-aware `aria-current`.

- [ ] **Step 4: Run unit and production build**

Run: `cd web && npm test -- member-layout.test.tsx`  
Expected: PASS.  
Run: `cd web && npm run build`  
Expected: successful production build.

- [ ] **Step 5: Commit the web foundation**

```bash
git add web
git commit -m "feat: add mobile PWA application shell"
```

### Task 2: Fandom Onboarding

**Files:**
- Create: `web/src/app/onboarding/fandom/page.tsx`
- Create: `web/src/features/fandom/FandomSelector.tsx`
- Test: `web/tests/unit/fandom-selector.test.tsx`

**Interfaces:**
- Consumes membership GET/PUT endpoints
- Produces redirect to `/map` after selection

- [ ] **Step 1: Write lock-warning and selection tests**

```tsx
expect(screen.getByText('첫 방문 승인 후 이번 시즌 팬덤이 잠겨요')).toBeVisible()
await user.click(screen.getByRole('button', { name: '팬덤 A 선택' }))
expect(mockApi.put).toHaveBeenCalledWith('/api/v1/me/season-membership', { fandom_id: 'fandom-a' })
```

- [ ] **Step 2: Run and confirm selector is absent**

Run: `cd web && npm test -- fandom-selector.test.tsx`  
Expected: FAIL.

- [ ] **Step 3: Implement explicit confirmation and error recovery**

```tsx
const select = async (fandomId: string) => {
  setPending(fandomId)
  try { await api.put('/api/v1/me/season-membership', { fandom_id: fandomId }); router.replace('/map') }
  catch (error) { setError(toKoreanMessage(error)) }
  finally { setPending(null) }
}
```

- [ ] **Step 4: Run onboarding unit tests**

Run: `cd web && npm test -- fandom-selector.test.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit fandom onboarding**

```bash
git add web/src/app/onboarding web/src/features/fandom web/tests/unit/fandom-selector.test.tsx
git commit -m "feat: add season fandom onboarding"
```

### Task 3: Replaceable Map and Tourism-First Place Sheet

**Files:**
- Create: `web/src/features/map/MapAdapter.ts`
- Create: `web/src/features/map/KakaoMapAdapter.ts`
- Create: `web/src/features/map/PlaceSheet.tsx`
- Create: `web/src/app/(member)/map/page.tsx`
- Test: `web/tests/unit/place-sheet.test.tsx`

**Interfaces:**
- Produces: `MapAdapter.renderPlaces(places)`, `focusPlace(placeId)`, `setRegionBoundary(geojson)`
- Consumes map places and place detail APIs

- [ ] **Step 1: Write tourism-before-territory order test**

```tsx
render(<PlaceSheet place={PLACE} />)
const text = screen.getByTestId('place-sheet').textContent ?? ''
expect(text.indexOf('운영시간')).toBeLessThan(text.indexOf('현재 거점'))
```

- [ ] **Step 2: Run and confirm map components are absent**

Run: `cd web && npm test -- place-sheet.test.tsx`  
Expected: FAIL.

- [ ] **Step 3: Implement map-state semantics and adapter boundary**

```ts
export type PlaceMapState = 'neutral' | 'ours' | 'rival' | 'recommended' | 'locked'
export interface MapAdapter {
  renderPlaces(places: MapPlace[]): void
  focusPlace(placeId: string): void
  destroy(): void
}
```

Render icon shape, Korean status text, and color for every state. Do not use Kakao POI data as application truth.

- [ ] **Step 4: Run unit and build tests**

Run: `cd web && npm test -- place-sheet.test.tsx && npm run build`  
Expected: PASS.

- [ ] **Step 5: Commit the map experience**

```bash
git add web/src/features/map web/src/app/'(member)'/map web/tests/unit/place-sheet.test.tsx
git commit -m "feat: add tourism-first fandom territory map"
```

### Task 4: Recoverable Check-in Flow

**Files:**
- Create: `web/src/features/checkin/CheckInFlow.tsx`
- Create: `web/src/features/checkin/useCheckInSession.ts`
- Create: `web/src/features/checkin/camera.ts`
- Test: `web/tests/unit/checkin-flow.test.tsx`

**Interfaces:**
- Consumes all check-in session APIs
- Produces states: `preflight`, `collecting`, `paused`, `ready`, `submitting`, `review`, `approved`, `rejected`, `expired`

- [ ] **Step 1: Write background and reconnect tests**

```tsx
document.dispatchEvent(new Event('visibilitychange'))
expect(mockApi.post).toHaveBeenCalledWith(expect.stringContaining('/pause'), expect.anything())
expect(screen.getByText('위치 확인이 일시 중지됐어요')).toBeVisible()
```

- [ ] **Step 2: Run and confirm check-in hook is absent**

Run: `cd web && npm test -- checkin-flow.test.tsx`  
Expected: FAIL.

- [ ] **Step 3: Implement server-authoritative recovery**

```ts
const recover = async () => {
  const current = await api.get<CheckInSession>(`/api/v1/checkin-sessions/${sessionId}`)
  setSession(current)
}
```

On reload, reconnect, or foreground return, fetch the server session before collecting another sample. Request camera with `facingMode: { ideal: 'environment' }` and reject file-input fallback.

- [ ] **Step 4: Run unit tests and browser permission mocks**

Run: `cd web && npm test -- checkin-flow.test.tsx`  
Expected: PASS for permission denial, hidden tab, network loss, reload, duplicate submit, and expiry.

- [ ] **Step 5: Commit the mobile mission flow**

```bash
git add web/src/features/checkin web/tests/unit/checkin-flow.test.tsx
git commit -m "feat: add recoverable mobile check-in flow"
```

### Task 5: Results, Leagues, Exploration, and Fandom Screens

**Files:**
- Create: `web/src/features/results/VisitResult.tsx`
- Create: `web/src/app/(member)/league/page.tsx`
- Create: `web/src/app/(member)/exploration/page.tsx`
- Create: `web/src/app/(member)/fandom/page.tsx`
- Test: `web/tests/unit/visit-result.test.tsx`

**Interfaces:**
- Consumes approval result, regional league, national standing, exploration, and badges APIs

- [ ] **Step 1: Write region-impact result test**

```tsx
expect(screen.getByText('팬덤 A가 정선아리랑시장에 100점을 더했습니다.')).toBeVisible()
expect(screen.getByText('정선군 탐방 3/18 장소')).toBeVisible()
expect(screen.getByRole('link', { name: '다음 탐험 보기' })).toBeVisible()
```

- [ ] **Step 2: Run and confirm screens are absent**

Run: `cd web && npm test -- visit-result.test.tsx`  
Expected: FAIL.

- [ ] **Step 3: Implement result and standings views**

Display score components, recognized-region progress, badges, and next recommendation. Never expose another user's identity or evidence.

```tsx
<Progress value={region.visited_places} max={region.active_places}
          label={`${region.name_ko} 탐방`} />
```

- [ ] **Step 4: Run member UI tests and build**

Run: `cd web && npm test -- visit-result.test.tsx && npm run build`  
Expected: PASS.

- [ ] **Step 5: Commit member progress views**

```bash
git add web/src/features/results web/src/app/'(member)' web/tests/unit/visit-result.test.tsx
git commit -m "feat: show regional exploration and league results"
```

### Task 6: Queue-Oriented Admin Console

**Files:**
- Create: `web/src/app/admin/layout.tsx`
- Create: `web/src/app/admin/page.tsx`
- Create: `web/src/features/admin/WorkQueue.tsx`
- Create: `web/src/features/admin/PlaceReview.tsx`
- Create: `web/src/features/admin/MissionReview.tsx`
- Create: `web/src/features/admin/CheckInReview.tsx`
- Test: `web/tests/unit/admin-queue.test.tsx`

**Interfaces:**
- Consumes candidate, mission, review, appeal, rights, audit, DLQ, point-adjustment, dual-approval, and season APIs completed by Plans 2-5; analytics is intentionally deferred to Plan 7

- [ ] **Step 1: Write queue count and permission tests**

```tsx
expect(screen.getByRole('link', { name: '새 장소 후보 24건' })).toBeVisible()
expect(screen.queryByText('개인정보 증거 다운로드')).not.toBeInTheDocument()
```

- [ ] **Step 2: Run and confirm admin console is absent**

Run: `cd web && npm test -- admin-queue.test.tsx`  
Expected: FAIL.

- [ ] **Step 3: Implement task-first admin screens**

Place original source, map/radius, images, opening data, generated mission, before/after changes, safety checks, and approval actions in one review view. Hide unavailable actions based on server-provided permissions.

```tsx
const queueItems = counts.map(({ kind, count }) => ({
  href: `/admin/${kind}`,
  label: queueLabel(kind, count),
  count,
}))

return (
  <WorkQueue items={queueItems}>
    <PlaceReview
      source={candidate.source}
      proposed={candidate.proposed}
      permissions={candidate.permissions}
      onApprove={candidate.permissions.includes('place:approve') ? approve : undefined}
    />
  </WorkQueue>
)
```

- [ ] **Step 4: Run admin tests and build**

Run: `cd web && npm test -- admin-queue.test.tsx && npm run build`  
Expected: PASS.

- [ ] **Step 5: Commit the admin work queues**

```bash
git add web/src/app/admin web/src/features/admin web/tests/unit/admin-queue.test.tsx
git commit -m "feat: add queue-oriented operator console"
```

### Task 7: Browser E2E and Accessibility Gate

**Files:**
- Create: `web/playwright.config.ts`
- Create: `web/tests/e2e/member-flow.spec.ts`
- Create: `web/tests/e2e/admin-flow.spec.ts`
- Create: `web/tests/e2e/accessibility.spec.ts`

**Interfaces:**
- Verifies the complete member and operator browser stories against running API and PostgreSQL

- [ ] **Step 1: Write failing complete member story**

```ts
test('fandom to captured stronghold', async ({ page }) => {
  await page.goto('/onboarding/fandom')
  await page.getByRole('button', { name: '팬덤 A 선택' }).click()
  await page.getByRole('button', { name: '정선아리랑시장' }).click()
  await page.getByRole('button', { name: '현장 미션 시작' }).click()
  await completeMockedFieldEvidence(page)
  await expect(page.getByText('거점까지 200점 남았습니다.')).toBeVisible()
})
```

- [ ] **Step 2: Run and observe incomplete vertical behavior**

Run: `cd web && npx playwright test`  
Expected: FAIL at the first unconnected screen or API.

- [ ] **Step 3: Complete test fixtures and accessibility assertions**

Use browser context mocks only for geolocation, camera stream, and passage of time; use the real application API and database for state. Configure Playwright `webServer` entries to start `python -m uvicorn ktown_defense.api.main:create_app --factory --port 8000` and `npm run dev -- --port 3000`, and set `reuseExistingServer: false` in CI so the gate does not depend on stale local processes.

```ts
await context.grantPermissions(['geolocation'])
await context.setGeolocation({ latitude: 37.5665, longitude: 126.9780 })
await page.addInitScript(() => {
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
    value: async () => new MediaStream(),
  })
})

const accessibility = await new AxeBuilder({ page }).analyze()
expect(accessibility.violations).toEqual([])
```

- [ ] **Step 4: Run E2E and production build**

Run: `docker compose up -d --wait`  
Expected: Plan 1 PostgreSQL/PostGIS and object-storage services are healthy.  
Run: `cd web && npx playwright test && npm run build`  
Expected: all member, admin, permission, reconnect, and accessibility stories PASS.

- [ ] **Step 5: Commit the browser gate**

```bash
git add web/playwright.config.ts web/tests/e2e
git commit -m "test: add complete mobile and admin browser gates"
```

## Plan Completion Gate

- [ ] Mobile member flow begins with fandom selection and then map.
- [ ] Place sheet presents tourism facts before territory facts.
- [ ] Every map state has color, shape, and Korean text.
- [ ] Check-in pauses and recovers from all permission and lifecycle changes.
- [ ] Region impact and next exploration are visible after approval.
- [ ] Admin queues cover catalog, mission, check-in, rights, audit, DLQ, point adjustment, dual approval, and season work without depending on Plan 7 analytics.
- [ ] Browser E2E and production build pass.
