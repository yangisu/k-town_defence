# TourAPI Expedition Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Turn live Korean tourism OpenAPI data into a Busan-first, explainable 3-5 stop expedition that flows into the existing GPS/photo check-in and produces safe API-usage evidence for competition judging.

**Architecture:** A typed OpenAPI adapter fetches nine operation shapes and emits secret-free call observations. A transactional PostgreSQL sync keeps enriched places and call evidence, while a deterministic recommendation service builds expeditions from the last-good snapshot without calling upstream on the browser request path. The existing vinext client consumes recommended expeditions through the trusted gateway and keeps the current check-in implementation.

**Tech Stack:** Python 3.13, FastAPI 0.141, SQLAlchemy 2 async, asyncpg, Alembic 1.19, PostgreSQL 17, React 19, TypeScript 5.9, vinext, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-08-22-tourapi-expedition-design.md`

## Global Constraints

- Use KTO area code `6` as the MVP default, while every storage and query interface accepts a region code.
- Use live server-side OpenAPI calls; downloaded tourism files are not product data.
- Public UI and metadata must not contain `한국관광공사`, `KTO`, or their logos; use `관광 OpenAPI` and `공공 관광데이터`.
- Never persist or return service keys, request URLs/query strings, applicant information, or upstream response bodies.
- Browser requests use PostgreSQL only; upstream failures retain the last-good catalog and expedition.
- Preserve existing place and check-in API compatibility.
- Use test-first red-green-refactor for every production behavior.

---

## File Structure

- `alembic/versions/20260822_0004_tourapi_expeditions.py` — enriched place columns and secret-free API call log table.
- `src/ktown_defense/infrastructure/models.py` — ORM mappings for enrichment and call evidence.
- `src/ktown_defense/ktour_expedition.py` — typed DTOs and nine-operation transport mapping.
- `src/ktown_defense/open_data_observability.py` — immutable call observation and async PostgreSQL recorder.
- `src/ktown_defense/expedition_sync.py` — full/incremental enrichment orchestration and atomic publication.
- `src/ktown_defense/expedition_recommendation.py` — deterministic, explainable expedition selection.
- `src/ktown_defense/api/expedition_routes.py` — recommended expedition and public open-data status endpoints.
- `src/ktown_defense/sync_expeditions.py` — operator CLI for real Busan sync.
- `web/lib/domain.ts` — enriched place, expedition reason and open-data status contracts.
- `web/lib/http-services.ts` — HTTP mappings for recommendation and status.
- `web/components/expedition/live-expedition-panel.tsx` — real expedition journey and stop detail UI.
- `web/components/explore/live-places-panel.tsx` — entry point copy and real expedition handoff.
- `web/components/app-shell.tsx` — navigation state for the live expedition.
- `web/app/globals.css` — expedition and data-status presentation.
- `docs/competition/openapi-utilization.md` — submission evidence and reproducible validation commands.

---

### Task 1: Persist Enriched Tourism Data and Safe Call Evidence

**Files:**
- Create: `alembic/versions/20260822_0004_tourapi_expeditions.py`
- Modify: `src/ktown_defense/infrastructure/models.py`
- Test: `tests/integration/test_tourapi_expedition_migration.py`

**Interfaces:**
- Produces: nullable `PlaceModel.homepage_url`, `telephone`, `open_time`, `rest_date`, `parking`, `intro_json`, `info_json`, `image_urls`, `festival_start_date`, `festival_end_date`, `discovery_keywords`, `source_operations`.
- Produces: `OpenApiCallLogModel(id, sync_run_id, operation, feature, status, response_count, error_code, started_at, completed_at)`.

- [x] **Step 1: Write the failing migration test**

```python
@pytest.mark.asyncio
async def test_expedition_migration_adds_enrichment_and_safe_call_log(postgres_url):
    run_alembic(postgres_url, "upgrade", "head")
    inspector = inspect_sync(postgres_url)
    assert {
        "homepage_url", "telephone", "open_time", "rest_date", "parking",
        "intro_json", "info_json", "image_urls", "festival_start_date",
        "festival_end_date", "discovery_keywords", "source_operations",
    } <= set(inspector.columns("places"))
    assert set(inspector.columns("open_api_call_logs")) == {
        "id", "sync_run_id", "operation", "feature", "status",
        "response_count", "error_code", "started_at", "completed_at",
    }
    assert "service_key" not in inspector.columns("open_api_call_logs")
    assert "request_url" not in inspector.columns("open_api_call_logs")
