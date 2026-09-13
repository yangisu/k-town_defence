# GPS Live Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the visitor's real-time position as a marker on the territory map so they can see themselves relative to owned/contested territory, entirely client-side, with zero effect on the check-in evidence pipeline.

**Architecture:** The app already has two unrelated things that both use the word "GPS": (1) `src/ktown_defense/checkin.py` / `checkin_application.py`, the authoritative, server-verified GPS evidence collected during a 30-minute check-in session (start/middle/end samples, accuracy thresholds, dwell time) that alone decides territory points — this must not change; and (2) the browser's live position, which today is not shown anywhere. This plan adds only the second: a client-only `watchPosition` hook feeding a MapLibre GeoJSON marker layer on the existing real geo map, `web/components/team-preview/territory-map.tsx` (the only component in this repo currently rendering an Amazon Location/MapLibre map — `web/components/explore/korea-territory-map.tsx` is a stylized CSS/SVG abstraction, not a geo map, and is out of scope). The live position is never sent to the backend and never substitutes for check-in evidence.

**Tech Stack:** Browser Geolocation API (`navigator.geolocation.watchPosition`), MapLibre GL JS (already a dependency), React hook, existing `web/features/team-preview/i18n.ts` locale strings.

## Global Constraints

- Live location is presentation-only: it must never be persisted, sent to the backend, or accepted as a substitute for the check-in evidence GPS samples in `checkin_application.py`. Keep the two pipelines fully separate — no shared module, no shared network call.
- Do not change GPS, dwell, photo, or capture rules anywhere in the check-in domain (existing master-roadmap constraint carries over unchanged).
- Denied or unavailable permission must degrade gracefully and never block map use — follow the existing `mapError` / retry pattern already in `territory-map.tsx` rather than inventing a new error UX.
- Throttle `watchPosition` callbacks (minimum distance and/or time delta) before touching the MapLibre source, to avoid excess re-renders and battery drain; always clear the watch on unmount.
- New controls follow the existing accessibility pattern in `territory-map.tsx` (`aria-label`, keyboard-reachable `<button>`, respects `prefers-reduced-motion` for camera moves).
- Add Korean and English strings to `web/features/team-preview/i18n.ts`; do not hardcode user-facing text.

---

## File Map

```text
web/features/map/use-live-location.ts
web/components/team-preview/territory-map.tsx
web/features/team-preview/i18n.ts
web/tests/use-live-location.test.ts
web/tests/territory-map.test.tsx
```

### Task 1: `useLiveLocation` Hook

**Files:**
- Create: `web/features/map/use-live-location.ts`
- Test: `web/tests/use-live-location.test.ts`

**Interfaces:**
- Produces: `useLiveLocation(options?: { minMoveMeters?: number }) -> { position: { latitude, longitude, accuracyMeters } | null, status: "idle" | "locating" | "active" | "denied" | "unavailable", requestPermission(): void }`

- [x] **Step 1: Write permission-state and throttling tests**

```ts
test("denied permission yields status 'denied' and no crash", () => {
  mockGeolocation({ deny: true });
  const { result } = renderHook(() => useLiveLocation());
  act(() => result.current.requestPermission());
  expect(result.current.status).toBe("denied");
});

test("a move under minMoveMeters does not update position", () => {
  const { result } = renderHook(() => useLiveLocation({ minMoveMeters: 25 }));
  act(() => emitPosition(37.5665, 126.9780));
  act(() => emitPosition(37.56651, 126.97801)); // ~1m
  expect(result.current.position).toEqual(firstPositionOnly);
});

test("unmount clears the watch", () => {
  const clearWatch = jest.fn();
  const { unmount } = renderHook(() => useLiveLocation());
  unmount();
  expect(clearWatch).toHaveBeenCalled();
});
```

- [x] **Step 2: Run and confirm the hook is absent** — confirmed via import failure before the file existed.

- [x] **Step 3: Implement the hook**

Implemented as designed in `web/features/map/use-live-location.ts`. One addition beyond the plan: `requestPermission()` calls `clearWatch()` first so a re-click while already active/denied doesn't leak a second `watchPosition` subscription.

