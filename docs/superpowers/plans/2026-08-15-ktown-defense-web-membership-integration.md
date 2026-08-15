# K-Town Defense Web Membership Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the web app's hard-coded fandom identity with the persisted current-season membership API, while preserving demo tourism data and accurately presenting check-in review and point-processing states.

**Architecture:** Keep the existing `AppServices` seam and add a focused membership service. The Sites worker exposes a same-origin `/api/ktown/*` gateway to the private backend binding, while the client uses an HTTP membership adapter in hybrid mode and retains demo adapters for tourism, expeditions, battles, and check-in collection. A membership provider owns bootstrap, selection, locking, and error states so presentation components never parse transport DTOs.

**Tech Stack:** React 19, TypeScript 5.9, Vinext/Next App Router, Cloudflare Worker Fetcher bindings, Vitest, Testing Library, FastAPI membership HTTP contract.

## Global Constraints

- Scope this release to the user-facing web app; do not add the operator console.
- Keep tourism, expedition, battle, journey, and check-in collection on demo services until their FastAPI routes exist.
- Use the deployed Sites origin and a same-origin `/api/ktown/*` gateway; client components must not call a backend origin directly.
- Production API mode requires an owner-approved private `CUSTOMER_HTTP_KTOWN_API` binding and a backend identity adapter that converts trusted Sites identity headers into an active adult member principal.
- The backend must expose `GET /api/v1/fandoms`, `GET /api/v1/me/season-membership`, and `PUT /api/v1/me/season-membership` before production hybrid mode is enabled.
- Preserve the backend response field names at the transport boundary and map them to camelCase domain types exactly once.
- Never expose object-storage keys, private photo URLs, service credentials, or backend bearer credentials to browser code.
- Keep the current mobile-first responsive layout, keyboard behavior, focus management, and Korean user-facing copy.
- Every behavior change follows red-green-refactor and ends with a focused commit in the `web` repository.

## Release Boundary and Follow-up Plans

This plan produces one testable release: persisted fandom selection and dynamic membership-aware UI. Create separate implementation plans after the corresponding FastAPI routes exist for:

1. Real place discovery and regional map projections.
2. Browser GPS, camera upload, session recovery, and check-in submission.
3. Stronghold, leaderboard, journey, and SSE/polling projections.
4. Operator review, DLQ, governance, and season-finalization console.

## File Structure

### New files

- `web/lib/api/api-error.ts` — stable typed transport error and response parsing.
- `web/lib/api/ktown-client.ts` — same-origin JSON client for `/api/ktown`.
- `web/lib/api/membership-mappers.ts` — snake_case DTO to domain mapping.
- `web/lib/http-membership-service.ts` — real membership service implementation.
- `web/lib/service-factory.ts` — selects demo or hybrid services from runtime mode.
- `web/features/membership/membership-context.tsx` — bootstrap and mutation state owner.
- `web/components/membership/membership-gate.tsx` — loading, error, and selection UI.
- `web/components/membership/fandom-option.tsx` — accessible fandom choice.
- `web/tests/ktown-client.test.ts` — HTTP and stable error contract tests.
- `web/tests/http-membership-service.test.ts` — DTO mapping and endpoint tests.
- `web/tests/membership-context.test.tsx` — provider state transition tests.
- `web/tests/membership-gate.test.tsx` — user interaction and accessibility tests.
- `web/tests/worker-gateway.test.ts` — private binding gateway tests.

### Modified files

