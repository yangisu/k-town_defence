# K-Town Defense Consolidated MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Combine durable fandom membership with the live Busan catalog and real GPS/photo check-in flow in one monorepo release.

**Architecture:** Extend the existing FastAPI/PostgreSQL service with membership persistence and contracts, then compose the standalone membership UI behavior around the existing integrated tourism/check-in services. Keep one deny-by-default same-origin gateway and preserve demo fallback.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy async, PostgreSQL 17, Alembic, React 19, TypeScript 5.9, vinext, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-22-ktown-consolidated-mvp-design.md`

## Global Constraints

- Preserve the dirty main checkout and standalone web repository.
- Use `x-ktown-user-id` only as a trusted server-to-server assertion.
- Keep public place reads anonymous and require identity for membership/check-in writes.
- Follow red-green-refactor and commit every independently verified task.
- Never commit `.env`, `.env.local`, API keys, uploads, or database data.

---

### Task 1: Membership schema and seed

**Files:**
- Modify: `src/ktown_defense/infrastructure/models.py`
- Create: `alembic/versions/20260822_0003_membership.py`
- Create: `tests/integration/test_membership_migration.py`

**Interfaces:** Produces `UserModel`, `FandomModel`, `SeasonModel`, and `SeasonMembershipModel` plus a migrated current season and fandom catalog.

- [ ] Write a migration test that upgrades from `20260821_0002`, asserts tables,
  uniqueness, seeded fandoms, and one current season.
- [ ] Run `python -m pytest tests/integration/test_membership_migration.py -q`
  and confirm failure because revision `20260822_0003` does not exist.
- [ ] Add minimal models and migration with deterministic seed UUIDs.
- [ ] Re-run the focused test and existing migration tests.
- [ ] Commit as `feat: add durable fandom membership schema`.

### Task 2: Membership application and API

**Files:**
- Create: `src/ktown_defense/membership_application.py`
- Create: `src/ktown_defense/api/membership_routes.py`
- Modify: `src/ktown_defense/api/main.py`
- Create: `tests/api/test_membership_contract.py`
- Create: `tests/e2e/test_membership_persistence.py`

**Interfaces:** Produces the three `/api/v1` membership endpoints and stable error codes specified by the design.

- [ ] Write API tests for anonymous rejection, fandom listing, null membership,
  selection persistence, same-fandom idempotency, unknown fandom, and lock conflict.
- [ ] Run the focused tests and confirm 404/missing-route failures.
- [ ] Implement transactional membership queries and Pydantic response contracts.
- [ ] Run focused API/E2E tests and all backend integration tests.
- [ ] Commit as `feat: expose persistent fandom membership`.

### Task 3: Combined gateway contract

**Files:**
- Modify: `web/lib/server/ktown-gateway.ts`
- Modify: `web/app/api/ktown/[...path]/route.ts`
- Modify: `web/tests/ktown-gateway.test.ts`
- Create: `web/tests/membership-gateway.test.ts`

**Interfaces:** Extends `proxyKtownRequest` with exact fandom and membership routes while preserving place/check-in forwarding and query filtering.

- [ ] Add failing tests for the three membership method/path pairs, identity
  injection, body limit, unsupported content type, and forbidden paths.
- [ ] Run focused Vitest files and confirm allowlist failures.
- [ ] Implement the minimal allowlist/body handling changes.
- [ ] Re-run the focused gateway suite.
- [ ] Commit as `feat(web): unify membership and checkin gateway`.

### Task 4: Membership UI composition

**Files:**
- Create: `web/components/membership/fandom-option.tsx`
- Create: `web/components/membership/membership-gate.tsx`
- Create: `web/features/membership/membership-context.tsx`
- Modify: `web/features/ktown-app.tsx`
- Modify: `web/lib/domain.ts`
- Modify: `web/lib/http-services.ts`
- Modify: `web/lib/demo-services.ts`
- Modify: `web/lib/service-factory.ts`
- Create: `web/tests/membership-context.test.tsx`
- Create: `web/tests/membership-gate.test.tsx`
- Modify: `web/tests/service-factory.test.ts`

**Interfaces:** Adds `MembershipService` to `AppServices`; integrated mode uses HTTP, demo mode uses isolated in-memory membership, and `KTownApp` renders only after membership selection.

- [ ] Port the standalone branch's consumer-level tests, adapting them to the
  integrated service bundle; confirm failures for missing membership interfaces.
- [ ] Add membership domain types and demo/HTTP adapters.
- [ ] Add provider and accessible selection gate, then compose it around the live app.
- [ ] Run membership, live-place, and real-check-in component tests.
- [ ] Commit as `feat(web): gate live tourism by fandom membership`.

### Task 5: Consolidated verification and handoff

**Files:**
- Modify: `README.md`
- Modify: `web/README.md`
- Modify: `web/.env.example`

**Interfaces:** Documents one runnable local flow from migration through membership and check-in.

- [ ] Add run instructions and truthful deferred-scope copy.
- [ ] Run 102 domain tests and all PostgreSQL API/integration/E2E tests.
- [ ] Run the complete web suite twice, lint, and production build.
- [ ] Re-sync 100 Busan places after destructive test fixtures finish.
- [ ] Start API/web and smoke-test health, fandom selection, live places, and
  authenticated check-in creation through the gateway.
- [ ] Commit as `docs: add consolidated mvp runbook` and present branch integration options.
