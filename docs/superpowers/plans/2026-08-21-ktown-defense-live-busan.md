# K-Town Defense Live Busan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import up to 100 real Busan places from KorService2 into PostgreSQL and let users discover them and submit real browser GPS and photo evidence through the existing K-Town Defense web UI.

**Architecture:** A transport-only KTour area adapter feeds a transactional PostgreSQL synchronization service invoked by a CLI. FastAPI serves cached/filterable place data and accepts private multipart photo uploads, while the existing vinext client uses browser permission APIs and the trusted same-origin gateway.

**Tech Stack:** Python 3.13, FastAPI 0.141, SQLAlchemy 2 async, asyncpg, Alembic, PostgreSQL 17, pytest, React 19, vinext, Vitest, browser Geolocation and File APIs.

**Spec:** `docs/superpowers/specs/2026-08-21-ktown-defense-live-busan-design.md`

## Global Constraints

- Preserve the dirty root `main`, its untracked nested `web/`, root `.env`, and `ktown-defense-site.tar.gz`.
- Work only on `codex/integrated-mvp` in `.worktrees/integrated-mvp`.
- Never print, commit, return or forward `KTOUR_SERVICE_KEY`.
- First live import uses KTO area code `6` and a maximum of 100 rows.
- Browser requests read PostgreSQL and never call TourAPI directly.
- Place replacement is atomic; a failed or empty import keeps the last good KTO rows visible.
- Operator and demo rows are never deactivated by KTO synchronization.
- Uploaded photos stay outside source and public web directories and are limited to 10 MiB.
- Submission remains `pending`; integrated UI never invents approval or points.
- Existing demo mode and all existing test suites remain green.

---

## File Structure

### Backend synchronization

- `src/ktown_defense/ktour_area.py`: immutable live-place DTO and KorService2 area pagination/detail mapping.
- `src/ktown_defense/place_sync.py`: synchronization run lifecycle and atomic PostgreSQL upsert/deactivation.
- `src/ktown_defense/sync_ktour.py`: safe CLI argument parsing and exit codes.
- `src/ktown_defense/infrastructure/models.py`: KTO place metadata and sync-run model.
- `src/ktown_defense/infrastructure/repositories.py`: filtered reads and synchronization writes.
- `alembic/versions/20260821_0002_live_busan.py`: forward/backward schema migration.

### Backend HTTP and uploads

- `src/ktown_defense/photo_storage.py`: byte validation, hashing and private atomic file storage.
- `src/ktown_defense/api/place_routes.py`: query/filter/pagination DTOs.
- `src/ktown_defense/api/checkin_routes.py`: multipart photo contract.
- `src/ktown_defense/checkin_application.py`: file-derived photo metadata persistence and cleanup.
- `src/ktown_defense/settings.py`: private upload root.

### Web

- `web/components/explore/live-places-panel.tsx`: real place search, filters, cards and error states.
- `web/lib/browser-evidence.ts`: browser GPS collection with stable error classification.
- `web/components/check-in/check-in-flow.tsx`: permission-aware GPS and file upload stages.
- `web/lib/domain.ts`, `web/lib/http-services.ts`, `web/lib/demo-services.ts`: binary photo and richer place contracts.
- `web/features/ktown-app.tsx`, `web/components/explore/explore-view.tsx`: real-place selection to check-in composition.

---

### Task 1: Add live catalog persistence schema

**Files:**
- Modify: `pyproject.toml`
- Modify: `.env.example`
- Modify: `.gitignore`
- Modify: `src/ktown_defense/settings.py`
- Modify: `src/ktown_defense/infrastructure/models.py`
- Create: `alembic/versions/20260821_0002_live_busan.py`
- Test: `tests/integration/test_live_catalog_migration.py`

**Interfaces:**
- Produces: `Settings.upload_dir: Path`
- Produces: `CatalogSyncRunModel`
- Extends: `PlaceModel.source`, `content_type_id`, `category_code`, `image_url`, `source_modified_at`

- [ ] **Step 1: Write the failing migration and settings tests**

