# Tourism Catalog and Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import official tourism data into target-region candidates, approve rights-valid places without requiring artist links, and leave publication to the approved-mission transition in Plan 3.

**Architecture:** Preserve raw source records, derive reviewable candidates, and promote approved candidates to public places. Keep the external API adapter isolated and apply incremental changes without erasing the last good catalog.

**Tech Stack:** Python 3.13, FastAPI, SQLAlchemy 2, PostgreSQL/PostGIS, Alembic, KorService2 REST API

## Global Constraints

- Population-decline designation comes from a separate official registry, never inferred from TourAPI area codes alone.
- Every published place must map to exactly one active target region.
- Artist linkage is optional evidence and never a public visibility prerequisite.
- A failed sync preserves the last good snapshot for 24 hours and blocks new check-ins after expiry.
- Raw source payload and source hash remain auditable.
- Execution assumes Git has been initialized before commit steps.

---

## File Map

```text
src/ktown_defense/regions.py                         target-region domain rules
src/ktown_defense/infrastructure/models/catalog.py   region, source, candidate, place tables
src/ktown_defense/infrastructure/ktour/client.py      KorService2 operations
src/ktown_defense/infrastructure/repositories/catalog.py
src/ktown_defense/catalog_ingestion.py                candidate derivation
src/ktown_defense/catalog_approval.py                 approval state machine
src/ktown_defense/api/public_routes.py                map and place reads
src/ktown_defense/api/admin_catalog_routes.py         sync and candidate review
tests/test_regions.py
tests/test_catalog_ingestion.py
tests/integration/test_catalog_persistence.py
tests/api/test_admin_catalog_routes.py
```

### Task 1: Target Region Registry and Spatial Mapping

**Files:**
- Create: `src/ktown_defense/regions.py`
- Create: `src/ktown_defense/infrastructure/models/catalog.py`
- Create: `alembic/versions/20260814_03_catalog_regions.py`
- Test: `tests/test_regions.py`

**Interfaces:**
- Produces: `TargetRegion(target_region_id, name_ko, designation_source, effective_from, effective_until)`
- Produces: `RegionMatcher.match(longitude: float, latitude: float, at: datetime) -> str | None`

- [ ] **Step 1: Write exact-boundary and designation-date tests**

```python
def test_point_on_region_boundary_is_included(region_matcher):
    assert region_matcher.match(127.0, 37.0, AT) == "region-a"

def test_expired_designation_is_not_eligible(region_matcher):
    assert region_matcher.match(127.0, 37.0, AFTER_EXPIRY) is None
```

- [ ] **Step 2: Run and confirm region types are absent**

Run: `python -m pytest tests/test_regions.py -v`  
Expected: FAIL with missing `ktown_defense.regions`.

- [ ] **Step 3: Implement immutable region identity and PostGIS lookup**

```python
class RegionMatcher:
    def match(self, longitude: float, latitude: float, at: datetime) -> str | None:
        point = WKTElement(f"POINT({longitude} {latitude})", srid=4326)
        return self.repository.find_containing_region(point, at)
```

Store region boundaries as `MULTIPOLYGON(4326)` and enforce non-overlapping active target-region mappings in ingestion validation.

- [ ] **Step 4: Apply migration and run region tests**