- `web/worker/index.ts` — route `/api/ktown/*` through the private backend binding.
- `web/lib/domain.ts` — add fandom, membership, viewer-season, and point-status contracts.
- `web/lib/demo-data.ts` — add deterministic demo fandom and membership fixtures.
- `web/lib/demo-services.ts` — implement the membership service and richer check-in result.
- `web/app/page.tsx` — create services once and wrap the app in membership state.
- `web/components/app-shell.tsx` — render dynamic fandom and season summary.
- `web/components/battle/battle-view.tsx` — render the selected fandom instead of ARMY.
- `web/components/journey/journey-view.tsx` — render the selected fandom and season.
- `web/components/check-in/check-in-flow.tsx` — distinguish verification from point processing and update privacy copy.
- `web/components/check-in/check-in-reducer.ts` — represent processing and terminal decisions explicitly.
- `web/app/globals.css` — membership gate and result-state styles.
- `web/vitest.config.ts` — include Worker gateway tests if the existing environment exclusion blocks them.
- `web/.env.example` — document `NEXT_PUBLIC_KTOWN_DATA_MODE=demo|hybrid` without secrets.
- `web/README.md` — document local modes, binding contract, and smoke tests.

---

### Task 1: Add the same-origin private backend gateway

**Files:**
- Modify: `web/worker/index.ts`
- Test: `web/tests/worker-gateway.test.ts`

**Interfaces:**
- Consumes: Cloudflare `Fetcher` binding named `CUSTOMER_HTTP_KTOWN_API`.
- Produces: `proxyKTownRequest(request: Request, backend: Fetcher): Promise<Response>` and the browser-facing `/api/ktown/*` namespace.

- [ ] **Step 1: Write the failing gateway tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { proxyKTownRequest } from "@/worker/index";

