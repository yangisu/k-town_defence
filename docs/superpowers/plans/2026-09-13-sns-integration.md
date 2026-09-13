# SNS Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a visitor sign in with Kakao, Naver, or Google when the app is not embedded in ChatGPT; share a check-in success or territory result to social platforms; and invite a friend with an attributed link — in that order, without weakening the existing platform-trust identity model.

**Architecture:** Today, identity is fully delegated to the caller: in production the ChatGPT platform injects `oai-authenticated-user-id` (`web/app/chatgpt-auth.ts`, `web/app/api/ktown/[...path]/route.ts`), the Next.js gateway forwards it as `X-KTown-User-Id`, and the FastAPI backend trusts that header verbatim (`src/ktown_defense/api/dependencies.py:get_user_id`) — it does not verify a signature, so the *only* security boundary is "the gateway is the sole trusted caller." SNS login adds a second, equally-trusted identity source for the standalone Vercel path: a signed app-session cookie, issued after an OAuth code exchange, that resolves to the same kind of opaque string already stored in `UserModel.platform_subject` (e.g. `kakao:{provider_user_id}`). No change to the backend's trust model is needed — only the gateway's identity-resolution priority changes. Share and invite are additive, read-mostly features layered on top of existing check-in and territory data; neither may create or adjust territory points, mirroring the existing "recommendations never affect points" constraint in the master roadmap.

**Tech Stack:** Next.js Route Handlers, a signed HTTP-only session cookie (e.g. `iron-session`; confirm choice in Task 1 Step 1 — avoid pulling in a full auth framework given the app is primarily a thin gateway), Kakao/Naver/Google OAuth 2.0 authorization-code flow, FastAPI, SQLAlchemy 2, Alembic, existing `maplibre`-free share UI (Web Share API + per-provider SDK fallback for KakaoTalk).

## Global Constraints

- The backend must keep trusting `X-KTown-User-Id` only from the Next.js gateway; the gateway must keep setting it only from a source it has itself verified (the ChatGPT header, or a session cookie it minted and signed) — never from arbitrary client input.
- When a request carries both a valid ChatGPT platform header and an SNS session cookie, the ChatGPT header wins; the SNS session is the fallback identity for the standalone (non-embedded) deployment.
- OAuth access/refresh tokens are never persisted past the callback request; only the provider's stable subject id and the profile fields needed for display (nickname, avatar) are stored.
- Sharing and invites are read/attribution features only: they must never grant territory points, mission credit, or auto-verify adult status or fandom membership. An invited user still completes normal onboarding (`PUT /api/v1/me/season-membership`).
- Provider secrets (Kakao/Naver/Google client secret, session signing key) live only in environment variables, never in source or snapshots, consistent with the existing `KTOUR_SERVICE_KEY` handling.
- Preserve all passing tests; run the full suite (`python -m unittest discover -s tests -v`, `pytest tests/api tests/integration tests/e2e -q`, `npm test` in `web/`) after each task.

---

## File Map

```text
web/lib/server/social-auth.ts
web/lib/server/session.ts
web/app/api/auth/[provider]/route.ts
web/app/api/auth/[provider]/callback/route.ts
web/app/api/ktown/[...path]/route.ts
web/components/auth/social-login-buttons.tsx
web/components/share/share-sheet.tsx
web/features/share/build-share-card.ts
web/app/share/[kind]/[id]/opengraph-image.tsx
web/features/invite/invite-link.ts
web/tests/social-auth.test.ts
web/tests/session.test.ts
web/tests/share-sheet.test.tsx
src/ktown_defense/infrastructure/models.py
alembic/versions/20260913_0005_social_profile_invites.py
src/ktown_defense/social_profile.py
src/ktown_defense/invites.py
src/ktown_defense/api/auth_routes.py
src/ktown_defense/auth.py
ktown-defense.contracts.yaml
tests/test_social_profile.py
tests/test_invites.py
tests/api/test_auth_routes.py
```

### Task 1: Social Login (Kakao, Naver, Google)

**Files:**
- Create: `web/lib/server/session.ts`, `web/lib/server/social-auth.ts`, `web/lib/server/return-path.ts`, `web/lib/server/request-origin.ts`
- Create: `web/app/api/auth/[provider]/route.ts`, `web/app/api/auth/[provider]/callback/route.ts`
- Modify: `web/app/api/ktown/[...path]/route.ts`, `web/app/chatgpt-auth.ts` (extracted its private return-path check into the new shared `return-path.ts` rather than duplicating it)
- Create: `web/components/auth/social-login-buttons.tsx`, `web/app/signin/page.tsx`
- Create: `src/ktown_defense/api/auth_routes.py`, `src/ktown_defense/social_profile.py`
- Modify: `src/ktown_defense/infrastructure/models.py`
- Create: `alembic/versions/20260913_0005_social_profile.py`
- Test: `web/tests/social-auth.test.ts`, `web/tests/session.test.ts`, `tests/api/test_auth_routes.py`