```

- [x] **Step 2: Run the migration test and verify RED**

Run: `\.\.venv\Scripts\python.exe -m pytest tests/integration/test_tourapi_expedition_migration.py -q`
Expected: FAIL because revision `20260822_0004` and the columns do not exist.

- [x] **Step 3: Add the migration and ORM mappings**

Use PostgreSQL `JSONB` with non-null server defaults for JSON collections, `Date` for festival dates, and a foreign key from `open_api_call_logs.sync_run_id` to `catalog_sync_runs.id` with `ON DELETE CASCADE`. Add a check constraint:

```python
sa.CheckConstraint(
    "status IN ('succeeded', 'failed')",
    name="ck_open_api_call_logs_status",
)
```

The ORM JSON fields use `default=dict` or `default=list`; public code must never mutate a shared default.

- [x] **Step 4: Run migration and existing persistence tests**

Run: `\.\.venv\Scripts\python.exe -m pytest tests/integration/test_tourapi_expedition_migration.py tests/integration/test_migrations.py tests/integration/test_live_catalog_migration.py -q`
Expected: PASS.

- [x] **Step 5: Commit the schema**

```powershell
git add -- alembic/versions/20260822_0004_tourapi_expeditions.py src/ktown_defense/infrastructure/models.py tests/integration/test_tourapi_expedition_migration.py
git commit -m "feat: persist tourism enrichment evidence"
```

### Task 2: Map Nine OpenAPI Operations with Secret-Free Observations

**Files:**
- Create: `src/ktown_defense/ktour_expedition.py`
- Create: `src/ktown_defense/open_data_observability.py`
- Modify: `src/ktown_defense/ktour_openapi.py`
- Test: `tests/test_ktour_expedition.py`
- Test: `tests/test_ktour_openapi.py`

**Interfaces:**
- Produces: `OpenApiCallObservation(operation: str, feature: str, status: str, response_count: int, error_code: str | None, started_at: datetime, completed_at: datetime)`.
- Produces: `KTourExpeditionClient.fetch_snapshot(area_code: str, keywords: tuple[str, ...], start_date: date, end_date: date, limit: int) -> TourismExpeditionSnapshot`.
- Produces immutable DTOs `TourismPlaceDetail`, `TourismImage`, `TourismFestival`, `TourismExpeditionSnapshot`.

- [x] **Step 1: Write failing operation-contract tests**

Use a complete transport fixture for all nine operations. Assert exact operation/critical query pairs:

```python
assert calls["areaBasedList2"]["areaCode"] == "6"
assert calls["searchKeyword2"]["keyword"] == "BTS"
assert calls["locationBasedList2"]["radius"] == "5000"
assert calls["detailCommon2"]["contentId"] == "101"
assert calls["detailIntro2"]["contentTypeId"] == "12"
assert calls["detailInfo2"]["contentId"] == "101"
assert calls["detailImage2"]["imageYN"] == "Y"
assert calls["searchFestival2"]["eventStartDate"] == "20260822"
assert calls["areaBasedSyncList2"]["areaCode"] == "6"
```

Assert the mapped place contains HTTPS images only, normalized plain text, parsed dates, intro/info dictionaries and `source_operations` listing only operations that contributed data.

- [x] **Step 2: Run the adapter test and verify RED**

Run: `\.\.venv\Scripts\python.exe -m pytest tests/test_ktour_expedition.py -q`
Expected: FAIL because `ktour_expedition` does not exist.

- [x] **Step 3: Implement DTOs and orchestration**

Implement:

```python
@dataclass(frozen=True)
class TourismExpeditionSnapshot:
    places: tuple[TourismPlaceDetail, ...]
    observations: tuple[OpenApiCallObservation, ...]
    changed_content_ids: tuple[str, ...]