describe("proxyKTownRequest", () => {
  it("removes the public prefix and preserves query parameters", async () => {
    const fetch = vi.fn(async (request: Request) =>
      Response.json({ forwarded: new URL(request.url).pathname }),
    );
    const response = await proxyKTownRequest(
      new Request("https://web.test/api/ktown/api/v1/me/season-membership?fresh=1"),
      { fetch } as unknown as Fetcher,
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(await response.json()).toEqual({
      forwarded: "/api/v1/me/season-membership",
    });
  });

  it("does not forward a browser-supplied authorization credential", async () => {
    const fetch = vi.fn(async (request: Request) =>
      Response.json({ authorization: request.headers.get("authorization") }),
    );
    const response = await proxyKTownRequest(
      new Request("https://web.test/api/ktown/health", {
        headers: { Authorization: "Bearer browser-controlled" },
      }),
      { fetch } as unknown as Fetcher,
    );
    expect(await response.json()).toEqual({ authorization: null });
  });
});
```

- [ ] **Step 2: Run the test and verify the missing export failure**

Run: `npm test -- tests/worker-gateway.test.ts`

Expected: FAIL because `proxyKTownRequest` is not exported.

- [ ] **Step 3: Implement the minimal gateway**

Add the binding to `Env`, export the helper, strip `/api/ktown`, and build a fresh outbound header allowlist. Never clone arbitrary browser headers into the private request.

```ts
interface Env {
  ASSETS: Fetcher;
  CUSTOMER_HTTP_KTOWN_API?: Fetcher;
  // existing bindings stay unchanged
}

const KTOWN_PREFIX = "/api/ktown";

export async function proxyKTownRequest(
  request: Request,
  backend: Fetcher,
): Promise<Response> {
  const source = new URL(request.url);
  const target = new URL(source.toString());
  target.pathname = source.pathname.slice(KTOWN_PREFIX.length) || "/";
  const headers = new Headers();
  for (const name of ["accept", "content-type", "idempotency-key"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  for (const name of ["oai-authenticated-user-id"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const body = request.method === "GET" || request.method === "HEAD"
    ? undefined
    : request.body;
  return backend.fetch(new Request(target, { method: request.method, headers, body }));
}
```

In `worker.fetch`, return `503` with `{"detail":{"code":"BACKEND_BINDING_UNAVAILABLE"}}` when the path uses the prefix but the binding is absent.

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- tests/worker-gateway.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the gateway**

```powershell
git add worker/index.ts tests/worker-gateway.test.ts
git commit -m "feat: add private backend gateway"
```

---

### Task 2: Define membership domain and transport contracts

**Files:**
- Modify: `web/lib/domain.ts`
- Create: `web/lib/api/api-error.ts`
- Create: `web/lib/api/ktown-client.ts`
- Create: `web/lib/api/membership-mappers.ts`
- Test: `web/tests/ktown-client.test.ts`

**Interfaces:**
- Consumes: same-origin `/api/ktown` responses.
- Produces: `FandomSummary`, `SeasonMembership`, `ViewerSeason`, `MembershipService`, `ApiError`, `requestJson<T>()`, and mapping functions.

- [ ] **Step 1: Add failing client and mapper tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/api-error";
import { requestJson } from "@/lib/api/ktown-client";
import { mapMembership } from "@/lib/api/membership-mappers";

it("maps membership transport fields once", () => {
  expect(mapMembership({
    user_id: "user-1",
    season_id: "season-1",
    fandom_id: "fandom-1",
    locked_at: "2026-08-15T00:00:00Z",
  })).toEqual({
    userId: "user-1",
    seasonId: "season-1",
    fandomId: "fandom-1",
    lockedAt: "2026-08-15T00:00:00Z",
  });
});

it("throws a stable ApiError for backend errors", async () => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    Response.json({ detail: { code: "CURRENT_SEASON_NOT_CONFIGURED" } }, { status: 503 }),
  ));
  await expect(requestJson("/health")).rejects.toEqual(
    new ApiError(503, "CURRENT_SEASON_NOT_CONFIGURED"),
  );
});
```

- [ ] **Step 2: Run the tests and verify missing module failures**

Run: `npm test -- tests/ktown-client.test.ts`

Expected: FAIL because the API modules do not exist.

- [ ] **Step 3: Add exact domain interfaces**

```ts
export interface FandomSummary {
  id: string;
  name: string;
  artistName: string | null;
}

export interface SeasonMembership {
  userId: string;
  seasonId: string;
  fandomId: string;
  lockedAt: string | null;
}

export interface ViewerSeason {
  seasonLabel: string;
  fandom: FandomSummary;
  membershipLocked: boolean;
}

export interface MembershipService {
  listFandoms(): Promise<FandomSummary[]>;
  getCurrent(): Promise<SeasonMembership | null>;
  selectFandom(fandomId: string): Promise<SeasonMembership>;
}
```

Add `membership: MembershipService` to `AppServices`.

- [ ] **Step 4: Implement stable error parsing and DTO mapping**

`requestJson<T>(path, init)` must call `${KTOWN_API_PREFIX}${path}`, parse `detail.code`, use `HTTP_<status>` when a stable code is absent, and throw `ApiError(0, "NETWORK_ERROR")` for a rejected fetch.

```ts
export const KTOWN_API_PREFIX = "/api/ktown";

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
    this.name = "ApiError";
  }
}
```

- [ ] **Step 5: Run focused tests**

Run: `npm test -- tests/ktown-client.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the contracts**

```powershell
git add lib/domain.ts lib/api tests/ktown-client.test.ts
git commit -m "feat: define membership api contracts"
```

---

### Task 3: Implement demo and HTTP membership services

**Files:**
- Create: `web/lib/http-membership-service.ts`
- Create: `web/lib/service-factory.ts`
- Modify: `web/lib/demo-data.ts`
- Modify: `web/lib/demo-services.ts`
- Test: `web/tests/http-membership-service.test.ts`
- Test: `web/tests/demo-services.test.ts`

**Interfaces:**
- Consumes: Task 2's `MembershipService`, `requestJson`, and mappers.
- Produces: `httpMembershipService` and `createAppServices(mode: "demo" | "hybrid")`.

- [ ] **Step 1: Write failing service tests**

```ts
import { beforeEach, expect, it, vi } from "vitest";
import { httpMembershipService } from "@/lib/http-membership-service";

beforeEach(() => vi.restoreAllMocks());

it("selects a fandom using the exact backend body", async () => {
  const fetchMock = vi.fn(async () => Response.json({
    user_id: "user-1",
    season_id: "season-1",
    fandom_id: "fandom-2",
    locked_at: null,
  }));
  vi.stubGlobal("fetch", fetchMock);
  await httpMembershipService.selectFandom("fandom-2");
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/ktown/api/v1/me/season-membership",
    expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ fandom_id: "fandom-2" }),
    }),
  );
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/http-membership-service.test.ts tests/demo-services.test.ts`

Expected: FAIL because the HTTP service and membership demo methods do not exist.

- [ ] **Step 3: Implement the HTTP service**

Use these exact endpoints:

```ts
export const httpMembershipService: MembershipService = {
  async listFandoms() {
    const dto = await requestJson<{ items: FandomDto[] }>("/api/v1/fandoms");
    return dto.items.map(mapFandom);
  },
  async getCurrent() {
    const dto = await requestJson<MembershipDto | null>("/api/v1/me/season-membership");
    return dto ? mapMembership(dto) : null;
  },
  async selectFandom(fandomId) {
    const dto = await requestJson<MembershipDto>("/api/v1/me/season-membership", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fandom_id: fandomId }),
    });
    return mapMembership(dto);
  },
};
```

- [ ] **Step 4: Add deterministic demo membership state**

Add four demo fandoms matching existing leaderboard fixtures. Store the selected membership in module state, return a clone, and reject a different fandom with `new ApiError(422, "MEMBERSHIP_LOCKED")` after `lockedAt` is populated.

- [ ] **Step 5: Add the service factory**

`createAppServices("hybrid")` returns all existing demo services but replaces only `membership` with `httpMembershipService`. `createAppServices("demo")` returns the fully deterministic demo bundle.

- [ ] **Step 6: Run focused and existing service tests**

Run: `npm test -- tests/http-membership-service.test.ts tests/demo-services.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the service adapters**