**Interfaces:**
- Produces: `GET /api/auth/{provider}` — redirects to the provider's authorization URL with a CSRF `state`.
- Produces: `GET /api/auth/{provider}/callback` — exchanges the code, fetches the profile, upserts the backend user, sets the session cookie, redirects to `return_to`.
- Produces (backend, gateway-only): `POST /api/v1/auth/social/upsert` — `{ platformSubject, displayName, avatarUrl }` → `{ userId, platformSubject, displayName, avatarUrl }`.
- Modifies: `proxyKtownRequest` identity resolution order: ChatGPT header → SNS session cookie → dev env var.

> **Correction found during implementation:** `src/ktown_defense/auth.py` (`ROUTE_POLICIES`/`authorize`) and `ktown-defense.contracts.yaml` do **not** gate the real deployed app (`ktown_defense.api.main:app`) — they are wired only into the separate legacy prototype `src/ktown_defense/app.py` (see `test_rbac_integration.py`, `test_write_api_validation.py`, which assert against `ROUTE_POLICIES`/`WRITE_CONTRACTS` directly, never against `api/main.py`'s actual FastAPI routes). Every real `api/v1/*` route instead relies on the per-router `X-KTown-User-Id` header dependency pattern (`api/dependencies.py::get_user_id`, `api/membership_routes.py::get_membership_subject`). `POST /api/v1/auth/social/upsert` follows that same existing trust boundary — reachable only from whatever network position can already reach `KTOWN_API_BASE_URL` (the Next.js gateway) — and neither `auth.py` nor `ktown-defense.contracts.yaml` needed to change.

- [x] **Step 1: Decide and record the session-cookie approach**

Decided against `iron-session` (an extra dependency the sandbox couldn't `npm install` with network access under review) in favor of a hand-rolled `base64url(json) + "." + HMAC-SHA256` cookie using only Node's built-in `node:crypto`, verified in constant time via `timingSafeEqual`. See the doc comment at the top of `web/lib/server/session.ts`.

- [x] **Step 2: Write provider redirect and callback tests**

Tested the underlying pure modules (`web/tests/session.test.ts`, `web/tests/social-auth.test.ts`) rather than the Next.js Route Handlers directly, matching this repo's existing convention of testing `proxyKtownRequest` instead of `web/app/api/ktown/[...path]/route.ts` (see `web/tests/membership-gateway.test.ts`) — the codebase has no `next/headers`/`next/server` test mocking set up, and the route handlers here are thin glue over these tested modules.

```ts
test("callback exchanges code, upserts user, and sets a session cookie", async () => {
  const response = await GET(callbackRequest("kakao", { code: "abc", state: validState }));
  expect(response.headers.get("set-cookie")).toMatch(/ktown_session=/);
});

test("unknown provider is rejected", async () => {
  const response = await GET(startRequest("facebook"));
  expect(response.status).toBe(404);
});
```

- [x] **Step 3: Run and confirm the routes are absent**

Confirmed via `npx vitest run tests/session.test.ts tests/social-auth.test.ts` failing to resolve `@/lib/server/session` / `@/lib/server/social-auth` before either file existed.

- [x] **Step 4: Implement OAuth start/callback and session cookie**

Implemented as designed: `state` is itself carried in a second short-lived signed cookie (`ktown_oauth_state_{provider}`, 10-minute expiry) rather than a server-side store, verified against the callback's `state` query param before any code exchange happens. The client secret is read from `process.env` inside `web/lib/server/social-auth.ts` and never appears in a response.

- [x] **Step 5: Add the backend upsert route and columns**

Implemented `display_name`/`avatar_url` on `UserModel` (`src/ktown_defense/infrastructure/models.py`) plus `alembic/versions/20260913_0005_social_profile.py`, and `POST /api/v1/auth/social/upsert` (`src/ktown_defense/api/auth_routes.py`, backed by `src/ktown_defense/social_profile.py::SocialProfileApplication.upsert`, mirroring the find-or-create pattern already used by `membership_application.py::select_fandom`). **Did not** touch `auth.py`/`ktown-defense.contracts.yaml` — see the correction note above this task.

- [x] **Step 6: Wire gateway identity priority**

Implemented in `web/app/api/ktown/[...path]/route.ts` via a new `resolvePlatformUserId()`: ChatGPT header → `readSessionPayload(cookies().get(SESSION_COOKIE_NAME))` → dev env var, in that order.

- [x] **Step 7: Add sign-in buttons and run the full suite**

Added `web/components/auth/social-login-buttons.tsx` and a minimal `web/app/signin/page.tsx` (this app had no prior sign-in page at all — production auth was previously 100% delegated to the ChatGPT platform header).

Ran: `cd web && npx vitest run` → **306/306 passed**. `cd web && npm run lint` → clean. `cd web && npm run build` → succeeds and lists the new `/api/auth/:provider`, `/api/auth/:provider/callback`, `/signin` routes.
Ran: `python -m unittest discover -s tests -v` → **102/102 passed** (pure-domain suite, unaffected).

**Verified against a live Postgres** (user started `docker compose up -d postgres`; migrations applied to both the `ktown` and `ktown_test` databases — the latter needs its own `alembic upgrade head` since `tests/conftest.py`'s `KTOWN_TEST_DATABASE_URL` defaults to a separate `ktown_test` database that the compose init script only creates empty): `python -m pytest tests/api tests/integration tests/e2e -q` → **52/52 passed**, including all 3 `tests/api/test_auth_routes.py` cases.

- [x] **Step 8: Commit social login**

```bash
git add web/lib/server/session.ts web/lib/server/social-auth.ts web/lib/server/return-path.ts web/lib/server/request-origin.ts web/app/api/auth web/app/api/ktown/[...path]/route.ts web/app/chatgpt-auth.ts web/app/signin web/components/auth/social-login-buttons.tsx web/app/globals.css web/.env.example .env.example src/ktown_defense/api/auth_routes.py src/ktown_defense/social_profile.py src/ktown_defense/infrastructure/models.py alembic tests/api/test_auth_routes.py web/tests/social-auth.test.ts web/tests/session.test.ts docs/superpowers/plans/2026-09-13-sns-integration.md
git commit -m "feat: add Kakao/Naver/Google social login alongside ChatGPT platform auth"
```

### Task 2: Share Check-in and Territory Results

**Files:**
- Create: `web/components/share/share-sheet.tsx`, `web/features/share/build-share-card.ts`
- Create: `web/app/share/[kind]/[id]/opengraph-image.tsx`
- Modify: `web/components/check-in/check-in-flow.tsx` (trigger point after a successful submit)
- Modify: `web/features/team-preview/territory-summary.ts` consumer (trigger point on the summary screen)
- Test: `web/tests/share-sheet.test.tsx`

**Interfaces:**
- Produces: `buildShareCard(kind: "checkin" | "territory", data, origin?) -> { title, description, imageUrl, shareUrl }`
- Produces: `<ShareSheet card={...} label? />` — Web Share API (`navigator.share`) when available, else copies the link.
- Produces: `GET /share/{kind}/{id}` (page, with `generateMetadata` OG tags) and `GET /share/{kind}/{id}/image` (dynamic `next/og` `ImageResponse`).

> **Corrections found during implementation:**
> - **No Kakao JS SDK.** That needs a separate "JavaScript 키" from the Kakao app (different from the REST API key Task 1 already uses for login) which isn't provisioned. Relying on `navigator.share` instead: on mobile it already lists KakaoTalk/Naver/X/etc. as targets with zero provider SDKs or keys. Desktop browsers without `navigator.share` fall back to `navigator.clipboard.writeText`.
> - **No `GET /api/v1/seasons/current/strongholds`.** That route only exists in the legacy prototype's RBAC table (`src/ktown_defense/auth.py`), not the real deployed API (same finding as Task 1). Since the territory summary being shared is itself demo/preview client-side data (`web/features/team-preview/*`), not backend data, the territory share link instead carries `fandom`/`owned`/`strongest` as query params (`/share/territory/current?fandom=ARMY&owned=12&strongest=부산`) — no backend call needed. The checkin kind *does* have a real public backend route (`GET /api/v1/places/{placeId}`) and uses it.
> - **`next/og`'s `ImageResponse` works under vinext** (confirmed via `node_modules/vinext/dist/check.js`: `"next/og": { status: "supported" }`) — verified live in the browser, a real 1200×630 PNG renders correctly.

**Files (as built):**
- `web/features/share/build-share-card.ts` (+ `web/tests/share-sheet.test.ts`)
- `web/components/share/share-sheet.tsx`
- `web/app/share/[kind]/[id]/subject.ts` (shared resolver for the page and the image, so a visitor who isn't the sharer sees the same generic public content)
- `web/app/share/[kind]/[id]/page.tsx`, `web/app/share/[kind]/[id]/image/route.tsx`
- Modified: `web/components/check-in/check-in-flow.tsx` (share button next to "계속하기"/"여행 계속하기", pointsAwarded omitted for a `pending` integrated check-in), `web/components/team-preview/territory-view.tsx` (share button rendered as a **sibling after** `<section className="territory-summary">`, not inside it — putting it inside shifted `within(summaryRegion).getAllByRole("button")` indices in `tests/team-preview-territory.test.tsx`, which two pre-existing tests scope specifically to that region)
- Modified: `web/components/ui/icons.tsx` (added `Share2`)

- [x] **Step 1: Write share-card content tests** — `web/tests/share-sheet.test.ts`, 5 cases (checkin with/without points, territory with/without a strongest territory, shareUrl shape).
- [x] **Step 2: Run and confirm the builder is absent** — confirmed via import failure before the file existed.
- [x] **Step 3: Implement the OG image route and share sheet** — see corrections above.
- [x] **Step 4: Hook the trigger points** — done in both files listed above.
- [x] **Step 5: Verify**

Ran: `cd web && npx vitest run` → **311/311 passed**. `npm run lint` → clean (after fixing a `no-html-link-for-pages` finding: the share page's "앱에서 열기" needed `next/link`'s `Link`, not a bare `<a>`). `npm run build` → succeeds and lists `/share/:kind/:id` and `/share/:kind/:id/image`.
Manually verified in the browser against the running dev server: `/share/territory/current?fandom=ARMY&owned=12&strongest=부산` renders the card text and its `/image` sibling renders a real dark-green 1200×630 PNG; clicking "영토 현황 공유하기" in the actual team-preview UI (after selecting BTS/ARMY) shows the button positioned correctly outside the 4-stat grid.
**Known cosmetic issue:** the share page's dev-mode console logs an "Invalid hook call" from vinext's `next/link` shim (`Cannot read properties of null (reading 'useState')`) on this route. The rendered `<a href="/">` still works — clicking it navigates correctly — and `npm run build`'s production output has no such error, so this looks like a vinext dev-server/HMR-only quirk rather than a real defect, but flag it if it recurs after a real deploy.

- [x] **Step 6: Commit share flow**

### Task 3: Friend Invite

**Files:**
- Create: `web/features/invite/invite-link.ts`
- Create: `src/ktown_defense/invites.py`
- Modify: `src/ktown_defense/infrastructure/models.py`, `src/ktown_defense/auth.py`, `ktown-defense.contracts.yaml`
- Test: `tests/test_invites.py`, `tests/api/test_auth_routes.py`

**Interfaces:**
- Produces: `POST /api/v1/me/invites` (Audience.MEMBER) → `{ code }`, idempotent per user (returns the existing code if one exists).
- Produces: `POST /api/v1/invites/{code}/claim` (Audience.MEMBER) → records `{ inviter_user_id, invitee_user_id, claimed_at }` once; a second claim by the same invitee is a no-op idempotent replay; self-claim is rejected.

- [ ] **Step 1: Write issue/claim/self-claim tests**

```python
def test_claiming_own_code_is_rejected(member_client, invite_code):
    response = member_client.post(f"/api/v1/invites/{invite_code}/claim")
    assert response.status_code == 409
    assert response.json()["code"] == "SELF_INVITE_NOT_ALLOWED"
```

- [ ] **Step 2: Run and confirm the endpoints are absent**

Run: `python -m pytest tests/test_invites.py -v` — expect FAIL with 404.

- [ ] **Step 3: Add `referral_code` and an `invites` table**

```python
class InviteModel(Base):
    __tablename__ = "invites"
    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    inviter_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    invitee_user_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    code: Mapped[str] = mapped_column(String(16), unique=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
```

No points or membership side effects on claim — attribution only.

- [ ] **Step 4: Wire the invite link into onboarding**

Surface `?ref={code}` on the season-membership selection screen; on selection completion, call the claim endpoint (best-effort, non-blocking).

- [ ] **Step 5: Verify**

Run: `python -m pytest tests/test_invites.py tests/api/test_auth_routes.py -v`  
Run: `python -m pytest tests/api/test_write_contract_routes.py -v` (contract still matches `ktown-defense.contracts.yaml`).

- [ ] **Step 6: Commit friend invite**

```bash
git add src/ktown_defense/invites.py src/ktown_defense/infrastructure/models.py src/ktown_defense/auth.py alembic ktown-defense.contracts.yaml tests/test_invites.py web/features/invite
git commit -m "feat: add attribution-only friend invite links"
```

## Plan Completion Gate

- [ ] A visitor on the standalone (Vercel) deployment can sign in with Kakao, Naver, or Google and reach the same member-only routes an embedded ChatGPT user reaches.
- [ ] The backend still trusts only `X-KTown-User-Id` set by the gateway; no route accepts a client-supplied identity.
- [ ] A completed check-in and a territory summary can each be shared with a public-safe card that never exposes raw GPS or private evidence.
- [ ] A member can generate one stable invite code and share it; a friend claiming it records attribution once, grants zero points, and self-claims are rejected.
- [ ] Full backend and web test suites pass; `ktown-defense.contracts.yaml` matches every new route.