```python
def test_live_catalog_migration_adds_metadata_and_run_table(postgres_url):
    run_alembic(postgres_url, "upgrade", "head")
    assert {"source", "content_type_id", "category_code", "image_url",
            "source_modified_at"} <= set(inspect_columns(postgres_url, "places"))
    assert "catalog_sync_runs" in inspect_table_names(postgres_url)


def test_upload_dir_is_configurable(monkeypatch, tmp_path):
    monkeypatch.setenv("KTOWN_UPLOAD_DIR", str(tmp_path))
    assert Settings().upload_dir == tmp_path
```

- [ ] **Step 2: Verify RED**

Run: `.\.venv\Scripts\python.exe -m pytest tests/integration/test_live_catalog_migration.py -q`

Expected: FAIL because the revision, columns and setting do not exist.

- [ ] **Step 3: Implement the schema**

Add `python-multipart>=0.0.22,<1` to runtime dependencies. Default
`KTOWN_UPLOAD_DIR` to `.data/private-uploads`, ignore `.data/`, and create a
forward migration with a server default of `operator` for existing rows. Use a
sync-run status check constraint containing `running`, `succeeded`, `failed`.

- [ ] **Step 4: Verify upgrade, downgrade and re-upgrade**

Run: `.\.venv\Scripts\python.exe -m pytest tests/integration/test_live_catalog_migration.py tests/integration/test_migrations.py -q`

Expected: PASS with both revisions at head after re-upgrade.

- [ ] **Step 5: Commit**

```powershell
git add -- pyproject.toml .env.example .gitignore src/ktown_defense/settings.py src/ktown_defense/infrastructure/models.py alembic/versions/20260821_0002_live_busan.py tests/integration/test_live_catalog_migration.py
git commit -m "feat: add live tourism catalog schema"
```

### Task 2: Fetch and validate Busan area records from KorService2

**Files:**
- Create: `src/ktown_defense/ktour_area.py`
- Test: `tests/test_ktour_area.py`

**Interfaces:**
- Produces: `KTourAreaPlace(content_id, name_ko, address_ko, latitude, longitude, region_code, content_type_id, category_code, description_ko, image_url, source_modified_at)`
- Produces: `KTourAreaClient.fetch_places(area_code: str, limit: int) -> tuple[KTourAreaPlace, ...]`
- Consumes: `KTourOpenAPIClient._request()` through composition, not database code.

- [ ] **Step 1: Write failing pagination and mapping tests**

```python
def test_fetch_places_pages_area_list_and_enriches_detail(fake_transport):
    client = KTourAreaClient(service_key="secret", page_size=2,
                             transport=fake_transport)
    places = client.fetch_places(area_code="6", limit=3)
    assert [p.content_id for p in places] == ["101", "102", "103"]
    assert places[0].region_code == "6"
    assert places[0].description_ko == "공식 한국어 설명"
    assert all("serviceKey=secret" not in repr(p) for p in places)
```

Also assert `areaBasedList2` receives `areaCode=6`, `numOfRows`, `pageNo`,
`MobileOS=ETC`, `MobileApp`, `_type=json`; detail calls receive only distinct
content IDs; malformed coordinates, missing Korean address/description and an
empty result raise `KTourAPIError` without including the request URL.

- [ ] **Step 2: Verify RED**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_ktour_area.py -q`

Expected: FAIL with `ModuleNotFoundError: ktown_defense.ktour_area`.

- [ ] **Step 3: Implement the transport-only adapter**

Normalize encoded/decoded keys once, stop exactly at `limit`, deduplicate by
content ID using the newest `modifiedtime`, strip HTML from overview, accept
`firstimage` only when it is HTTPS, and parse KTO timestamps as UTC-aware
datetimes. Do not expose the key in exceptions or DTO representation.

- [ ] **Step 4: Verify GREEN and old client compatibility**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_ktour_area.py -q`

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_ktour_openapi -v`

- [ ] **Step 5: Commit**

```powershell
git add -- src/ktown_defense/ktour_area.py tests/test_ktour_area.py
git commit -m "feat: fetch live Busan tourism records"
```

### Task 3: Synchronize KTour snapshots atomically and expose a CLI

**Files:**
- Create: `src/ktown_defense/place_sync.py`
- Create: `src/ktown_defense/sync_ktour.py`
- Modify: `src/ktown_defense/infrastructure/repositories.py`
- Test: `tests/integration/test_live_place_sync.py`
- Test: `tests/test_sync_ktour_cli.py`

**Interfaces:**
- Produces: `KTourPlaceSyncService.sync(area_code: str = "6", limit: int = 100) -> CatalogSyncResult`
- Produces: `CatalogSyncResult(run_id: UUID, status: str, fetched_count: int, active_count: int)`
- Produces CLI: `python -m ktown_defense.sync_ktour --area-code 6 --limit 100`

- [ ] **Step 1: Write failing successful-sync tests**

```python
async def test_sync_upserts_and_is_idempotent(session_factory, fake_area_client):
    service = KTourPlaceSyncService(session_factory, fake_area_client)
    first = await service.sync("6", 100)
    second = await service.sync("6", 100)
    assert first.status == second.status == "succeeded"
    assert await count_places(session_factory, source="KTOUR_API") == 2