```powershell
git add lib/http-membership-service.ts lib/service-factory.ts lib/demo-data.ts lib/demo-services.ts tests/http-membership-service.test.ts tests/demo-services.test.ts
git commit -m "feat: add hybrid membership services"
```

---

### Task 4: Add membership bootstrap state

**Files:**
- Create: `web/features/membership/membership-context.tsx`
- Test: `web/tests/membership-context.test.tsx`

**Interfaces:**
- Consumes: `MembershipService` from Task 2.
- Produces: `MembershipProvider`, `useMembership()`, and states `loading | selection_required | ready | error`.

- [ ] **Step 1: Write failing provider tests**

```tsx
it("requires selection when the member has no current membership", async () => {
  const service = fakeMembershipService({ membership: null });
  render(
    <MembershipProvider service={service}>
      <MembershipProbe />
    </MembershipProvider>,
  );
  expect(await screen.findByText("selection_required")).toBeInTheDocument();
});

it("becomes ready after selection without a reload", async () => {
  const service = fakeMembershipService({ membership: null });
  render(
    <MembershipProvider service={service}>
      <MembershipProbe select="fandom-1" />
    </MembershipProvider>,
  );
  expect(await screen.findByText("ready:fandom-1")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify missing provider failure**

Run: `npm test -- tests/membership-context.test.tsx`

Expected: FAIL because `MembershipProvider` does not exist.

- [ ] **Step 3: Implement a reducer-backed provider**

The context value must expose:

```ts
interface MembershipContextValue {
  status: "loading" | "selection_required" | "ready" | "error";
  fandoms: FandomSummary[];
  membership: SeasonMembership | null;
  viewerSeason: ViewerSeason | null;
  error: ApiError | null;
  selectFandom(fandomId: string): Promise<void>;
  retry(): Promise<void>;
}
```

Bootstrap `listFandoms()` and `getCurrent()` in parallel. Preserve the current fandom list after a mutation error, ignore stale async completions after unmount, and prevent concurrent selection requests.

- [ ] **Step 4: Run provider tests**

Run: `npm test -- tests/membership-context.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit membership state**

