# K-Town Defence Demo Login, Brand Transition, and Map Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a session-scoped demo login and 1.5-second K-TOWN DEFENCE transition, then make selected territories visibly filled and centered while returning stronghold rings to fandom colors.

**Architecture:** Keep demo authentication outside the existing fandom `DemoSessionProvider`: a client-side `DemoEntryGate` wraps only demo mode at the page boundary and stores its completed state in `sessionStorage`. Preserve the existing map data model and change only the selected fill paint, layer-order contract, symmetric `fitBounds` padding, and stronghold stroke paint.

**Tech Stack:** React 19, TypeScript 5.9, vinext/Vite, MapLibre GL 5, Vitest 4, Testing Library, CSS

**Spec:** `docs/superpowers/specs/2026-08-26-ktown-demo-login-brand-transition-map-selection-design.md`

## Global Constraints

- Demo authentication must not call a server or change the existing membership integration.
- Accept a syntactically valid email and a password whose trimmed length is greater than zero.
- Store only the completion marker in `sessionStorage`; existing fandom and territory state remains in `localStorage`.
- Show the brand transition for 1,500 ms, with click, Enter, and Space skip controls.
- Respect `prefers-reduced-motion` and clean up timers and listeners on unmount.
- Selected territory fill uses its `ownerColor` at `0.38` opacity.
- Selected bounds use symmetric padding: `56` pixels on desktop and `32` pixels below 768 px, with `maxZoom: 9`.
- Stronghold fill and stroke use `ownerColor`; stage remains visible through marker and logo size only.
- Do not modify the stronghold stage, reward, buff, expedition, or record rules.

---

### Task 1: Demo Authentication State Helpers

**Files:**
- Create: `web/features/demo-entry/demo-auth.ts`
- Test: `web/tests/demo-auth.test.ts`

**Interfaces:**
- Produces: `DEMO_LOGIN_SESSION_KEY: "ktown-demo-login-v1"`
- Produces: `DemoLoginStorage = Pick<Storage, "getItem" | "setItem">`
- Produces: `isValidDemoEmail(value: string): boolean`
- Produces: `hasDemoLogin(storage: Pick<Storage, "getItem">): boolean`
- Produces: `saveDemoLogin(storage: Pick<Storage, "setItem">): void`

- [ ] **Step 1: Write failing validation and storage tests**

```ts
import { describe, expect, it, vi } from "vitest";
import {
  DEMO_LOGIN_SESSION_KEY,
  hasDemoLogin,
  isValidDemoEmail,
  saveDemoLogin,
} from "@/features/demo-entry/demo-auth";

describe("demo authentication helpers", () => {
  it.each([
    ["fan@example.com", true],
    [" fan@example.com ", true],
    ["fan@example", false],
    ["fan example.com", false],
    ["", false],
  ])("validates %j as %s", (email, expected) => {
    expect(isValidDemoEmail(email)).toBe(expected);
  });

  it("persists and reads only the session completion marker", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    };

    expect(hasDemoLogin(storage)).toBe(false);
    saveDemoLogin(storage);
    expect(storage.setItem).toHaveBeenCalledWith(DEMO_LOGIN_SESSION_KEY, "authenticated");
    expect(hasDemoLogin(storage)).toBe(true);
  });

  it("falls back safely when storage access throws", () => {
    expect(hasDemoLogin({ getItem: () => { throw new Error("blocked"); } })).toBe(false);
    expect(() => saveDemoLogin({ setItem: () => { throw new Error("blocked"); } })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the helper test and verify RED**

Run: `npm test -- demo-auth.test.ts`

Expected: FAIL because `@/features/demo-entry/demo-auth` does not exist.

- [ ] **Step 3: Implement the minimal helpers**

```ts
export const DEMO_LOGIN_SESSION_KEY = "ktown-demo-login-v1";
const COMPLETED_VALUE = "authenticated";

export type DemoLoginStorage = Pick<Storage, "getItem" | "setItem">;

export function isValidDemoEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function hasDemoLogin(storage: Pick<Storage, "getItem">) {
  try {
    return storage.getItem(DEMO_LOGIN_SESSION_KEY) === COMPLETED_VALUE;
  } catch {
    return false;
  }
}