```

Assert that a later successful snapshot marks missing KTO Busan rows inactive,
keeps included UUIDs stable, updates modified content, and leaves `operator`
and other-region rows unchanged.

- [ ] **Step 2: Write failing rollback and CLI tests**

Assert API failure and zero rows create a sanitized failed run but preserve all
previous place visibility. Assert CLI defaults to area `6` and limit `100`,
rejects limits outside `1..100`, prints counts only, and returns exit code 1 on
failure.

- [ ] **Step 3: Verify RED**

Run: `.\.venv\Scripts\python.exe -m pytest tests/integration/test_live_place_sync.py tests/test_sync_ktour_cli.py -q`

- [ ] **Step 4: Implement run lifecycle and PostgreSQL upsert**

Create and commit a `running` run before network work. Fetch outside the place
transaction. On success use PostgreSQL `insert().on_conflict_do_update()` by
`content_id`, then deactivate only `source='KTOUR_API' AND region_code=:area`
rows absent from the snapshot and mark the run succeeded in the same
transaction. On fetch failure update only the run in a fresh transaction.

- [ ] **Step 5: Implement the safe CLI**

Build settings and engine once, construct `KTourAreaClient` from the secret
value, call the service, dispose the engine in `finally`, and emit JSON with
`runId`, `status`, `fetchedCount`, `activeCount` only.

- [ ] **Step 6: Verify GREEN**

Run: `.\.venv\Scripts\python.exe -m pytest tests/integration/test_live_place_sync.py tests/test_sync_ktour_cli.py -q`

- [ ] **Step 7: Commit**

```powershell
git add -- src/ktown_defense/place_sync.py src/ktown_defense/sync_ktour.py src/ktown_defense/infrastructure/repositories.py tests/integration/test_live_place_sync.py tests/test_sync_ktour_cli.py
git commit -m "feat: synchronize live tourism places"
```

### Task 4: Serve searchable real place data

**Files:**
- Modify: `src/ktown_defense/infrastructure/repositories.py`
- Modify: `src/ktown_defense/api/place_routes.py`
- Test: `tests/api/test_live_places_api.py`

**Interfaces:**
- Extends: `GET /api/v1/places?regionCode=6&category=culture&query=감천&limit=20&offset=0`
- Extends DTO: `contentTypeId`, `categoryCode`, `category`, `imageUrl`, `syncedAt`

- [ ] **Step 1: Write failing filter and pagination tests**

```python
async def test_live_places_filter_search_and_paginate(api_client, live_places):
    response = await api_client.get(
        "/api/v1/places?regionCode=6&category=culture&query=문화&limit=1"
    )
    assert response.status_code == 200
    assert response.json()["total"] == 2
    assert len(response.json()["items"]) == 1
    assert response.json()["items"][0]["imageUrl"].startswith("https://")