```powershell
git add features/membership/membership-context.tsx tests/membership-context.test.tsx
git commit -m "feat: add membership bootstrap state"
```

---

### Task 5: Build the fandom selection gate

**Files:**
- Create: `web/components/membership/membership-gate.tsx`
- Create: `web/components/membership/fandom-option.tsx`
- Modify: `web/app/globals.css`
- Test: `web/tests/membership-gate.test.tsx`

**Interfaces:**
- Consumes: `useMembership()` from Task 4.
- Produces: `MembershipGate({ children })` that blocks the main app until membership is ready.

- [ ] **Step 1: Write failing interaction tests**

```tsx
it("shows fandom choices and confirms the selected fandom", async () => {
  const user = userEvent.setup();
  renderMembershipGate({ membership: null });
  await user.click(await screen.findByRole("radio", { name: /ARMY/ }));
  await user.click(screen.getByRole("button", { name: "이 팬덤으로 시즌 시작" }));
  expect(fakeService.selectFandom).toHaveBeenCalledWith("fandom-army");
});

it.each([
  ["AUTHENTICATION_REQUIRED", "로그인이 필요해요"],
  ["FORBIDDEN", "이 계정으로는 참여할 수 없어요"],
  ["CURRENT_SEASON_NOT_CONFIGURED", "현재 시즌을 준비하고 있어요"],
  ["NETWORK_ERROR", "서버에 연결할 수 없어요"],
])("maps %s to Korean recovery copy", async (code, copy) => {
  renderMembershipGate({ bootstrapError: code });
  expect(await screen.findByText(copy)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify missing component failure**

Run: `npm test -- tests/membership-gate.test.tsx`

Expected: FAIL because the gate does not exist.

- [ ] **Step 3: Implement accessible selection UI**

Use a `<fieldset>` and radio inputs, retain focus on validation failure, announce mutation state with `aria-live="polite"`, and show this irreversible-action copy before submission:

```text
첫 승인 체크인이 반영되면 이번 시즌 팬덤은 변경할 수 없어요.
```

Do not show the main map behind the selection gate. When membership is ready, render `children` immediately.

- [ ] **Step 4: Add responsive styles**

Add `.membership-gate`, `.membership-card`, `.fandom-options`, `.fandom-option`, and error/loading variants. Verify a single column at 320px and a two-column option grid from 768px.

- [ ] **Step 5: Run gate tests**

Run: `npm test -- tests/membership-gate.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the gate**

```powershell
git add components/membership app/globals.css tests/membership-gate.test.tsx
git commit -m "feat: add fandom membership gate"
```

---

### Task 6: Replace hard-coded fandom and season identity

**Files:**
- Modify: `web/app/page.tsx`
- Modify: `web/components/app-shell.tsx`
- Modify: `web/components/battle/battle-view.tsx`
- Modify: `web/components/journey/journey-view.tsx`
- Modify: `web/components/explore/explore-view.tsx`
- Modify: `web/components/expedition/expedition-view.tsx`
- Test: `web/tests/fan-journey.test.tsx`
- Test: `web/tests/app-controller.test.ts`

**Interfaces:**
- Consumes: `MembershipGate`, `MembershipProvider`, `ViewerSeason`, and `createAppServices`.
- Produces: a single dynamic identity passed as props to all member-aware presentation components.

- [ ] **Step 1: Add failing dynamic identity tests**