```

`KTourExpeditionClient.fetch_snapshot` must use the exact typed signature in the
Interfaces block and return this DTO after completing all operation mappings.

Keep request URLs inside `_request`; observation errors expose stable codes such as `AUTHENTICATION_FAILED`, `INVALID_RESPONSE`, `UPSTREAM_UNAVAILABLE`, never exception strings or URL text. Optional intro/info/image failures produce failed observations and continue; common failures exclude the affected content.

- [x] **Step 4: Add mutation-oriented failure tests**

Add tests proving:

- a wrong `contentTypeId` passed to `detailIntro2` fails;
- HTTP image URLs are discarded;
- festival dates outside the requested interval are not marked active;
- an observation has no key, URL or raw body attribute;
- top-level authentication errors are not retried.

- [x] **Step 5: Run adapter suites**

Run: `\.\.venv\Scripts\python.exe -m pytest tests/test_ktour_expedition.py tests/test_ktour_openapi.py tests/test_ktour_area.py -q`
Expected: PASS.

- [x] **Step 6: Commit the adapter**

```powershell
git add -- src/ktown_defense/ktour_expedition.py src/ktown_defense/open_data_observability.py src/ktown_defense/ktour_openapi.py tests/test_ktour_expedition.py tests/test_ktour_openapi.py
git commit -m "feat: map expedition tourism APIs"
```

### Task 3: Synchronize Enriched Busan Expeditions Transactionally

**Files:**
- Create: `src/ktown_defense/expedition_sync.py`
- Create: `src/ktown_defense/sync_expeditions.py`
- Modify: `src/ktown_defense/infrastructure/repositories.py`
- Modify: `.env.example`
- Test: `tests/integration/test_expedition_sync.py`
- Test: `tests/test_sync_expeditions_cli.py`

**Interfaces:**
- Consumes: `KTourExpeditionClient.fetch_snapshot` with the exact signature from Task 2.
- Produces: `TourismExpeditionSyncService.sync(area_code: str, keywords: tuple[str, ...], start_date: date, end_date: date, limit: int, force_full: bool = False) -> CatalogSyncResult`.
- Produces CLI: `python -m ktown_defense.sync_expeditions --area-code 6 --keyword BTS --keyword K-POP --days 30 --limit 100`.

- [x] **Step 1: Write failing successful-sync integration test**

```python
result = await service.sync(
    area_code="6", keywords=("BTS", "K-POP"),
    start_date=date(2026, 8, 22), end_date=date(2026, 9, 21), limit=100,
)
assert result.status == "succeeded"
place = await find_place("101")
assert place.discovery_keywords == ["BTS"]
assert place.image_urls == ["https://images.example/101-1.jpg"]
assert set(place.source_operations) >= {"areaBasedList2", "detailCommon2"}
assert await call_log_operations(result.run_id) == EXPECTED_NINE_OPERATIONS
```

- [x] **Step 2: Run the sync test and verify RED**

Run: `\.\.venv\Scripts\python.exe -m pytest tests/integration/test_expedition_sync.py::test_sync_publishes_enrichment_and_call_evidence -q`
Expected: FAIL because the service is missing.

- [x] **Step 3: Implement sync publication and observation recorder**

Create the run first, execute the blocking adapter with `anyio.to_thread.run_sync`, write observations without request data, then upsert enriched fields in one transaction. Preserve operator/demo rows. On failed or empty snapshots, mark the run failed and do not update or deactivate current public places.

- [x] **Step 4: Write and pass last-good and idempotency tests**

Test a second identical sync keeps stable place IDs and does not duplicate content. Test an upstream exception after a successful run leaves prior rows active and records a failed run and failed observation.

Run: `\.\.venv\Scripts\python.exe -m pytest tests/integration/test_expedition_sync.py -q`
Expected: PASS.

- [x] **Step 5: Write and pass CLI tests**

Assert parsed defaults, repeated `--keyword`, invalid date windows, non-zero failure exit, and JSON output containing only run ID, status and counts.

Run: `\.\.venv\Scripts\python.exe -m pytest tests/test_sync_expeditions_cli.py -q`
Expected: PASS.

- [x] **Step 6: Commit synchronization**

```powershell
git add -- src/ktown_defense/expedition_sync.py src/ktown_defense/sync_expeditions.py src/ktown_defense/infrastructure/repositories.py .env.example tests/integration/test_expedition_sync.py tests/test_sync_expeditions_cli.py
git commit -m "feat: synchronize enriched Busan expeditions"
```

### Task 4: Recommend Explainable Multi-Category Expeditions

**Files:**
- Create: `src/ktown_defense/expedition_recommendation.py`
- Create: `src/ktown_defense/api/expedition_routes.py`
- Modify: `src/ktown_defense/api/main.py`
- Modify: `src/ktown_defense/api/place_routes.py`
- Test: `tests/test_expedition_recommendation.py`
- Test: `tests/api/test_expedition_routes.py`

**Interfaces:**
- Produces: `ExpeditionRecommendationService.recommend(session: AsyncSession, region_code: str, keyword: str | None, travel_date: date, limit: int) -> RecommendedExpedition`.
- Produces: `GET /api/v1/expeditions/recommended?regionCode=6&keyword=BTS&travelDate=2026-08-22&limit=5`.
- Produces: `GET /api/v1/open-data/status`.

- [x] **Step 1: Write failing pure recommendation tests**

Create literal place candidates around a hand-checked anchor. Assert:

```python
assert [stop.content_id for stop in result.stops] == ["anchor", "near-food", "festival", "culture"]
assert result.stops[0].reasons == ("키워드 일치",)
assert "다른 유형의 지역 명소" in result.stops[1].reasons
assert "여행일에 열리는 행사" in result.stops[2].reasons
assert result.id == service.recommend(candidates, request).id
```

Also test 3-5 limit validation, no candidates, missing keyword fallback, same-category diversity fallback, and longitude/latitude ordering mutations.

- [x] **Step 2: Run recommendation tests and verify RED**

Run: `\.\.venv\Scripts\python.exe -m pytest tests/test_expedition_recommendation.py -q`
Expected: FAIL because the recommendation module is missing.

- [x] **Step 3: Implement deterministic recommendation**

Use a pure selector for Haversine distance and category rotation, then a repository-facing service. Generate the ID from canonical UTF-8 JSON containing region, normalized keyword, travel date, snapshot version and selected content IDs using SHA-256 truncated to 24 hexadecimal characters.

- [x] **Step 4: Write failing route tests**

Assert camelCase JSON, exact stop count, non-empty reasons and enriched fields. Assert `404 EXPEDITION_NOT_AVAILABLE`, invalid limits, public status aggregation, and absence of provider names, URLs and keys in serialized responses.

- [x] **Step 5: Implement and pass API routes**

`/api/v1/open-data/status` returns:

```json
{
  "label": "관광 OpenAPI",
  "lastSuccessfulSyncAt": "2026-08-22T00:00:00Z",
  "activePlaceCount": 100,
  "operations": [
    {"operation": "areaBasedList2", "lastSucceededAt": "2026-08-22T00:00:00Z", "responseCount": 100}
  ]
}
```

Run: `\.\.venv\Scripts\python.exe -m pytest tests/test_expedition_recommendation.py tests/api/test_expedition_routes.py tests/api/test_live_places_api.py -q`
Expected: PASS.

- [x] **Step 6: Commit recommendation APIs**

```powershell
git add -- src/ktown_defense/expedition_recommendation.py src/ktown_defense/api/expedition_routes.py src/ktown_defense/api/main.py src/ktown_defense/api/place_routes.py tests/test_expedition_recommendation.py tests/api/test_expedition_routes.py
git commit -m "feat: recommend explainable regional expeditions"
```

### Task 5: Map Live Expeditions Through the Trusted Web Gateway

**Files:**
- Modify: `web/lib/domain.ts`
- Modify: `web/lib/http-services.ts`
- Modify: `web/lib/service-factory.ts`
- Test: `web/tests/http-services.test.ts`
- Test: `web/tests/ktown-gateway.test.ts`

**Interfaces:**
- Consumes the APIs from Task 4 through `/api/ktown/*`.
- Produces `TourismService.getRecommendedExpedition(filter)` and `TourismService.getOpenDataStatus()`.
- Produces `RecommendedExpedition`, `ExpeditionStop`, `OpenDataStatus` TypeScript interfaces matching camelCase JSON.

- [x] **Step 1: Write failing HTTP mapping tests**

```typescript
const expedition = await service.getRecommendedExpedition({
  regionCode: "6", keyword: "BTS", travelDate: "2026-08-22", limit: 5,
});
expect(requestUrl).toContain("regionCode=6");
expect(requestUrl).toContain("keyword=BTS");
expect(expedition.stops[0].reasons).toEqual(["키워드 일치"]);
expect(expedition.stops[0].place.imageUrls).toEqual(["https://images.example/1.jpg"]);
```

Assert malformed stop data throws `ApiError`, status mapping retains no unknown provider fields, and the gateway strips attacker-supplied identity headers as before.

- [x] **Step 2: Run web transport tests and verify RED**

Run: `npm test -- --run tests/http-services.test.ts tests/ktown-gateway.test.ts`
Expected: FAIL because the service methods do not exist.

- [x] **Step 3: Implement types and strict mappers**

Validate arrays, dates, numbers, URLs and reason strings at the network boundary. Do not add the provider name or key to TypeScript environment types.

- [x] **Step 4: Run transport and service factory tests**

Run: `npm test -- --run tests/http-services.test.ts tests/ktown-gateway.test.ts tests/service-factory.test.ts`
Expected: PASS.

- [x] **Step 5: Commit web contracts**

```powershell
git add -- web/lib/domain.ts web/lib/http-services.ts web/lib/service-factory.ts web/tests/http-services.test.ts web/tests/ktown-gateway.test.ts
git commit -m "feat(web): map live expedition APIs"
```

### Task 6: Present the OpenAPI-Powered Expedition Journey

**Files:**
- Create: `web/components/expedition/live-expedition-panel.tsx`
- Modify: `web/components/explore/live-places-panel.tsx`
- Modify: `web/components/app-shell.tsx`
- Modify: `web/app/globals.css`
- Modify: `web/app/layout.tsx`
- Test: `web/tests/live-expedition.test.tsx`
- Test: `web/tests/live-places.test.tsx`
- Test: `web/tests/fan-journey.test.tsx`

**Interfaces:**
- Consumes `getRecommendedExpedition`, `getOpenDataStatus`, and existing `onStartCheckIn(place)`.
- Produces a visible journey: discover → reasons/details → check-in.

- [x] **Step 1: Write failing live journey test**

Render the real component with deterministic services and assert:

```typescript
expect(await screen.findByRole("heading", { name: "부산 로컬 원정" })).toBeVisible();
expect(screen.getByText("키워드 일치")).toBeVisible();
expect(screen.getByText("여행일에 열리는 행사")).toBeVisible();
await user.click(screen.getByRole("button", { name: "감천문화마을 체크인" }));
expect(onStartCheckIn).toHaveBeenCalledWith(expect.objectContaining({ id: "place-1" }));
```

Assert retry behavior, empty-state copy, open-data freshness, keyboard buttons, image fallback, and no invented open/benefit/point claim.

- [x] **Step 2: Run the component test and verify RED**

Run: `npm test -- --run tests/live-expedition.test.tsx`
Expected: FAIL because `LiveExpeditionPanel` is missing.

- [x] **Step 3: Implement the minimal journey UI**

Use semantic `section`, ordered stop list, buttons and `time dateTime`. Keep the existing `CheckInFlow`. Show the status label `관광 OpenAPI`, operation count, active place count and latest update without provider branding.

- [x] **Step 4: Add and pass forbidden-branding regression test**

Render the app and assert public text and metadata do not contain the two forbidden provider tokens. The test must inspect rendered behavior, not grep source files.

- [x] **Step 5: Run web flow tests and accessibility lint**

Run: `npm test -- --run tests/live-expedition.test.tsx tests/live-places.test.tsx tests/fan-journey.test.tsx tests/real-check-in.test.tsx`
Expected: PASS.
Run: `npm run lint`
Expected: exit 0.

- [x] **Step 6: Commit the UI**

```powershell
git add -- web/components/expedition/live-expedition-panel.tsx web/components/explore/live-places-panel.tsx web/components/app-shell.tsx web/app/globals.css web/app/layout.tsx web/tests/live-expedition.test.tsx web/tests/live-places.test.tsx web/tests/fan-journey.test.tsx
git commit -m "feat(web): guide fans through live local expeditions"
```

### Task 7: Document, Run Live Sync, and Verify the Competition Story

**Files:**
- Create: `docs/competition/openapi-utilization.md`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-22-tourapi-expedition.md`
- Test: `tests/e2e/test_expedition_vertical.py`

**Interfaces:**
- Documents the nine operation-to-feature mappings, safe evidence query, setup and judge demo.
- Produces an HTTP E2E flow from recommendation to persistent check-in.

- [x] **Step 1: Write failing backend HTTP vertical test**

Seed enriched real-shaped rows and call logs, then use the ASGI client:

```python
expedition = (await client.get(
    "/api/v1/expeditions/recommended",
    params={"regionCode": "6", "keyword": "BTS", "travelDate": "2026-08-22", "limit": 3},
)).json()
session = (await member_client.post(
    "/api/v1/checkins", json={"placeId": expedition["stops"][0]["place"]["id"]},
)).json()
assert session["status"] == "collecting"
```

- [x] **Step 2: Run the E2E test and verify RED, then complete missing wiring**

Run: `\.\.venv\Scripts\python.exe -m pytest tests/e2e/test_expedition_vertical.py -q`
Expected before wiring: FAIL. Implement only missing route/repository wiring, then rerun to PASS.

- [x] **Step 3: Write the operator and submission runbook**

Include exact commands for compose, Alembic, live sync, safe SQL evidence, API/web startup and judge flow. Explain that applicant name and authentication key go only into the official submission form. Do not paste the key, provider logo, or a copied API response.

- [x] **Step 4: Run the full automated verification**

Run:

```powershell
\.\.venv\Scripts\python.exe -m unittest discover -s tests
\.\.venv\Scripts\python.exe -m pytest tests/api tests/integration tests/e2e -q
Set-Location web
npm test -- --run
npm run lint
npm run build
```

Expected: all commands exit 0.

- [x] **Step 5: Run real Busan synchronization**

Load the ignored root `.env` without printing it, then run:

```powershell
\.\.venv\Scripts\python.exe -m alembic -c alembic.ini upgrade head
\.\.venv\Scripts\python.exe -m ktown_defense.sync_expeditions --area-code 6 --keyword BTS --keyword K-POP --days 30 --limit 100
```

Expected: succeeded run, at least 100 active Busan places, and successful call logs for every required operation that returned supported data. A supported operation returning zero rows remains a successful zero-count call and is still evidence of actual use.

- [x] **Step 6: Verify live HTTP and secret absence**

Start FastAPI and web, request health, open-data status, recommendation and the web root. Confirm recommendation has at least 3 stops, at least 2 categories, non-empty reasons and a sync time. Search captured process output and HTTP bodies for the exact secret value in memory without printing it; fail the verification if found.

- [x] **Step 7: Commit documentation and E2E evidence**

```powershell
git add -- README.md docs/competition/openapi-utilization.md docs/superpowers/plans/2026-08-22-tourapi-expedition.md tests/e2e/test_expedition_vertical.py
git commit -m "docs: add competition OpenAPI evidence runbook"
```

- [x] **Step 8: Completion audit**

Re-read the spec completion criteria and map each requirement to a passing test, live database query, HTTP response or rendered browser evidence. Check `git diff main...HEAD --check`, `git status --short`, and ensure no `.env`, service key, applicant information, PDF, rendered scratch image or private upload is tracked.