export function saveDemoLogin(storage: Pick<Storage, "setItem">) {
  try {
    storage.setItem(DEMO_LOGIN_SESSION_KEY, COMPLETED_VALUE);
  } catch {
    // The in-memory gate state still lets the current demo continue.
  }
}
```

- [ ] **Step 4: Run the helper test and verify GREEN**

Run: `npm test -- demo-auth.test.ts`

Expected: PASS with all validation, persistence, and blocked-storage cases green.

- [ ] **Step 5: Commit the helper deliverable**

```bash
git add web/features/demo-entry/demo-auth.ts web/tests/demo-auth.test.ts
git commit -m "feat: add demo login session helpers"
```

---

### Task 2: Login and Brand Transition Entry Gate

**Files:**
- Create: `web/components/demo-entry/demo-brand-lockup.tsx`
- Create: `web/components/demo-entry/demo-login.tsx`
- Create: `web/components/demo-entry/demo-brand-transition.tsx`
- Create: `web/components/demo-entry/demo-entry-gate.tsx`
- Modify: `web/app/page.tsx`
- Modify: `web/app/globals.css`
- Test: `web/tests/demo-entry-gate.test.tsx`
- Modify test: `web/tests/team-preview-responsive-contract.test.ts`

**Interfaces:**
- Consumes: `DemoLoginStorage`, `hasDemoLogin`, `isValidDemoEmail`, and `saveDemoLogin` from Task 1.
- Produces: `DemoBrandLockup({ className? }: { className?: string }): JSX.Element`
- Produces: `DemoLogin({ onComplete }: { onComplete(): void }): JSX.Element`
- Produces: `DemoBrandTransition({ onComplete, durationMs? }: { onComplete(): void; durationMs?: number }): JSX.Element`
- Produces: `DemoEntryGate({ children, storage? }: { children: ReactNode; storage?: DemoLoginStorage }): JSX.Element`

- [ ] **Step 1: Write failing entry-flow tests**

Create `web/tests/demo-entry-gate.test.tsx` with real component interactions:

```tsx
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DemoBrandTransition } from "@/components/demo-entry/demo-brand-transition";
import { DemoEntryGate } from "@/components/demo-entry/demo-entry-gate";
import { DEMO_LOGIN_SESSION_KEY } from "@/features/demo-entry/demo-auth";

beforeEach(() => window.sessionStorage.clear());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("validates credentials before entering the brand transition", async () => {
  const user = userEvent.setup();
  render(<DemoEntryGate><div>service workspace</div></DemoEntryGate>);

  expect(await screen.findByRole("heading", { name: "K-TOWN DEFENCE 로그인" })).toBeVisible();
  await user.type(screen.getByLabelText("이메일"), "invalid");
  await user.click(screen.getByRole("button", { name: "로그인" }));
  expect(screen.getByText("올바른 이메일 주소를 입력해 주세요.")).toBeVisible();
  expect(screen.getByText("비밀번호를 입력해 주세요.")).toBeVisible();

  await user.clear(screen.getByLabelText("이메일"));
  await user.type(screen.getByLabelText("이메일"), "fan@example.com");
  await user.type(screen.getByLabelText("비밀번호"), "demo");
  await user.click(screen.getByRole("button", { name: "로그인" }));

  expect(screen.getByRole("button", { name: "K-TOWN DEFENCE 시작 화면—클릭하여 바로 시작" })).toBeVisible();
  expect(window.sessionStorage.getItem(DEMO_LOGIN_SESSION_KEY)).toBe("authenticated");
});

it("completes the transition after 1.5 seconds", () => {
  vi.useFakeTimers();
  const onComplete = vi.fn();
  render(<DemoBrandTransition onComplete={onComplete} />);
  expect(onComplete).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1_500));
  expect(onComplete).toHaveBeenCalledTimes(1);
});

it("cleans up the transition timer when it unmounts", () => {
  vi.useFakeTimers();
  const onComplete = vi.fn();
  const view = render(<DemoBrandTransition onComplete={onComplete} />);
  view.unmount();
  act(() => vi.advanceTimersByTime(1_500));
  expect(onComplete).not.toHaveBeenCalled();
});

