# K-Town Defense Integrated MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the vinext web application into the root repository and deliver a PostgreSQL-backed FastAPI vertical slice from public place discovery through durable check-in submission.

**Architecture:** The existing in-memory domain remains a fast compatibility layer while new FastAPI routes delegate to focused SQLAlchemy repositories and application services. The vinext application keeps its `AppServices` boundary, adds an HTTP implementation through a same-origin trusted gateway, and preserves the existing demo implementation as an explicit mode.

**Tech Stack:** Python 3.13, FastAPI 0.141.x, SQLAlchemy 2.0.x async ORM, asyncpg 0.31.x, Alembic 1.19.x, PostgreSQL 17, pytest 9.x, React 19, vinext 1.0 beta, Vitest 4, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-08-21-ktown-defense-integrated-mvp-design.md`

## Global Constraints

- Preserve every pre-existing modified or untracked user file; stage only task-owned paths.
- Move `web/.git` to a verified backup under the root `.git/` before adding `web/` to the root repository.
- Keep all existing 102 Python domain tests and 9 web tests passing.
- Use PostgreSQL for persistence tests; never silently substitute SQLite.
- Write and run one failing behavioral test before each production behavior.
- Never expose `KTOUR_SERVICE_KEY`, database passwords, trusted identity headers, or upstream error bodies to browser assets or API responses.
- Check-in submission ends in `pending`; it does not award points or claim approval.
- Keep battle and journey screens in explicit demo status.

---

## File Structure

### Root and runtime

- `.gitignore`: Python, Node, vinext, Wrangler, Alembic and local database artifacts.
- `pyproject.toml`: Python package, runtime dependencies and pytest configuration.
- `compose.yaml`: PostgreSQL development/test service on host port 55432.
- `.env.example`: non-secret backend, web mode and KTour configuration examples.

### Backend

- `src/ktown_defense/settings.py`: validated environment settings.
- `src/ktown_defense/api/main.py`: FastAPI factory and router registration.
- `src/ktown_defense/api/dependencies.py`: database session and trusted principal dependencies.
- `src/ktown_defense/api/errors.py`: stable error envelope and exception handlers.
- `src/ktown_defense/api/place_routes.py`: public place DTOs and reads.
- `src/ktown_defense/api/checkin_routes.py`: check-in DTOs and writes.
- `src/ktown_defense/infrastructure/database.py`: async engine/session construction.
- `src/ktown_defense/infrastructure/models.py`: SQLAlchemy tables and enums.
- `src/ktown_defense/infrastructure/repositories.py`: place and check-in persistence.
- `src/ktown_defense/checkin_application.py`: ownership, expiry, evidence and submission use cases.
- `alembic.ini`, `alembic/env.py`, `alembic/versions/*_initial_mvp.py`: schema migrations.

### Backend tests

- `tests/api/test_health.py`: application bootstrap.
- `tests/integration/conftest.py`: PostgreSQL lifecycle, migration and session fixtures.
- `tests/integration/test_migrations.py`: upgrade/downgrade behavior.
- `tests/api/test_places_api.py`: public list/detail behavior.
- `tests/api/test_checkin_sessions.py`: create/read/ownership behavior.
- `tests/api/test_checkin_evidence.py`: GPS and photo persistence/validation.
- `tests/api/test_checkin_submission.py`: readiness, expiry and idempotency.

### Web

- `web/app/api/ktown/[...path]/route.ts`: allowlisted same-origin gateway.
- `web/lib/http-services.ts`: backend DTO mapping.
- `web/lib/service-factory.ts`: demo/integrated service selection.
- `web/features/ktown-app.tsx`: client application extracted from the current page.
- `web/app/page.tsx`: server mode selection and client bootstrap.
- `web/tests/http-services.test.ts`: HTTP service behavior.
- `web/tests/service-factory.test.ts`: mode selection.
- `web/tests/ktown-gateway.test.ts`: identity/header/path security.
- `web/tests/integrated-check-in.test.tsx`: pending-state UI.

---

### Task 1: Integrate the web repository and bootstrap FastAPI

**Files:**
- Modify: `.gitignore`
- Modify: `.env.example`
- Create: `pyproject.toml`
- Create: `src/ktown_defense/settings.py`
- Create: `src/ktown_defense/api/__init__.py`
- Create: `src/ktown_defense/api/main.py`
- Test: `tests/api/test_health.py`

**Interfaces:**
- Produces: `create_app(settings: Settings | None = None) -> FastAPI`
- Produces: `Settings.database_url`, `Settings.ktour_service_key`, `Settings.environment`

- [ ] **Step 1: Preserve the nested web repository metadata**

Resolve `web/.git` and the destination `.git/web-nested-repository-backup`, verify both remain under the workspace root, then move the nested metadata and confirm the destination has `HEAD` and `objects`.

- [ ] **Step 2: Write the failing health test**

```python
from fastapi.testclient import TestClient

from ktown_defense.api.main import create_app


def test_health_reports_service_status() -> None:
    response = TestClient(create_app()).get("/health")
    assert response.status_code == 200
    assert response.json() == {"service": "ktown-defense", "status": "ok"}
```

- [ ] **Step 3: Run the test to verify RED**

Run: `python -m pytest tests/api/test_health.py -q`  
Expected: FAIL with `ModuleNotFoundError: ktown_defense.api`.

- [ ] **Step 4: Add the Python project and minimal application factory**

Pin compatible major/minor ranges in `pyproject.toml`, configure `src` packaging, implement environment settings without requiring secrets at import time, and return the exact health payload.

- [ ] **Step 5: Verify GREEN and the existing domain suite**

Run: `python -m pytest tests/api/test_health.py -q`  
Run: `python -m unittest discover -s tests -v`

- [ ] **Step 6: Add root ignore rules and stage the web tree**

Ignore `.env`, virtual environments, Python caches, `.pytest_cache`, `node_modules`, `.next`, `dist`, `.wrangler`, coverage files and local database volumes. Confirm `git status --short web` contains source files but not ignored generated files.

- [ ] **Step 7: Commit the independently runnable foundation**

```powershell
git add -- .gitignore .env.example pyproject.toml src/ktown_defense/settings.py src/ktown_defense/api tests/api/test_health.py web
git commit -m "build: integrate web and bootstrap FastAPI"
```

### Task 2: Add PostgreSQL and Alembic foundation

**Files:**
- Create: `compose.yaml`
- Create: `src/ktown_defense/infrastructure/__init__.py`
- Create: `src/ktown_defense/infrastructure/database.py`
- Create: `src/ktown_defense/infrastructure/models.py`
- Create: `alembic.ini`
- Create: `alembic/env.py`
- Create: `alembic/script.py.mako`
- Create: `alembic/versions/20260821_0001_initial_mvp.py`
- Create: `tests/integration/conftest.py`
- Test: `tests/integration/test_migrations.py`

**Interfaces:**
- Produces: `create_engine_and_session_factory(database_url: str) -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]`
- Produces: SQLAlchemy `Base`, `PlaceModel`, `CheckInSessionModel`, `GpsSampleModel`, `PhotoModel`, `SubmissionModel`

- [ ] **Step 1: Write the failing migration test**

```python
def test_upgrade_head_creates_all_mvp_tables(postgres_url: str) -> None:
    run_alembic(postgres_url, "upgrade", "head")
    assert set(inspect_table_names(postgres_url)) >= {
        "places", "checkin_sessions", "checkin_gps_samples",
        "checkin_photos", "checkin_submissions", "alembic_version",
    }
```

- [ ] **Step 2: Start PostgreSQL and verify RED**

Run: `docker compose up -d postgres`  
Run: `python -m pytest tests/integration/test_migrations.py -q`  
Expected: FAIL because Alembic configuration and tables do not exist.

- [ ] **Step 3: Implement database construction and ORM models**

Use `Mapped[...]`, UUID primary keys, timezone-aware timestamps, explicit enum/check constraints, foreign keys with safe delete behavior, and unique constraints for content IDs, GPS sequence, session submission and idempotency keys.

- [ ] **Step 4: Add the forward migration**

Create all five tables and indexes explicitly in `upgrade()`. Make `downgrade()` remove only those objects in reverse dependency order.

- [ ] **Step 5: Verify GREEN, downgrade and re-upgrade**

Run: `python -m pytest tests/integration/test_migrations.py -q`  
Expected: PASS after the test upgrades, downgrades to base and upgrades again.

- [ ] **Step 6: Commit the database foundation**

```powershell
git add -- compose.yaml alembic.ini alembic src/ktown_defense/infrastructure tests/integration
git commit -m "feat: add PostgreSQL persistence foundation"
```

### Task 3: Persist and expose public places

**Files:**
- Create: `src/ktown_defense/infrastructure/repositories.py`
- Create: `src/ktown_defense/api/dependencies.py`
- Create: `src/ktown_defense/api/errors.py`
- Create: `src/ktown_defense/api/place_routes.py`
- Modify: `src/ktown_defense/api/main.py`
- Test: `tests/api/test_places_api.py`

**Interfaces:**
- Produces: `PlaceRepository.list_public()`, `PlaceRepository.get_public(place_id)`
- Produces: `GET /api/v1/places`, `GET /api/v1/places/{place_id}`

- [ ] **Step 1: Write failing list and hidden-detail tests**

```python
async def test_places_lists_only_public_active_rows(api_client, place_factory):
    visible = await place_factory(is_public=True, is_active=True)
    await place_factory(is_public=False, is_active=True)
    response = await api_client.get("/api/v1/places")
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == [str(visible.id)]


async def test_hidden_place_detail_is_not_found(api_client, place_factory):
    hidden = await place_factory(is_public=False)
    response = await api_client.get(f"/api/v1/places/{hidden.id}")
    assert response.status_code == 404
    assert response.json()["code"] == "PLACE_NOT_FOUND"
```

- [ ] **Step 2: Run the focused tests to verify RED**

Run: `python -m pytest tests/api/test_places_api.py -q`

- [ ] **Step 3: Implement repository, DTO and error boundary**

Return stable JSON fields: `id`, `contentId`, `nameKo`, `addressKo`, `latitude`, `longitude`, `regionCode`, `descriptionKo`. Order lists by Korean name then UUID for determinism.

- [ ] **Step 4: Verify GREEN and migration-backed persistence**

Run: `python -m pytest tests/api/test_places_api.py tests/integration/test_migrations.py -q`

- [ ] **Step 5: Commit public discovery**

```powershell
git add -- src/ktown_defense/api src/ktown_defense/infrastructure/repositories.py tests/api/test_places_api.py
git commit -m "feat: expose persistent public places"
```

### Task 4: Create and retrieve durable check-in sessions

**Files:**
- Create: `src/ktown_defense/checkin_application.py`
- Create: `src/ktown_defense/api/checkin_routes.py`
- Modify: `src/ktown_defense/api/main.py`
- Modify: `src/ktown_defense/infrastructure/repositories.py`
- Test: `tests/api/test_checkin_sessions.py`

**Interfaces:**
- Produces: `CheckInApplication.create_session(user_id, place_id, now)`
- Produces: `CheckInApplication.get_session(user_id, session_id, now)`
- Produces: `POST /api/v1/checkins`, `GET /api/v1/checkins/{session_id}`

- [ ] **Step 1: Write failing create, reuse and ownership tests**

```python
async def test_create_checkin_persists_a_thirty_minute_session(member_client, public_place):
    response = await member_client.post("/api/v1/checkins", json={"placeId": str(public_place.id)})
    assert response.status_code == 201
    assert response.json()["status"] == "collecting"


async def test_second_create_reuses_active_user_place_session(member_client, public_place):
    first = await member_client.post("/api/v1/checkins", json={"placeId": str(public_place.id)})
    second = await member_client.post("/api/v1/checkins", json={"placeId": str(public_place.id)})
    assert second.json()["id"] == first.json()["id"]


async def test_other_user_cannot_read_session(api_client, checkin_session):
    response = await api_client.get(
        f"/api/v1/checkins/{checkin_session.id}",
        headers={"X-KTown-User-Id": "other-user"},
    )
    assert response.status_code == 404
```

- [ ] **Step 2: Verify RED**

Run: `python -m pytest tests/api/test_checkin_sessions.py -q`

- [ ] **Step 3: Implement trusted principal, transaction and expiry projection**

Reject missing/blank/oversized identity headers, require public active places, create 30-minute sessions, reuse an existing active session, and project an elapsed collecting session as `expired` in the same transaction.

- [ ] **Step 4: Verify GREEN and domain regression**

Run: `python -m pytest tests/api/test_checkin_sessions.py -q`  
Run: `python -m unittest discover -s tests -v`

- [ ] **Step 5: Commit session persistence**

```powershell
git add -- src/ktown_defense/checkin_application.py src/ktown_defense/api src/ktown_defense/infrastructure/repositories.py tests/api/test_checkin_sessions.py
git commit -m "feat: persist check-in sessions"
```

### Task 5: Persist GPS and photo evidence

**Files:**
- Modify: `src/ktown_defense/checkin_application.py`
- Modify: `src/ktown_defense/api/checkin_routes.py`
- Modify: `src/ktown_defense/infrastructure/repositories.py`
- Test: `tests/api/test_checkin_evidence.py`

**Interfaces:**
- Produces: `POST /api/v1/checkins/{session_id}/gps`
- Produces: `POST /api/v1/checkins/{session_id}/photo`

- [ ] **Step 1: Write failing evidence tests**

```python
async def test_gps_sequence_must_increase(member_client, checkin_session):
    payload = {"sequence": 1, "latitude": 35.1, "longitude": 129.0,
               "accuracyMeters": 20, "capturedAt": "2026-08-21T10:00:00Z"}
    assert (await member_client.post(f"/api/v1/checkins/{checkin_session.id}/gps", json=payload)).status_code == 201
    duplicate = await member_client.post(f"/api/v1/checkins/{checkin_session.id}/gps", json=payload)
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "GPS_SEQUENCE_CONFLICT"


async def test_photo_metadata_rejects_invalid_sha256(member_client, checkin_session):
    response = await member_client.post(
        f"/api/v1/checkins/{checkin_session.id}/photo",
        json={"storageKey": "private/a.jpg", "contentType": "image/jpeg",
              "sizeBytes": 1024, "sha256": "bad", "capturedAt": "2026-08-21T10:00:00Z"},
    )
    assert response.status_code == 422
```

- [ ] **Step 2: Verify RED**

Run: `python -m pytest tests/api/test_checkin_evidence.py -q`

- [ ] **Step 3: Implement evidence validation and storage**

Allow WGS84 coordinate ranges, non-negative accuracy, strictly increasing sequence, JPEG/PNG/WebP MIME types, 1..10 MiB size, lowercase 64-character SHA-256 and private storage keys without traversal. Reject evidence for expired, cancelled or submitted sessions.

- [ ] **Step 4: Derive `ready` only when both evidence types exist**

Persist status `ready` in the same transaction after the first valid GPS and photo records exist. Do not claim GPS dwell or automatic approval in this MVP.

- [ ] **Step 5: Verify GREEN**

Run: `python -m pytest tests/api/test_checkin_evidence.py tests/api/test_checkin_sessions.py -q`

- [ ] **Step 6: Commit evidence persistence**

```powershell
git add -- src/ktown_defense/checkin_application.py src/ktown_defense/api/checkin_routes.py src/ktown_defense/infrastructure/repositories.py tests/api/test_checkin_evidence.py
git commit -m "feat: persist check-in evidence"
```

### Task 6: Submit check-ins idempotently as pending

**Files:**
- Modify: `src/ktown_defense/checkin_application.py`
- Modify: `src/ktown_defense/api/checkin_routes.py`
- Modify: `src/ktown_defense/infrastructure/repositories.py`
- Test: `tests/api/test_checkin_submission.py`

**Interfaces:**
- Produces: `POST /api/v1/checkins/{session_id}/submit`
- Consumes header: `Idempotency-Key: <UUID-v4>`

- [ ] **Step 1: Write failing readiness, idempotency and conflict tests**

```python
async def test_ready_session_submits_once_as_pending(member_client, ready_session):
    key = "0f154c8a-8736-4fb6-ae2d-3a339e127b20"
    first = await member_client.post(
        f"/api/v1/checkins/{ready_session.id}/submit",
        headers={"Idempotency-Key": key},
    )
    second = await member_client.post(
        f"/api/v1/checkins/{ready_session.id}/submit",
        headers={"Idempotency-Key": key},
    )
    assert first.status_code == second.status_code == 201
    assert first.json() == second.json()
    assert first.json()["decision"] == "pending"
    assert "awardedPoints" not in first.json()
```

- [ ] **Step 2: Verify RED**

Run: `python -m pytest tests/api/test_checkin_submission.py -q`

- [ ] **Step 3: Implement submission transaction**

Lock the session row, enforce owner/readiness/expiry, validate UUID-v4, insert one submission, set session status to `submitted`, and translate unique conflicts into first-response replay or stable 409.

- [ ] **Step 4: Verify GREEN, restart and reconnect behavior**

Run: `python -m pytest tests/api/test_checkin_submission.py -q`  
The test must dispose the first engine, construct a new engine/session factory and retrieve the same submitted state.

- [ ] **Step 5: Commit submission behavior**

```powershell
git add -- src/ktown_defense/checkin_application.py src/ktown_defense/api/checkin_routes.py src/ktown_defense/infrastructure/repositories.py tests/api/test_checkin_submission.py
git commit -m "feat: submit check-ins idempotently"
```

### Task 7: Add the trusted web gateway and HTTP services

**Files:**
- Create: `web/app/api/ktown/[...path]/route.ts`
- Create: `web/lib/http-services.ts`
- Create: `web/lib/service-factory.ts`
- Modify: `web/lib/domain.ts`
- Test: `web/tests/ktown-gateway.test.ts`
- Test: `web/tests/http-services.test.ts`
- Test: `web/tests/service-factory.test.ts`

**Interfaces:**
- Produces: `createHttpServices(fetcher?: typeof fetch): AppServices`
- Produces: `createServices(mode: "demo" | "integrated"): AppServices`
- Gateway consumes server-only `KTOWN_API_BASE_URL` and platform user identity headers.

- [ ] **Step 1: Write failing gateway security tests**

Test exact allowlisted routes, encoded traversal rejection, removal of browser-supplied identity/authorization/cookie headers, injection of the platform user ID, upstream timeout mapping and removal of `set-cookie` and hop-by-hop response headers.

- [ ] **Step 2: Write failing HTTP DTO tests**

```typescript
it("maps a backend place and submits with one stable idempotency key", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(jsonResponse({ items: [placeDto] }))
    .mockResolvedValueOnce(jsonResponse({ id: "submission-1", decision: "pending" }, 201));
  const services = createHttpServices(fetcher as typeof fetch);
  expect((await services.tourism.listPlaces({}))[0].name).toBe(placeDto.nameKo);
  const result = await services.checkIn.submit("session-1");
  expect(result.decision).toBe("pending");
  expect(result.awardedPoints).toBeUndefined();
});
```

- [ ] **Step 3: Verify RED**

Run: `npm test -- tests/ktown-gateway.test.ts tests/http-services.test.ts tests/service-factory.test.ts`

- [ ] **Step 4: Implement the minimal gateway and service adapter**

Use an allowlist for the exact place and check-in shapes, a bounded abort timeout, JSON size limits and sanitized errors. Keep backend URL and trusted headers server-only.

- [ ] **Step 5: Verify GREEN and existing web tests**

Run: `npm test`

- [ ] **Step 6: Commit the transport boundary**

```powershell
git add -- web/app/api/ktown web/lib/domain.ts web/lib/http-services.ts web/lib/service-factory.ts web/tests
git commit -m "feat(web): connect trusted K-Town API services"
```

### Task 8: Wire integrated UI state and complete vertical verification

**Files:**
- Create: `web/features/ktown-app.tsx`
- Modify: `web/app/page.tsx`
- Modify: `web/components/check-in/check-in-flow.tsx`
- Modify: `web/components/check-in/check-in-reducer.ts`
- Modify: `web/app/globals.css`
- Modify: `web/README.md`
- Modify: `README.md`
- Test: `web/tests/integrated-check-in.test.tsx`
- Create: `tests/e2e/test_checkin_vertical.py`

**Interfaces:**
- Server page reads `KTOWN_SERVICE_MODE=demo|integrated` and passes only the mode to `KTownApp`.
- The check-in UI renders collecting, ready, submitted/pending, expired and recoverable error states.

- [ ] **Step 1: Write the failing pending-state UI test**

```typescript
it("shows a pending review without invented points", async () => {
  render(<CheckInFlow place={place} service={pendingService} onClose={() => undefined} />);
  await completeEvidenceAndSubmit();
  expect(await screen.findByText(/검토 대기/)).toBeInTheDocument();
  expect(screen.queryByText(/\+\d+P/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Verify RED and implement the state rendering**

Run: `npm test -- tests/integrated-check-in.test.tsx`  
Preserve the existing demo journey tests while removing the hard-coded integrated approval claim.

- [ ] **Step 3: Write the failing backend vertical test**

Create a public place through the repository, issue HTTP requests for session, GPS, photo and submit, dispose the engine, reconnect and assert the submitted/pending row can still be retrieved.

- [ ] **Step 4: Verify RED, then add only missing composition code**

Run: `python -m pytest tests/e2e/test_checkin_vertical.py -q`

- [ ] **Step 5: Document local operation**

Document environment variables, `docker compose up -d postgres`, `alembic upgrade head`, FastAPI and web startup, demo/integrated modes, test commands and the optional KTour live smoke command. Do not include actual secrets.

- [ ] **Step 6: Run complete fresh verification**

```powershell
python -m unittest discover -s tests -v
python -m pytest tests/api tests/integration tests/e2e -q
Set-Location web
npm test
npm run lint
npm run build
```

Start FastAPI and the vinext production server on non-default test ports. Verify `/health`, `/api/v1/places` and `/` return 2xx and confirm a check-in created over HTTP exists after a fresh database session.

- [ ] **Step 7: Inspect the final diff and commit**

Confirm no `.env`, nested Git backup, database volume, build output or pre-existing unrelated change is staged.

```powershell
git add -- README.md web/README.md web/app web/components/check-in web/features web/tests/integrated-check-in.test.tsx tests/e2e/test_checkin_vertical.py
git commit -m "feat: complete persistent check-in vertical slice"
```

## Final Verification Checklist

- [ ] Root Git tracks the web source and the nested repository metadata remains recoverable under root `.git/`.
- [ ] `alembic upgrade head` succeeds against a fresh PostgreSQL database.
- [ ] Public place endpoints return only active public PostgreSQL rows.
- [ ] Check-in session, GPS, photo metadata and pending submission survive reconnection.
- [ ] Missing identity, wrong owner, invalid evidence, expiry and duplicate submission return stable errors.
- [ ] Integrated UI never fabricates approval or points.
- [ ] Demo mode still works without FastAPI or PostgreSQL.
- [ ] Existing Python and web regression suites pass.
- [ ] Lint, production build and two-server smoke verification pass.
- [ ] No user-owned unrelated change or secret is included in task commits.