Run: `python -m alembic upgrade head`  
Expected: region tables and PostGIS indexes are created.  
Run: `python -m pytest tests/test_regions.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit target-region mapping**

```bash
git add src/ktown_defense/regions.py src/ktown_defense/infrastructure/models/catalog.py alembic tests/test_regions.py
git commit -m "feat: add target-region spatial registry"
```

### Task 2: Expand the KorService2 Client

**Files:**
- Create: `src/ktown_defense/infrastructure/ktour/__init__.py`
- Create: `src/ktown_defense/infrastructure/ktour/client.py`
- Modify: `src/ktown_defense/ktour_openapi.py`
- Test: `tests/test_ktour_catalog_operations.py`

**Interfaces:**
- Produces: `KorServiceClient.area_places(area_code, sigungu_code, modified_since=None) -> tuple[SourcePlace, ...]`
- Produces: `KorServiceClient.enrich(content_id, content_type_id) -> SourcePlaceDetail`
- Uses: `areaBasedList2`, `detailCommon2`, `detailIntro2`, `detailInfo2`, `detailImage2`, `areaBasedSyncList2`

- [ ] **Step 1: Write paginated enrichment and error tests**

```python
def test_area_import_enriches_each_unique_content_id(recording_transport):
    places = client(recording_transport).area_places("32", "150")
    assert [p.content_id for p in places] == ["101", "102"]
    assert recording_transport.count("detailIntro2") == 2
    assert recording_transport.count("detailImage2") == 2
```

- [ ] **Step 2: Run and confirm new operations are missing**

Run: `python -m pytest tests/test_ktour_catalog_operations.py -v`  
Expected: FAIL because `KorServiceClient` is missing.

- [ ] **Step 3: Implement typed source records and common request handling**

```python
@dataclass(frozen=True)
class SourcePlace:
    content_id: str
    content_type_id: str
    title_ko: str
    longitude: float
    latitude: float
    modified_at: datetime

def enrich(self, content_id: str, content_type_id: str) -> SourcePlaceDetail:
    return SourcePlaceDetail(
        common=self._one("detailCommon2", contentId=content_id),
        intro=self._one("detailIntro2", contentId=content_id, contentTypeId=content_type_id),
        info=self._items_request("detailInfo2", contentId=content_id, contentTypeId=content_type_id),
        images=self._items_request("detailImage2", contentId=content_id, imageYN="Y"),
    )
```

Reuse existing service-key normalization, retry, gateway error, and pagination behavior.

- [ ] **Step 4: Run expanded and legacy adapter tests**

Run: `python -m pytest tests/test_ktour_catalog_operations.py tests/test_ktour_openapi.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit KorService2 expansion**

```bash
git add src/ktown_defense/infrastructure/ktour src/ktown_defense/ktour_openapi.py tests/test_ktour_catalog_operations.py
git commit -m "feat: expand KorService2 catalog operations"
```

### Task 3: Raw Source and Candidate Ingestion

**Files:**
- Create: `src/ktown_defense/catalog_ingestion.py`
- Create: `src/ktown_defense/infrastructure/repositories/catalog.py`
- Modify: `src/ktown_defense/infrastructure/models/catalog.py`
- Create: `alembic/versions/20260814_04_place_candidates.py`
- Test: `tests/test_catalog_ingestion.py`
- Test: `tests/integration/test_catalog_persistence.py`

**Interfaces:**
- Consumes: `SourcePlaceDetail`, `RegionMatcher`
- Produces: `CatalogIngestionService.ingest(snapshot: SourceSnapshot) -> IngestionResult`
- Produces states: `discovered`, `enriched`, `eligible`, `needs_review`, `rejected`

- [ ] **Step 1: Write candidate eligibility tests**

```python
def test_outside_target_region_is_rejected(service, source_place):
    result = service.ingest(snapshot(source_place, longitude=129.0, latitude=35.0))
    assert result.candidates[0].status == "rejected"
    assert result.candidates[0].rejection_reasons == ("OUTSIDE_TARGET_REGION",)
```

- [ ] **Step 2: Run and confirm ingestion service is absent**

Run: `python -m pytest tests/test_catalog_ingestion.py -v`  
Expected: FAIL with missing service.

- [ ] **Step 3: Implement raw upsert and deterministic eligibility**

```python
REQUIRED_FIELDS = ("title_ko", "address_ko", "overview_ko", "longitude", "latitude")

def derive_status(source, target_region_id):
    reasons = tuple(name for name in REQUIRED_FIELDS if not getattr(source, name))
    if target_region_id is None:
        reasons += ("OUTSIDE_TARGET_REGION",)
    return ("needs_review", ()) if not reasons else ("rejected", reasons)
```