```

Assert query is trimmed and limited to 100 characters, `limit` is `1..100`,
`offset >= 0`, invalid category is 422, hidden/inactive rows never appear, and
legacy unfiltered response consumers still receive `items`.

- [ ] **Step 2: Verify RED**

Run: `.\.venv\Scripts\python.exe -m pytest tests/api/test_live_places_api.py -q`

- [ ] **Step 3: Implement deterministic filtered reads**

Map KTO content types `12/14/25/28/32/38` to `culture`, `15` to `event`, `39`
to `local_food`, and unknown types to `culture`. Search Korean name and address
with escaped case-insensitive containment. Return `total`, `limit`, `offset`,
and items ordered by name then UUID.

- [ ] **Step 4: Verify GREEN and public API regression**

Run: `.\.venv\Scripts\python.exe -m pytest tests/api/test_live_places_api.py tests/api/test_places_api.py -q`

- [ ] **Step 5: Commit**

```powershell
git add -- src/ktown_defense/infrastructure/repositories.py src/ktown_defense/api/place_routes.py tests/api/test_live_places_api.py
git commit -m "feat: expose searchable live places"
```

### Task 5: Store actual private photo uploads

**Files:**
- Create: `src/ktown_defense/photo_storage.py`
- Modify: `src/ktown_defense/api/checkin_routes.py`
- Modify: `src/ktown_defense/checkin_application.py`
- Modify: `src/ktown_defense/api/main.py`
- Test: `tests/api/test_photo_upload.py`

**Interfaces:**
- Produces: `PrivatePhotoStorage.store(session_id: UUID, upload: UploadFile) -> StoredPhoto`
- Produces: `StoredPhoto(storage_key, content_type, size_bytes, sha256, captured_at)`
- Changes: `POST /api/v1/checkins/{session_id}/photo` to multipart fields `file` and `capturedAt`

- [ ] **Step 1: Write failing valid upload test**

```python
async def test_photo_upload_derives_metadata_and_stores_privately(
    member_client, checkin_session, upload_dir
):
    response = await member_client.post(
        f"/api/v1/checkins/{checkin_session.id}/photo",
        files={"file": ("camera.jpg", JPEG_BYTES, "image/jpeg")},
        data={"capturedAt": "2026-08-21T10:00:00Z"},
    )
    assert response.status_code == 201
    stored = upload_dir / response.json()["storageKey"]
    assert stored.read_bytes() == JPEG_BYTES