```tsx
it("renders the persisted fandom throughout the app", async () => {
  renderApp({ fandom: { id: "fandom-carat", name: "CARAT", artistName: "SEVENTEEN" } });
  expect(await screen.findAllByText(/CARAT/)).not.toHaveLength(0);
  expect(screen.queryByText(/ARMY · 2위/)).not.toBeInTheDocument();
});

it("labels a locked membership in the season summary", async () => {
  renderApp({ lockedAt: "2026-08-15T00:00:00Z" });
  expect(await screen.findByText("이번 시즌 팬덤 확정")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify hard-coded copy failure**

Run: `npm test -- tests/fan-journey.test.tsx tests/app-controller.test.ts`

Expected: FAIL because components still render ARMY and static season copy.

- [ ] **Step 3: Wire the service factory and provider once**

In `page.tsx`, create the service bundle with `useMemo` using:

```ts
const mode = process.env.NEXT_PUBLIC_KTOWN_DATA_MODE === "hybrid" ? "hybrid" : "demo";
const services = useMemo(() => createAppServices(mode), [mode]);
```

Wrap the app in `MembershipProvider` and `MembershipGate`. Remove direct imports of `places` and `services`. Add `const [availablePlaces, setAvailablePlaces] = useState<Place[]>([])`, load `services.tourism.listPlaces({})` in an effect with an `active` cleanup flag, and resolve `checkInPlace` from `availablePlaces`. This keeps page composition independent of demo fixtures without adding a second data cache.

- [ ] **Step 4: Pass `viewerSeason` to member-aware components**

Replace static `ARMY`, `SEASON 01`, and `우리 팬덤 2위` content. Keep ranking position nullable until a real leaderboard response identifies the selected fandom. Render `순위 집계 중` instead of inventing a rank.

- [ ] **Step 5: Run focused UI tests**

Run: `npm test -- tests/fan-journey.test.tsx tests/app-controller.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit dynamic identity rendering**

```powershell
git add app/page.tsx components/app-shell.tsx components/battle components/journey components/explore components/expedition tests/fan-journey.test.tsx tests/app-controller.test.ts
git commit -m "feat: render persisted fandom identity"
```

---

### Task 7: Present verification and point-processing states accurately

**Files:**
- Modify: `web/lib/domain.ts`
- Modify: `web/lib/demo-services.ts`
- Modify: `web/components/check-in/check-in-reducer.ts`
- Modify: `web/components/check-in/check-in-flow.tsx`
- Modify: `web/app/globals.css`
- Test: `web/tests/check-in-reducer.test.ts`
- Test: `web/tests/fan-journey.test.tsx`

**Interfaces:**
- Consumes: existing `CheckInDecision` and the backend outbox semantics.
- Produces: `PointApplicationStatus = "pending" | "applied" | "retrying"` and UI that does not claim points before application.

- [ ] **Step 1: Add failing result-state tests**

```tsx
it("does not claim points while an approved check-in is processing", async () => {
  renderCheckIn({
    decision: "approved",
    pointStatus: "pending",
    awardedPoints: 120,
    pointsToCapture: 300,
    message: "방문 승인이 완료됐어요",
  });
  expect(await screen.findByText("포인트 반영 중")).toBeInTheDocument();
  expect(screen.queryByText("+120P")).not.toBeInTheDocument();
});

it("explains private sanitized photo storage before capture", () => {
  renderCheckInStart();
  expect(screen.getByText(/EXIF 위치정보를 제거한 뒤 비공개로 저장/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify current immediate-award failure**

Run: `npm test -- tests/check-in-reducer.test.ts tests/fan-journey.test.tsx`

Expected: FAIL because the result has no point status and always renders awarded points.

- [ ] **Step 3: Extend the result contract**

```ts
export type PointApplicationStatus = "pending" | "applied" | "retrying";