it("restores an authenticated tab directly into the service", async () => {
  window.sessionStorage.setItem(DEMO_LOGIN_SESSION_KEY, "authenticated");
  render(<DemoEntryGate><div>service workspace</div></DemoEntryGate>);
  expect(await screen.findByText("service workspace")).toBeVisible();
  expect(screen.queryByRole("heading", { name: "K-TOWN DEFENCE 로그인" })).not.toBeInTheDocument();
});

it.each(["click", "Enter", " "])("skips the transition with %s", async (action) => {
  const user = userEvent.setup();
  render(<DemoEntryGate><div>service workspace</div></DemoEntryGate>);
  await user.type(await screen.findByLabelText("이메일"), "fan@example.com");
  await user.type(screen.getByLabelText("비밀번호"), "demo");
  await user.click(screen.getByRole("button", { name: "로그인" }));
  const transition = screen.getByRole("button", { name: "K-TOWN DEFENCE 시작 화면—클릭하여 바로 시작" });
  if (action === "click") await user.click(transition);
  else {
    transition.focus();
    await user.keyboard(action === "Enter" ? "{Enter}" : " ");
  }
  expect(screen.getByText("service workspace")).toBeVisible();
});

it("continues in memory when session storage is blocked", async () => {
  const user = userEvent.setup();
  const storage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
  };
  render(<DemoEntryGate storage={storage}><div>service workspace</div></DemoEntryGate>);
  await user.type(await screen.findByLabelText("이메일"), "fan@example.com");
  await user.type(screen.getByLabelText("비밀번호"), "demo");
  await user.click(screen.getByRole("button", { name: "로그인" }));
  await user.click(screen.getByRole("button", { name: /K-TOWN DEFENCE 시작 화면/ }));
  expect(screen.getByText("service workspace")).toBeVisible();
});
```

- [ ] **Step 2: Add a failing responsive CSS contract**

Append to `web/tests/team-preview-responsive-contract.test.ts`:

```ts
it("keeps the demo entry screens full-height and mobile-safe", () => {
  expect(compactCss).toMatch(/\.demo-entry-screen\{[^}]*min-height:100(?:svh|vh)/);
  expect(compactCss).toMatch(/\.demo-login-card\{[^}]*width:min\(100%,420px\)/);
  expect(compactCss).toMatch(/\.demo-brand-transition\{[^}]*position:fixed[^}]*inset:0/);
  expect(compactCss).toMatch(/@media\(prefers-reduced-motion:reduce\)\{[^}]*\.demo-brand-lockup/);
});
```

- [ ] **Step 3: Run entry tests and verify RED**

Run: `npm test -- demo-entry-gate.test.tsx team-preview-responsive-contract.test.ts`

Expected: FAIL because the entry components and CSS rules do not exist.

- [ ] **Step 4: Implement the shared brand lockup and login form**

Use this structure in `demo-brand-lockup.tsx`:

```tsx
export function DemoBrandLockup({ className = "" }: { className?: string }) {
  return (
    <div className={`demo-brand-lockup ${className}`.trim()} role="img" aria-label="K-Town Defence">
      <span aria-hidden="true">K</span>
      <strong>K-TOWN<br />DEFENCE</strong>
    </div>
  );
}
```

Implement `DemoLogin` as a semantic `<form>` with controlled `email`, `password`, and field-specific error state. On submit:

```tsx
const emailError = isValidDemoEmail(email) ? null : "올바른 이메일 주소를 입력해 주세요.";
const passwordError = password.trim() ? null : "비밀번호를 입력해 주세요.";
if (emailError || passwordError) {
  setErrors({ email: emailError, password: passwordError });
  return;
}
onComplete();
```

Render explicit `<label>` elements, `aria-invalid`, `aria-describedby`, `autoComplete="email"`, `autoComplete="current-password"`, the heading `K-TOWN DEFENCE 로그인`, and the note `데모용 로그인 · 임의의 이메일과 비밀번호로 체험할 수 있어요.`

- [ ] **Step 5: Implement the timed, skippable brand transition**

Use an actual full-screen button so pointer, Enter, and Space activation share one accessible path:

```tsx
export function DemoBrandTransition({ onComplete, durationMs = 1_500 }: Props) {
  const completed = useRef(false);
  const finish = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    const timer = window.setTimeout(finish, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, finish]);

  return (
    <button
      type="button"
      className="demo-entry-screen demo-brand-transition"
      aria-label="K-TOWN DEFENCE 시작 화면—클릭하여 바로 시작"
      onClick={finish}
    >
      <DemoBrandLockup className="demo-brand-lockup--hero" />
      <small>클릭하여 바로 시작</small>
    </button>
  );
}
```

Native button keyboard activation covers Enter and Space; tests should use `fireEvent.keyDown` followed by `fireEvent.keyUp` only if jsdom does not synthesize the click, otherwise use `user.keyboard` while the button is focused.

- [ ] **Step 6: Implement the session-aware entry gate**

Use a transient `checking` state to avoid flashing the login form before reading browser storage:

```tsx
type EntryState = "checking" | "login" | "brand-transition" | "service";