```

- [ ] **Step 2: Write failing validation and cleanup tests**

Assert missing identity, MIME/magic mismatch, unsupported MIME, empty file,
more than 10 MiB, closed session and database failure leave no new file or row.
Assert client filenames such as `../../secret.jpg` never appear in the storage
key and a public HTTP request cannot retrieve the file.

- [ ] **Step 3: Verify RED**

Run: `.\.venv\Scripts\python.exe -m pytest tests/api/test_photo_upload.py -q`

- [ ] **Step 4: Implement bounded atomic storage**

Read in 64 KiB chunks, stop at `10 * 1024 * 1024 + 1`, validate JPEG
`FF D8 FF`, PNG signature or RIFF/WEBP bytes, compute SHA-256 while writing a
temporary file below the resolved upload root, and `os.replace` it to a
server-generated suffix. Resolve and verify every target remains under the
upload root.

- [ ] **Step 5: Bind storage through FastAPI dependencies**

Construct `PrivatePhotoStorage(settings.upload_dir)` on app state. Route parsing
uses `UploadFile`, `File`, and `Form`. Pass derived metadata into the existing
application transaction; unlink the new file if validation after storage or DB
commit fails.

- [ ] **Step 6: Verify GREEN and check-in regression**

Run: `.\.venv\Scripts\python.exe -m pytest tests/api/test_photo_upload.py tests/api/test_checkin_evidence.py tests/api/test_checkin_submission.py -q`

- [ ] **Step 7: Commit**

```powershell
git add -- src/ktown_defense/photo_storage.py src/ktown_defense/api/checkin_routes.py src/ktown_defense/checkin_application.py src/ktown_defense/api/main.py tests/api/test_photo_upload.py
git commit -m "feat: persist private check-in photos"
```

### Task 6: Show real Busan places in the existing frontend

**Files:**
- Create: `web/components/explore/live-places-panel.tsx`
- Modify: `web/components/explore/explore-view.tsx`
- Modify: `web/features/ktown-app.tsx`
- Modify: `web/lib/domain.ts`
- Modify: `web/lib/http-services.ts`
- Modify: `web/app/globals.css`
- Test: `web/tests/live-places.test.tsx`
- Test: `web/tests/http-services.test.ts`

**Interfaces:**
- Extends: `Place.imageUrl?: string`, `Place.contentTypeId?: string`
- Extends: `TourismService.listPlaces(filter)` to send backend filters.
- Produces: `<LivePlacesPanel places/error/loading/filter/onCheckIn>`.

- [ ] **Step 1: Write failing HTTP filter mapping test**

```typescript
it("requests and maps live Busan filters", async () => {
  const fetcher = vi.fn().mockResolvedValue(jsonResponse({ total: 1, items: [dto] }));
  const places = await createHttpServices(fetcher as typeof fetch).tourism
    .listPlaces({ regionId: "busan", category: "culture", query: "감천" });
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining("regionCode=6&category=culture&query="), expect.anything());
  expect(places[0].imageUrl).toBe(dto.imageUrl);
});
```

- [ ] **Step 2: Write failing user-facing panel tests**

Render integrated 부산 exploration and assert actual API place name, address,
image fallback, search/filter controls, loading, empty and retry error states.
Clicking `체크인` must pass the exact API `Place` object to `CheckInFlow`.

- [ ] **Step 3: Verify RED**

Run: `npm test -- tests/http-services.test.ts tests/live-places.test.tsx`

- [ ] **Step 4: Implement URL filters and live panel**

Use `URLSearchParams`; never concatenate raw queries. Fetch only for 부산 in
integrated mode, debounce search by 250 ms, keep the existing map/region card,
and render semantic buttons and status messages. Remote images use ordinary
`img` with lazy loading, fixed dimensions and an empty decorative alt because
the adjacent heading carries the place name.

- [ ] **Step 5: Mark remaining simulations**

In integrated mode label season, battle, leaderboard and journey sections
`데모 데이터`; remove point totals from the live-place cards.

- [ ] **Step 6: Verify GREEN, accessibility lint and build**

Run: `npm test -- tests/http-services.test.ts tests/live-places.test.tsx`

Run: `npm run lint`

Run: `npm run build`

- [ ] **Step 7: Commit**

```powershell
git add -- web/components/explore web/features/ktown-app.tsx web/lib/domain.ts web/lib/http-services.ts web/app/globals.css web/tests
git commit -m "feat(web): show live Busan tourism places"
```

### Task 7: Collect real browser GPS and photo evidence

**Files:**
- Create: `web/lib/browser-evidence.ts`
- Modify: `web/lib/domain.ts`
- Modify: `web/lib/http-services.ts`
- Modify: `web/lib/demo-services.ts`
- Modify: `web/components/check-in/check-in-flow.tsx`
- Modify: `web/components/check-in/check-in-reducer.ts`
- Modify: `web/app/globals.css`
- Modify: `web/README.md`
- Modify: `README.md`
- Test: `web/tests/browser-evidence.test.ts`
- Test: `web/tests/real-check-in.test.tsx`
- Modify: `tests/e2e/test_checkin_vertical.py`

**Interfaces:**
- Produces: `collectGpsSamples(geolocation, count = 3) -> Promise<GpsEvidence[]>`
- Changes: `CheckInService.recordPhoto(sessionId, { file, capturedAt })`
- HTTP photo request: multipart `FormData`, with no manually set content type.

- [ ] **Step 1: Write failing geolocation adapter tests**

```typescript
it("collects three real positions in order", async () => {
  const samples = await collectGpsSamples(fakeGeolocation, 3);
  expect(samples.map((sample) => sample.sequence)).toEqual([1, 2, 3]);
  expect(samples[0]).toMatchObject({ latitude: 35.1, longitude: 129.0 });
});
```

Assert permission denial maps to `location_denied`, timeout to
`location_timeout`, unsupported browsers to `location_unavailable`, and no raw
browser exception text reaches UI copy.

- [ ] **Step 2: Write failing multipart and interaction tests**

Assert HTTP services place a `File` and ISO `capturedAt` in `FormData` without a
`content-type` header. In the UI, consent copy appears before permission; the
location button sends three returned samples; the photo input accepts
JPEG/PNG/WebP with `capture="environment"`; submit remains disabled until both
uploads succeed; denial and network failures are retryable; result is pending
and contains no points.

- [ ] **Step 3: Verify RED**

Run: `npm test -- tests/browser-evidence.test.ts tests/real-check-in.test.tsx tests/http-services.test.ts`

- [ ] **Step 4: Implement browser evidence adapter and staged UI**

Wrap each `getCurrentPosition` call in a Promise with
`enableHighAccuracy: true`, `maximumAge: 0`, `timeout: 10000`. Save each sample
before requesting the next. Replace simulated dwell copy with truthful
`위치 3회 + 현장 사진` progress. Validate client file type/size for immediate
feedback while treating the server as authoritative.

- [ ] **Step 5: Update documentation and backend E2E multipart flow**

Document HTTPS permission requirements, private local upload path, explicit
privacy limitation and the live sync command. Change the backend E2E test from
JSON photo metadata to multipart bytes and verify both DB metadata and the
private file survive a fresh database session.

- [ ] **Step 6: Verify task GREEN**

Run: `npm test -- tests/browser-evidence.test.ts tests/real-check-in.test.tsx tests/http-services.test.ts`

Run: `.\.venv\Scripts\python.exe -m pytest tests/e2e/test_checkin_vertical.py -q`

- [ ] **Step 7: Commit**

```powershell
git add -- web/lib web/components/check-in web/app/globals.css web/README.md README.md web/tests tests/e2e/test_checkin_vertical.py
git commit -m "feat: collect real check-in evidence"
```

### Task 8: Run live Busan synchronization and full product verification

**Files:**
- Modify only if verification exposes a tested defect.

**Interfaces:**
- Consumes CLI and all previous public interfaces.
- Produces verified PostgreSQL rows and a local usable application.

- [ ] **Step 1: Run all automated suites fresh**

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe -m pytest tests/api tests/integration tests/e2e -q
Set-Location web
npm test
npm run lint
npm run build
```