Upsert raw records by `(source, content_id, source_modified_at)` and store a SHA-256 hash of canonical JSON.

- [ ] **Step 4: Run ingestion and persistence tests**

Run: `python -m pytest tests/test_catalog_ingestion.py tests/integration/test_catalog_persistence.py -v`  
Expected: PASS and repeated snapshots create no duplicate source version.

- [ ] **Step 5: Commit candidate ingestion**

```bash
git add src/ktown_defense/catalog_ingestion.py src/ktown_defense/infrastructure tests alembic
git commit -m "feat: derive reviewable tourism place candidates"
```

### Task 4: Operator Approval and Publication-Ready Place Projection

**Files:**
- Create: `src/ktown_defense/catalog_approval.py`
- Modify: `src/ktown_defense/catalog.py`
- Modify: `src/ktown_defense/infrastructure/models/catalog.py`
- Test: `tests/test_catalog_approval.py`

**Interfaces:**
- Produces: `CatalogApprovalService.approve(candidate_id, operator_id, safety: SafetyApproval) -> Place`
- Produces: `CatalogApprovalService.suspend(place_id, reason, operator_id) -> Place`

- [ ] **Step 1: Write approval and artist-independence tests**

```python
def test_approved_place_waits_for_mission_without_artist_link(service, eligible_candidate):
    place = service.approve(eligible_candidate.id, "operator-1", safe_approval())
    assert place.status == "approved"
    assert place.public_visible is False
    assert place.checkin_enabled is False
    assert place.artist_links == ()
```

- [ ] **Step 2: Run and observe missing approval service**

Run: `python -m pytest tests/test_catalog_approval.py -v`  
Expected: FAIL on missing `CatalogApprovalService`.

- [ ] **Step 3: Implement guarded promotion**

```python
if candidate.status != "needs_review":
    raise CatalogApprovalError("CANDIDATE_NOT_REVIEWABLE")
if not safety.coordinate_verified or not safety.photo_target_safe:
    raise CatalogApprovalError("SAFETY_APPROVAL_REQUIRED")
```

Approval stores the complete tourism record with `status="approved"`, `public_visible=False`, and `checkin_enabled=False`. Plan 3 is the sole owner of the `approved → published` transition and may set both booleans true only when the default mission, rights, target region, source freshness, and safety gates are valid.

- [ ] **Step 4: Verify approval and public discovery regressions**

Run: `python -m pytest tests/test_catalog_approval.py tests/test_public_discovery.py tests/test_rights_release_gate.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit approval workflow**

```bash
git add src/ktown_defense/catalog_approval.py src/ktown_defense/catalog.py src/ktown_defense/infrastructure/models/catalog.py tests/test_catalog_approval.py
git commit -m "feat: approve publication-ready places independently of artists"
```

### Task 5: Incremental Sync, Rights, and Last-Good Policy

**Files:**
- Modify: `src/ktown_defense/catalog_sync.py`
- Modify: `src/ktown_defense/catalog_ingestion.py`
- Test: `tests/integration/test_incremental_catalog_sync.py`

**Interfaces:**
- Produces: `IncrementalCatalogSync.run(region_id, since) -> CatalogSyncRun`
- Preserves: existing `discovery_status()` and `can_start_checkin()` semantics

- [ ] **Step 1: Write change, delete, and outage tests**

```python
def test_deleted_source_hides_place_and_retires_checkin(sync, published_place):
    sync.run_changes([source_delete(published_place.source_content_id)])
    assert sync.catalog.get_place(published_place.id, None) is None
    assert sync.can_start_checkin(published_place.id, None) is False
```

- [ ] **Step 2: Run and confirm incremental semantics fail**

Run: `python -m pytest tests/integration/test_incremental_catalog_sync.py -v`  
Expected: FAIL because delete changes are not handled.

- [ ] **Step 3: Implement source change classification**

```python
match change.change_type:
    case "created" | "updated":
        ingestion.ingest(client.enrich(change.content_id, change.content_type_id))
    case "deleted":
        approval.suspend_by_source(change.content_id, reason="SOURCE_REMOVED")