export function DemoEntryGate({ children, storage }: Props) {
  const [state, setState] = useState<EntryState>("checking");
  const [resolvedStorage] = useState<DemoLoginStorage | undefined>(() => {
    if (storage) return storage;
    try {
      return typeof window === "undefined" ? undefined : window.sessionStorage;
    } catch {
      return undefined;
    }
  });

  useEffect(() => {
    setState(resolvedStorage && hasDemoLogin(resolvedStorage) ? "service" : "login");
  }, [resolvedStorage]);

  if (state === "checking") return <p className="demo-entry-loading" role="status">데모를 준비하고 있어요.</p>;
  if (state === "login") return <DemoLogin onComplete={() => {
    if (resolvedStorage) saveDemoLogin(resolvedStorage);
    setState("brand-transition");
  }} />;
  if (state === "brand-transition") return <DemoBrandTransition onComplete={() => setState("service")} />;
  return <>{children}</>;
}
```

The lazy storage initializer keeps the dependency stable and catches browsers that reject access to the `sessionStorage` getter; do not recreate the storage reference on each render.

- [ ] **Step 7: Integrate the gate only for demo mode**

Modify `web/app/page.tsx`:

```tsx
import { DemoEntryGate } from "@/components/demo-entry/demo-entry-gate";

const app = <KTownApp mode={mode} mapConfig={mapConfig} />;
return mode === "demo" ? <DemoEntryGate>{app}</DemoEntryGate> : app;
```

This preserves integrated membership entry and keeps existing `KTownApp` unit tests focused on the service itself.

- [ ] **Step 8: Add the exact entry styling**

Append focused rules to `web/app/globals.css`:

```css
.demo-entry-screen{min-height:100svh;width:100%;background:var(--ink);color:white}
.demo-login-screen{display:grid;place-items:center;padding:24px}
.demo-login-card{width:min(100%,420px);padding:32px;border:1px solid rgba(255,255,255,.12);border-radius:28px;background:rgba(255,255,255,.06);box-shadow:0 28px 80px rgba(0,0,0,.28)}
.demo-brand-lockup{display:flex;align-items:center;gap:14px}.demo-brand-lockup>span{display:grid;place-items:center;width:56px;height:56px;border-radius:16px;background:var(--lime);color:var(--ink);font-size:30px;font-weight:950}.demo-brand-lockup strong{font-size:20px;line-height:.86;letter-spacing:-.05em}
.demo-login-card h1{margin:34px 0 8px;font-size:30px}.demo-login-card>p{margin:0 0 24px;color:#c7d1cb;line-height:1.6}.demo-login-card label{display:block;margin-top:16px;font-size:12px;font-weight:850}.demo-login-card input{width:100%;min-height:52px;margin-top:7px;padding:0 14px;border:1px solid rgba(255,255,255,.2);border-radius:13px;background:rgba(255,255,255,.08);color:white;font:inherit}.demo-login-card input[aria-invalid="true"]{border-color:#ff8d69}.demo-login-error{margin:7px 0 0;color:#ffb49d;font-size:11px}.demo-login-card button{width:100%;min-height:54px;margin-top:24px;border:0;border-radius:14px;background:var(--lime);color:var(--ink);font-weight:950;cursor:pointer}.demo-login-note{display:block;margin-top:16px;color:#aebbb3;font-size:10px;text-align:center}
.demo-brand-transition{position:fixed;z-index:100;inset:0;border:0;display:grid;place-items:center;align-content:center;gap:48px;cursor:pointer}.demo-brand-lockup--hero{animation:demo-brand-arrive .7s cubic-bezier(.2,.8,.2,1) both}.demo-brand-lockup--hero>span{width:clamp(84px,12vw,150px);height:clamp(84px,12vw,150px);border-radius:clamp(22px,3vw,40px);font-size:clamp(48px,7vw,88px)}.demo-brand-lockup--hero strong{font-size:clamp(34px,7vw,92px)}.demo-brand-transition small{color:#aebbb3;font-size:11px}
@keyframes demo-brand-arrive{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
@media(prefers-reduced-motion:reduce){.demo-brand-lockup--hero{animation:none}}
```

- [ ] **Step 9: Run focused entry tests and verify GREEN**

Run: `npm test -- demo-auth.test.ts demo-entry-gate.test.tsx team-preview-responsive-contract.test.ts`

Expected: PASS; no act warnings, timer leaks, or accessibility query failures.

- [ ] **Step 10: Run existing entry regression tests**

Run: `npm test -- team-preview-entry.test.tsx team-preview-accessibility.test.tsx`

Expected: PASS because `KTownApp` behavior is unchanged and only `app/page.tsx` adds the demo gate.

- [ ] **Step 11: Commit the complete entry flow**

```bash
git add web/components/demo-entry web/features/demo-entry/demo-auth.ts web/app/page.tsx web/app/globals.css web/tests/demo-entry-gate.test.tsx web/tests/team-preview-responsive-contract.test.ts
git commit -m "feat: add demo login brand transition"
```

---

### Task 3: Selected Territory Visibility, Centering, and Fandom Rings

**Files:**
- Modify: `web/components/team-preview/territory-map.tsx`
- Modify test: `web/tests/territory-map.test.tsx`

**Interfaces:**
- Consumes: existing GeoJSON properties `id`, `ownerColor`, and `stage`.
- Preserves: `strongholdRadiusExpression` and logo-size stage expression.
- Changes: selected fill opacity to `0.38`, stronghold stroke color to `["get", "ownerColor"]`, stroke width to `2`, and desktop selection padding to `56`.

- [ ] **Step 1: Change the map presentation test to the desired behavior**

Replace the stage-ring assertions with selected-fill, layer-order, and fandom-ring assertions:

```tsx
it("fills the selected territory above the base fill and uses fandom-colored stronghold rings", () => {
  const session = createInitialDemoSession();
  render(
    <TerritoryMap
      mapConfig={config}
      session={session}
      selectedTerritoryId="gunpo"
      onSelectTerritory={() => undefined}
    />,
  );
  const map = mapHarness.instances[0];
  map.emit("load");

  const layerIds = map.layers.map((layer) => layer.id);
  expect(layerIds.indexOf("preview-territory-fill"))
    .toBeLessThan(layerIds.indexOf("preview-territory-selected"));
  expect(layerIds.indexOf("preview-territory-selected"))
    .toBeLessThan(layerIds.indexOf("preview-territory-outline"));
  expect(layerIds.indexOf("preview-territory-selected-outline"))
    .toBeLessThan(layerIds.indexOf("preview-stronghold-symbols"));
  expect(map.layers.find((layer) => layer.id === "preview-territory-selected")).toMatchObject({
    type: "fill",
    filter: ["==", ["id"], "gunpo"],
    paint: { "fill-color": ["get", "ownerColor"], "fill-opacity": 0.38 },
  });
  expect(map.layers.find((layer) => layer.id === "preview-stronghold-symbols")?.paint)
    .toEqual(expect.objectContaining({
      "circle-stroke-color": ["get", "ownerColor"],
      "circle-stroke-width": 2,
    }));
});
```

- [ ] **Step 2: Change desktop and mobile camera expectations**

Update the existing `fitBounds` assertions:

```ts
expect(map.fitBounds).toHaveBeenLastCalledWith(
  [[128.4813, 35.7683], [128.7623, 36.0093]],
  { padding: 56, maxZoom: 9, duration: 700 },
);

expect(map.fitBounds).toHaveBeenLastCalledWith(
  [[126.8229, 35.1501], [127.0058, 35.2546]],
  { padding: 32, maxZoom: 9, duration: 700 },
);
```

Retain the reduced-motion assertion with `{ padding: 32, maxZoom: 9, duration: 0 }`.

- [ ] **Step 3: Run the map test and verify RED**

Run: `npm test -- territory-map.test.tsx`

Expected failures:

- selected fill reports `0.22` instead of `0.38`
- stronghold stroke reports stage `match` expressions instead of `ownerColor` and `2`
- desktop `fitBounds` reports asymmetric `{ top: 56, right: 420, bottom: 56, left: 56 }`

- [ ] **Step 4: Implement the minimal map paint changes**

In `preview-territory-selected`:

```ts
paint: { "fill-color": ["get", "ownerColor"], "fill-opacity": 0.38 },
```

In `preview-stronghold-symbols`:

```ts
"circle-stroke-color": ["get", "ownerColor"],
"circle-stroke-width": 2,
```

Do not alter `circle-radius`, `circle-opacity`, icon size, labels, or stage data.

- [ ] **Step 5: Implement symmetric selected-territory camera padding**

Replace the selection padding branch with:

```ts
map.fitBounds(bounds, {
  padding: compact ? 32 : 56,
  maxZoom: 9,
  duration: reducedMotion ? 0 : 700,
});
```

Keep the centroid-based `flyTo`/`jumpTo` fallback only for territories without polygon bounds.

- [ ] **Step 6: Run focused map tests and verify GREEN**

Run: `npm test -- territory-map.test.tsx team-preview-map-presentation.test.ts`

Expected: PASS with the existing seed/tree/landmark radius assertions unchanged.

- [ ] **Step 7: Commit the map correction**

```bash
git add web/components/team-preview/territory-map.tsx web/tests/territory-map.test.tsx
git commit -m "fix: clarify selected territories on map"
```

---

### Task 4: Full Regression and Browser QA

**Files:**
- Verify only; do not modify unrelated user-owned documents or untracked artifacts.

**Interfaces:**
- Consumes: all deliverables from Tasks 1–3.
- Produces: verified demo entry and map interaction suitable for deployment.

- [ ] **Step 1: Run the complete automated test suite**

Run: `npm test`

Expected: all test files and tests PASS with no unhandled errors or timer warnings.

- [ ] **Step 2: Run static analysis**

Run: `npm run lint`

Expected: exit code 0.

- [ ] **Step 3: Build the Vercel production target**

Run: `npm run build:vercel`

Expected: exit code 0 and `.vercel/output` generated.

- [ ] **Step 4: Start the local app and verify the login screen**

Run: `npm run dev`

Then use agent-browser:

```bash
agent-browser open http://localhost:3000
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser eval 'document.querySelector("[data-nextjs-dialog], .vite-error-overlay") ? "ERROR_OVERLAY" : "OK"'
```

Expected: login heading, email/password controls, and login button are visible; error overlay reports `OK`.

- [ ] **Step 5: Verify login and brand transition controls**

Enter `fan@example.com` and `demo`, submit, and capture the full-screen brand transition. Verify automatic completion once and repeat in a cleared session to verify click/keyboard skip. Reload after completion and confirm the login and transition do not replay in the same tab.

- [ ] **Step 6: Verify Gunpo selection visually**

Choose BLACKPINK/BLINK, open the full territory list, and select 군포. Capture a screenshot and confirm:

- the entire Gunpo polygon is visibly filled with translucent BLINK pink
- Gunpo bounds sit in the center of the map viewport
- roads and labels remain readable through the fill
- seed, tree, and landmark rings use their owning fandom colors

- [ ] **Step 7: Verify mobile layout and reduced motion**

Set a mobile viewport, repeat login and Gunpo selection, and confirm no horizontal clipping and symmetric map framing. Emulate reduced motion and confirm the brand view and map camera do not animate.

- [ ] **Step 8: Check the final diff and repository status**

Run:

```bash
git diff --check
git status --short --branch
git log -4 --oneline
```

Expected: no whitespace errors; only pre-existing user-owned dirty files remain outside the committed implementation.