- [ ] **Step 2: Upgrade the real local database**

Run `docker compose up -d postgres`, then
`.\.venv\Scripts\python.exe -m alembic -c alembic.ini upgrade head`. Verify
Alembic reports revision `20260821_0002` and no migration error.

- [ ] **Step 3: Run the real API sync without exposing the key**

Load only `KTOUR_SERVICE_KEY` and `KTOUR_MOBILE_APP` from the ignored root
`.env` into the child process, then run:

```powershell
.\.venv\Scripts\python.exe -m ktown_defense.sync_ktour --area-code 6 --limit 100
```

Expected JSON: `status` is `succeeded`, `fetchedCount` is between 1 and 100,
and no output contains `serviceKey` or the secret value.

- [ ] **Step 4: Verify real database provenance**

Query counts through SQLAlchemy, not `psql` string interpolation. Assert active
`source='KTOUR_API'`, `region_code='6'` rows exist, each has a non-empty KTO
content ID and synchronized time, and the successful run count matches.

- [ ] **Step 5: Run two-server and browser verification**

Start FastAPI on `127.0.0.1:18000` and vinext integrated mode on
`127.0.0.1:13000`. Verify `/health`, filtered real places, the web root and the
trusted gateway return 2xx. Use browser verification to open 부산, find a real
KTO place, open check-in, and confirm consent and permission-aware controls.
Automated device mocks verify evidence submission; do not fabricate a physical
camera/location success during desktop automation.

- [ ] **Step 6: Inspect final repository state**

Run `git status --short`, `git diff --check`, and a tracked-file scan for
`.env`, `.data`, uploads, `.next`, `dist`, `.wrangler`, `node_modules` and
database volumes. Confirm the dirty root `main` status is unchanged.

- [ ] **Step 7: Commit verification fixes, if any**

Only if a failing verification required a test-first fix, stage its exact files
and commit `fix: complete live Busan verification`. Otherwise create no empty
commit.

## Final Verification Checklist

- [ ] A real `areaBasedList2` + `detailCommon2` Busan run succeeds with the ignored key.
- [ ] A repeated run keeps KTO place UUIDs stable and does not duplicate rows.
- [ ] Failed/empty sync preserves the last visible catalog.
- [ ] Public place search, category filter and pagination use PostgreSQL.
- [ ] Existing frontend source is retained and shows real Busan place cards.
- [ ] Browser GPS values, not fixed test coordinates, reach the backend.
- [ ] Uploaded photo bytes are private, validated and represented in PostgreSQL.
- [ ] Submission is durable `pending` with no invented approval or points.
- [ ] Demo mode works without database, KTour key, location or camera.
- [ ] Python, PostgreSQL integration, web, lint, build and two-server checks pass.
- [ ] No secret, upload, generated output or pre-existing root change is committed.