```

Retain the last-good completed timestamp and use the existing 24-hour usability boundary.

- [ ] **Step 4: Run sync, rights, and outage suites**

Run: `python -m pytest tests/integration/test_incremental_catalog_sync.py tests/test_catalog_sync.py tests/test_rights_release_gate.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit incremental sync**

```bash
git add src/ktown_defense/catalog_sync.py src/ktown_defense/catalog_ingestion.py tests/integration/test_incremental_catalog_sync.py
git commit -m "feat: apply incremental tourism catalog changes"
```

### Task 6: Catalog Admin and Public APIs

**Files:**
- Create: `src/ktown_defense/api/admin_catalog_routes.py`
- Create: `src/ktown_defense/api/public_routes.py`
- Modify: `src/ktown_defense/api/main.py`
- Test: `tests/api/test_admin_catalog_routes.py`
- Test: `tests/api/test_public_map_routes.py`
- Test: `tests/api/test_write_contract_routes.py`

**Interfaces:**
- Produces: `POST /api/v1/admin/catalog-sync-runs`
- Produces: `GET/PATCH /api/v1/admin/place-candidates`, `POST /api/v1/admin/place-candidates/{candidateId}/approve`
- Produces: `POST /api/v1/admin/places`, `PATCH /api/v1/admin/places/{placeId}` for manual creation and operator maintenance; artist evidence is optional
- Produces: `GET /api/v1/map/places`, `GET /api/v1/places/{placeId}`

- [ ] **Step 1: Write an operator-to-public API test**

```python
def test_candidate_approval_does_not_publish_before_plan_three(admin_client, public_client):
    candidate_id = admin_client.post("/api/v1/admin/catalog-sync-runs", json=REGION_SYNC).json()["candidate_ids"][0]
    assert public_client.get("/api/v1/map/places").json()["items"] == []
    admin_client.post(f"/api/v1/admin/place-candidates/{candidate_id}/approve", json=SAFE_APPROVAL)
    assert public_client.get("/api/v1/map/places").json()["items"] == []
```

- [ ] **Step 2: Run and confirm routes are missing**

Run: `python -m pytest tests/api/test_admin_catalog_routes.py tests/api/test_public_map_routes.py -v`  
Expected: FAIL with 404 routes.

- [ ] **Step 3: Implement thin route handlers**

Route handlers validate schemas, call application services, and serialize results; they do not contain eligibility or approval rules.

```python
@router.post("/place-candidates/{candidate_id}/approve")
def approve_candidate(candidate_id: UUID, body: SafetyApprovalBody,
                      principal=Depends(require_operator(OperatorRole.PLACE_MANAGER))):
    return service.approve(candidate_id, principal.subject_id, body.to_domain())
```

- [ ] **Step 4: Run API, catalog, and full backend suites**

Run: `python -m pytest tests/api/test_admin_catalog_routes.py tests/api/test_public_map_routes.py -v`  
Expected: PASS.  
Run: `python -m pytest tests/api/test_write_contract_routes.py -v`  
Expected: the catalog sync and admin place methods and paths exactly match `ktown-defense.contracts.yaml`.  
Run: `python -m unittest discover -s tests -v`  
Expected: all legacy tests PASS.

- [ ] **Step 5: Commit catalog HTTP workflows**

```bash
git add src/ktown_defense/api tests/api
git commit -m "feat: expose tourism catalog review and map APIs"
```

## Plan Completion Gate

- [ ] Target-region boundaries and designation dates are persistent.
- [ ] KorService2 imports area places and all required details.
- [ ] Raw snapshots are versioned and deduplicated.
- [ ] Places outside target regions cannot be approved.
- [ ] Approved places remain non-public until Plan 3 activates an approved default mission; artist links remain optional.
- [ ] Incremental delete and rights revocation hide places immediately.
- [ ] Last-good 24-hour behavior remains green.