- [x] **Step 4: Verify** — `npx vitest run tests/use-live-location.test.ts` → 6/6 passed (denied, unavailable, first-fix accepted, throttled move rejected, move-past-threshold accepted, unmount clears the watch).

- [x] **Step 5: Commit the hook** — commit `aa0f69d`.

### Task 2: Render the Live-Location Marker and Recenter Control

**Files:**
- Modify: `web/components/team-preview/territory-map.tsx`
- Modify: `web/features/team-preview/i18n.ts`
- Test: `web/tests/territory-map.test.tsx`

**Interfaces:**
- Adds a `my-location` GeoJSON source/layer (pulsing-dot circle paint, same pattern as the existing `preview-artist-connection-pins` layer) and a "내 위치로 이동" / "Locate me" button beside the existing reset/fullscreen controls in `.preview-map-tools`.

- [x] **Step 1: Write marker and control tests** — added to `web/tests/territory-map.test.tsx` with a local `mockGeolocation()` helper (same shape as the one in `web/tests/use-live-location.test.ts`, kept local rather than shared to match this repo's convention of per-file geolocation mocks, e.g. `browser-evidence.test.ts`).
- [x] **Step 2: Run and confirm the control is absent** — confirmed (`screen.getByLabelText("내 위치로 이동")` not found before the button existed).
- [x] **Step 3: Wire the hook into the map** — implemented as designed; the `my-location` source is seeded from a ref (`myPositionRef`) at `map.on("load")` time in case a fix already arrived before the map finished loading, then kept in sync by a `position`-keyed effect that also does the one-time `flyTo`/`jumpTo` on the first fix (zoom 14).
- [x] **Step 4: Add the recenter control and i18n strings** — added `locateMe`, `locating`, `locationDenied`, and one extra key not in the original plan, `locationUnavailable` (distinct copy for "no geolocation on this device/browser" vs. "permission denied"), to both `ko` and `en` in `i18n.ts`. The button also gets `aria-pressed={status === "active"}` and a lime highlight (new `.preview-map-tools button[aria-pressed="true"]` rule) so an already-tracking state is visible, and a second click on it recenters the camera instead of re-requesting permission.
- [x] **Step 5: Verify**

Ran: `cd web && npx vitest run` → **319/319 passed** (16/16 in `territory-map.test.tsx`, including the 2 new cases; `real-check-in.test.tsx`/`check-in-reducer.test.ts` untouched and still passing). `npm run lint` → clean. `npm run build` → succeeds.
**Could not visually verify the rendered marker/button in a live browser**: this sandbox's `NEXT_PUBLIC_AWS_LOCATION_API_KEY` is the `.env.example` placeholder, so the map itself never leaves its "지도를 사용할 수 없어요" fallback state (a pre-existing limitation this repo already documents as an external smoke-test item for whoever holds a real AWS Location key — see `web/README.md`'s Vercel deployment section). The component-level tests exercise the real code path (`map.on("load")` → source/layer/button) against a mocked MapLibre instance, but a real map with a real key should still be checked once one is available.

- [x] **Step 6: Commit the map marker and control**

## Plan Completion Gate

- [x] Granting location permission shows a marker that updates as the browser reports new positions, throttled to avoid excess re-renders. (Verified via mocked MapLibre in tests; **not yet verified against a real rendered map** — needs a real `NEXT_PUBLIC_AWS_LOCATION_API_KEY`.)
- [x] Denying or lacking permission leaves the map fully usable, with an inline hint instead of an error state.
- [x] No network call carries the live position; `checkin_application.py` and its tests are untouched (untouched by this plan; full backend suite re-verified in the SNS-integration plan's Task 1 session).
- [x] Recenter control is reachable by keyboard and labeled for screen readers, matching the existing control pattern (`aria-label`, `aria-pressed`, same `<button>` markup as the reset/fullscreen controls).
- [x] `web/tests/territory-map.test.tsx`, `web/tests/use-live-location.test.ts`, and the full `npm test` suite pass — 319/319.