export interface CheckInResult {
  decision: CheckInDecision;
  pointStatus: PointApplicationStatus;
  awardedPoints: number;
  pointsToCapture: number;
  message: string;
}
```

Keep demo approval deterministic with `pointStatus: "applied"` so existing happy-path interaction remains available.

- [ ] **Step 4: Render the state matrix**

Use these exact user states:

| Decision | Point status | Primary copy |
|---|---|---|
| `approved` | `pending` | `포인트 반영 중` |
| `approved` | `retrying` | `포인트 반영이 지연되고 있어요` |
| `approved` | `applied` | `팬덤에 포인트를 보탰어요` |
| `review_required` | any | `운영자 검토가 필요해요` |
| `rejected` | any | `이번 방문은 인증되지 않았어요` |

Only display `+{awardedPoints}P` when decision is `approved` and point status is `applied`.

- [ ] **Step 5: Update privacy copy**

Replace the demo-only sentence with:

```text
GPS는 체크인 검증에만 사용하며, 사진은 EXIF 위치정보를 제거한 뒤 비공개로 저장해요.
```

- [ ] **Step 6: Run focused tests**

Run: `npm test -- tests/check-in-reducer.test.ts tests/fan-journey.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit accurate processing states**

```powershell
git add lib/domain.ts lib/demo-services.ts components/check-in app/globals.css tests/check-in-reducer.test.ts tests/fan-journey.test.tsx
git commit -m "feat: show checkin processing states"
```

---

### Task 8: Document modes and verify the release

**Files:**
- Modify: `web/.env.example`
- Modify: `web/README.md`
- Modify: `web/package.json` only if a dedicated smoke script is required.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: reproducible demo and hybrid startup instructions and a verified production artifact.

- [ ] **Step 1: Document non-secret runtime mode**

Add:

```dotenv
NEXT_PUBLIC_KTOWN_DATA_MODE=demo
```

Document that `hybrid` enables only membership HTTP calls and requires the private binding and three backend endpoints listed in Global Constraints.

- [ ] **Step 2: Run the complete frontend test suite**

Run: `npm test`

Expected: all Vitest files pass with no unhandled promise rejection.

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 4: Run a production build in demo mode**

Run: `$env:NEXT_PUBLIC_KTOWN_DATA_MODE='demo'; npm run build`

Expected: exit code 0 and a deployable Vinext artifact.

- [ ] **Step 5: Run a production build in hybrid mode**

Run: `$env:NEXT_PUBLIC_KTOWN_DATA_MODE='hybrid'; npm run build`

Expected: exit code 0 and no backend URL or credential in generated client assets.

- [ ] **Step 6: Perform local smoke verification**

Verify at 320px, 768px, and 1280px:

1. A new member cannot see the map before selecting a fandom.
2. Selection is keyboard-operable and announced to assistive technology.
3. Reload restores the persisted membership in hybrid mode.
4. Locked membership copy appears when `locked_at` is non-null.
5. API errors show the defined recovery message and retry action.
6. Demo tourism, expedition, battle, journey, and check-in navigation still works.
7. Approved-but-pending check-ins do not claim awarded points.

- [ ] **Step 7: Commit docs and configuration**

```powershell
git add .env.example README.md package.json
git commit -m "docs: add web membership runtime guide"
```

- [ ] **Step 8: Deploy only after backend readiness checks pass**

Before changing the current Sites production deployment to hybrid mode, verify through the private binding:

```text
GET /health                                      -> 200
GET /api/v1/fandoms                              -> 200 with at least one item
GET /api/v1/me/season-membership                 -> 200 or null for a signed-in member
PUT /api/v1/me/season-membership                 -> 200 and survives backend restart
```

If any check fails, deploy the UI in `demo` mode and retain the existing production behavior. Do not expose a public backend URL as a fallback.

## Final Verification

- [ ] Confirm `rg -n "ARMY · 2위|우리 팬덤 2위|demo-services" app components` returns no hard-coded viewer identity or page-level demo service import.
- [ ] Confirm `rg -n "Authorization|KTOWN_.*SECRET|service[_-]?key" dist .next` finds no credential material.
- [ ] Confirm membership selection, reload persistence, and locked membership are covered by tests.
- [ ] Confirm demo mode remains usable without a backend binding.
- [ ] Confirm hybrid mode fails closed with a recoverable Korean message when the binding or current season is unavailable.
