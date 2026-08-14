# Analytics and Pilot Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure real regional exploration without retaining unnecessary personal location data and enforce operational gates for a safe eight-week pilot.

**Architecture:** Emit privacy-minimized funnel events, aggregate daily place and region metrics, trace the check-in-to-projection pipeline, and make release gates consume observed test and telemetry artifacts rather than synthetic passing fixtures.

**Tech Stack:** Python 3.13, PostgreSQL, FastAPI, OpenTelemetry, Prometheus-compatible metrics, Playwright, pytest, k6 or Locust

## Global Constraints

- Analytics never stores raw GPS, photo bytes, provider subject, or public user identity.
- Unique users use a season-scoped pseudonymous analytics ID.
- Minimum cohort size is enforced before fandom-region analytics are returned.
- Performance and availability release gates consume observed timestamped artifacts.
- Pilot starts with one region, expands to three, then five or more for the eight-week season.
- Execution assumes Git has been initialized before commit steps.

---

## File Map

```text
src/ktown_defense/analytics.py
src/ktown_defense/analytics_events.py
src/ktown_defense/infrastructure/models/analytics.py
src/ktown_defense/infrastructure/repositories/analytics.py
src/ktown_defense/api/admin_analytics_routes.py
src/ktown_defense/observability.py
src/ktown_defense/retention_jobs.py
src/ktown_defense/pilot_readiness.py
alembic/versions/20260814_09_analytics.py
tests/test_analytics_privacy.py
tests/integration/test_daily_aggregates.py
tests/api/test_admin_analytics.py
tests/load/locustfile.py
tests/load/run_smoke.py
docs/runbooks/pilot-season.md
docs/runbooks/incidents.md
```

### Task 1: Privacy-Minimized Funnel Events

**Files:**
- Create: `src/ktown_defense/analytics_events.py`
- Create: `src/ktown_defense/infrastructure/models/analytics.py`
- Create: `alembic/versions/20260814_09_analytics.py`
- Test: `tests/test_analytics_privacy.py`

**Interfaces:**
- Produces: `AnalyticsEventRecorder.record(event: ExplorationEvent) -> None`
- Produces: `season_pseudonym(user_id, season_id, secret) -> str`

- [ ] **Step 1: Write forbidden-field and pseudonym tests**

```python
def test_event_schema_rejects_raw_location_and_identity():
    with pytest.raises(ValidationError):
        ExplorationEvent(event_type="MISSION_STARTED", latitude=37.0, user_id="u1")

def test_pseudonym_changes_between_seasons():
    assert season_pseudonym("u1", "s1", KEY) != season_pseudonym("u1", "s2", KEY)
```

- [ ] **Step 2: Run and confirm analytics schema is absent**

Run: `python -m pytest tests/test_analytics_privacy.py -v`  
Expected: FAIL.

- [ ] **Step 3: Implement a closed event schema**

```python
class ExplorationEvent(BaseModel):
    event_type: Literal['MAP_IMPRESSION', 'PLACE_DETAIL', 'DIRECTIONS', 'MISSION_STARTED', 'SUBMITTED', 'APPROVED', 'NEXT_SELECTED']
    season_pseudonym: str
    season_id: str
    target_region_id: str
    place_id: str
    fandom_id: str | None
    occurred_at: datetime
```

Reject unknown fields with `extra='forbid'`.

- [ ] **Step 4: Apply migration and run privacy tests**

Run: `python -m alembic upgrade head`  
Expected: analytics tables created.  
Run: `python -m pytest tests/test_analytics_privacy.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit privacy-minimized events**

```bash
git add src/ktown_defense/analytics_events.py src/ktown_defense/infrastructure/models/analytics.py alembic tests/test_analytics_privacy.py
git commit -m "feat: record privacy-minimized exploration events"
```

### Task 2: Daily Place, Region, and Fandom Aggregates

**Files:**
- Create: `src/ktown_defense/analytics.py`
- Create: `src/ktown_defense/infrastructure/repositories/analytics.py`
- Test: `tests/integration/test_daily_aggregates.py`

**Interfaces:**
- Produces: `DailyAnalyticsJob.run(day: date) -> AggregateResult`
- Produces place, region, and fandom-season metrics

- [ ] **Step 1: Write unique, breadth, lift, and concentration tests**

```python
def test_duplicate_user_place_day_counts_once(job, events):
    result = job.run(DAY)
    assert result.place("p1").unique_visitors == 1
    assert result.region("r1").unique_places_visited == 1
```

- [ ] **Step 2: Run and confirm aggregate job is missing**

Run: `python -m pytest tests/integration/test_daily_aggregates.py -v`  
Expected: FAIL.

- [ ] **Step 3: Implement idempotent daily replacement**

Calculate unique approved pseudonyms, unique places, per-user region breadth, low-exposure lift against the frozen baseline, top-10%-place concentration, and distinct-day region revisit rate. Replace a day's aggregates in one transaction.

```python
with session.begin():
    repository.delete_day(day)
    repository.insert_all(calculate_day(day, repository.events(day)))
```

- [ ] **Step 4: Run aggregate and replay tests**

Run: `python -m pytest tests/integration/test_daily_aggregates.py -v`  
Expected: PASS and repeated job output is identical.

- [ ] **Step 5: Commit tourism KPI aggregation**

```bash
git add src/ktown_defense/analytics.py src/ktown_defense/infrastructure/repositories/analytics.py tests/integration/test_daily_aggregates.py
git commit -m "feat: aggregate regional tourism impact metrics"
```

### Task 3: Cohort-Safe Admin Analytics API

**Files:**
- Create: `src/ktown_defense/api/admin_analytics_routes.py`
- Modify: `src/ktown_defense/api/main.py`
- Test: `tests/api/test_admin_analytics.py`

**Interfaces:**
- Produces region overview, funnel, concentration, integrity, and safety reports

- [ ] **Step 1: Write minimum-cohort suppression tests**

```python
def test_small_fandom_region_cohort_is_suppressed(admin_client):
    body = admin_client.get('/api/v1/admin/analytics/regions/r1').json()
    assert body['fandom_breakdown']['fandom-small'] == {'suppressed': True}
```

- [ ] **Step 2: Run and confirm analytics route is missing**

Run: `python -m pytest tests/api/test_admin_analytics.py -v`  
Expected: FAIL with 404.

- [ ] **Step 3: Implement aggregate-only responses**

```python
if metric.unique_users < settings.analytics_minimum_cohort:
    return SuppressedMetric(suppressed=True)
```

No route returns raw event rows, user pseudonyms, GPS samples, or photo references.

- [ ] **Step 4: Run analytics API and privacy suites**

Run: `python -m pytest tests/api/test_admin_analytics.py tests/test_analytics_privacy.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit safe analytics reporting**

```bash
git add src/ktown_defense/api/admin_analytics_routes.py tests/api/test_admin_analytics.py
git commit -m "feat: expose cohort-safe tourism analytics"
```

### Task 4: Retention and Withdrawal Jobs

**Files:**
- Create: `src/ktown_defense/retention_jobs.py`
- Modify: `src/ktown_defense/privacy.py`
- Test: `tests/integration/test_retention_jobs.py`

**Interfaces:**
- Produces: `RetentionJob.run(now) -> RetentionPurgeResult`
- Produces: `WithdrawalApplication.withdraw(user_id, now) -> WithdrawalResult`

- [ ] **Step 1: Write exact-boundary storage deletion tests**

```python
def test_photo_is_deleted_from_database_and_object_storage_at_boundary(job, storage):
    result = job.run(PHOTO_DELETE_AT)
    assert result.deleted_photos == 1
    assert storage.exists(PHOTO_KEY) is False
```

- [ ] **Step 2: Run and confirm infrastructure deletion is incomplete**

Run: `python -m pytest tests/integration/test_retention_jobs.py -v`  
Expected: FAIL because object deletion is not wired.

- [ ] **Step 3: Implement idempotent database and object deletion**

Delete storage objects before marking the database evidence purged; retries treat a missing object as successful deletion. Withdrawal rotates or removes analytics linkage and retains only anonymous ledger identity.

```python
for photo in repository.expired_photos(now):
    try:
        storage.delete(photo.private_key)
    except ObjectNotFound:
        pass
    repository.mark_photo_purged(photo.photo_id, purged_at=now)

repository.commit()
```

- [ ] **Step 4: Run retention and existing privacy tests**

Run: `python -m pytest tests/integration/test_retention_jobs.py tests/test_privacy_retention.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit operational privacy jobs**

```bash
git add src/ktown_defense/retention_jobs.py src/ktown_defense/privacy.py tests/integration/test_retention_jobs.py
git commit -m "feat: enforce evidence retention in persistent storage"
```

### Task 5: Traceable Reliability and Performance Measurements

**Files:**
- Create: `src/ktown_defense/observability.py`
- Modify: `src/ktown_defense/api/main.py`
- Modify: `src/ktown_defense/infrastructure/outbox_worker.py`
- Create: `tests/load/locustfile.py`
- Create: `tests/load/run_smoke.py`
- Test: `tests/integration/test_trace_timestamps.py`

**Interfaces:**
- Produces trace correlation from request through ledger and territory projection
- Produces observed `PerformanceRun` artifacts from timestamped events

- [ ] **Step 1: Write timestamp correlation test**

```python
def test_approval_trace_contains_ledger_and_projection_times(trace_exporter):
    spans = trace_exporter.for_event('checkin:c1:approved:v1')
    assert {s.name for s in spans} >= {'checkin.approve', 'ledger.append', 'territory.project'}
```

- [ ] **Step 2: Run and confirm trace spans are absent**

Run: `python -m pytest tests/integration/test_trace_timestamps.py -v`  
Expected: FAIL.

- [ ] **Step 3: Instrument stable spans and observed load script**

```python
with tracer.start_as_current_span('ledger.append', attributes={'event.key': event_key}):
    ledger.append(event)
```

The load script covers map, detail, mission, check-in creation, photo upload, submit, strongholds, and leaderboards with the measurement window and successful-request denominators required by `PerformanceContractEvaluator`. `tests/load/run_smoke.py` starts uvicorn as a child process, waits for `/health`, invokes Locust, writes the timestamped raw report, and always terminates the child in `finally`; this prevents stale or manually started servers from satisfying the gate.

- [ ] **Step 4: Run trace and local load smoke tests**

Run: `python -m pytest tests/integration/test_trace_timestamps.py tests/test_performance_contract.py -v`  
Expected: PASS.  
Run: `docker compose up -d --wait`  
Expected: PostgreSQL/PostGIS and object storage are healthy.  
Run: `python tests/load/run_smoke.py --users 10 --spawn-rate 2 --duration 60s`  
Expected: an observed load artifact with no request exceptions.

- [ ] **Step 5: Commit observed measurement instrumentation**

```bash
git add src/ktown_defense/observability.py src/ktown_defense/api/main.py src/ktown_defense/infrastructure/outbox_worker.py tests/load tests/integration/test_trace_timestamps.py
git commit -m "feat: trace and measure the approval pipeline"
```

### Task 6: Availability and Release Evidence Pipeline

**Files:**
- Create: `src/ktown_defense/release_evidence.py`
- Modify: `src/ktown_defense/availability.py`
- Modify: `src/ktown_defense/performance.py`
- Test: `tests/integration/test_release_evidence.py`

**Interfaces:**
- Produces: `ReleaseEvidenceLoader.load(directory) -> ReleaseEvidence`
- Consumes timestamped CI, load, availability, defect, and E2E artifacts

- [ ] **Step 1: Write synthetic-artifact rejection test**

```python
def test_release_rejects_fixture_only_performance_report(loader, fixture_report):
    with pytest.raises(ReleaseContractError, match='OBSERVED_EVIDENCE_REQUIRED'):
        loader.load(fixture_report.directory)
```

- [ ] **Step 2: Run and confirm loader is absent**

Run: `python -m pytest tests/integration/test_release_evidence.py -v`  
Expected: FAIL.

- [ ] **Step 3: Require provenance and timestamps**

Observed evidence includes build commit, environment, start and end timestamps, workload version, raw measurement URI, and signature hash. Four-week availability requires 28 complete UTC days and all six browser E2E journeys.

```python
@dataclass(frozen=True)
class ObservedEvidence:
    build_commit: str
    environment: str
    started_at: datetime
    ended_at: datetime
    workload_version: str
    raw_measurement_uri: str
    signature_sha256: str

def require_observed(evidence: ObservedEvidence, *, source: str) -> None:
    if source in {'fixture', 'synthetic'} or evidence.ended_at <= evidence.started_at:
        raise ReleaseContractError('OBSERVED_EVIDENCE_REQUIRED')
```

- [ ] **Step 4: Run release evidence and evaluator tests**

Run: `python -m pytest tests/integration/test_release_evidence.py tests/test_performance_contract.py tests/test_availability_release.py -v`  
Expected: PASS, with fixture-only release attempts rejected.

- [ ] **Step 5: Commit evidence-backed release gates**

```bash
git add src/ktown_defense/release_evidence.py src/ktown_defense/availability.py src/ktown_defense/performance.py tests/integration/test_release_evidence.py
git commit -m "feat: require observed release evidence"
```

### Task 7: Pilot Runbooks and Launch Gate

**Files:**
- Create: `src/ktown_defense/pilot_readiness.py`
- Create: `docs/runbooks/pilot-season.md`
- Create: `docs/runbooks/incidents.md`
- Create: `tests/e2e/test_pilot_readiness.py`

**Interfaces:**
- Produces an executable readiness check for one-region, three-region, and eight-week gates

- [ ] **Step 1: Write failing readiness assertions**

```python
def test_one_region_launch_requires_approved_inventory(readiness):
    report = readiness.evaluate()
    assert report.approved_places_between(20, 50)
    assert report.all_published_places_have_approved_missions
    assert report.unresolved_p0_p1 == 0
```

- [ ] **Step 2: Run and capture missing runbook and readiness data**

Run: `python -m pytest tests/e2e/test_pilot_readiness.py -v`  
Expected: FAIL because readiness evaluator and required artifacts are absent.

- [ ] **Step 3: Write exact operator procedures**

Document catalog outage, rights takedown, unsafe-place suspension, photo exposure, GPS fraud spike, review backlog, outbox lag, DLQ replay, season freeze, rollback, and user communication. Every procedure names the API or command, required role, verification query, and audit record.

```python
class PilotReadinessEvaluator:
    def evaluate(self) -> ReadinessReport:
        inventory = self.catalog.readiness_inventory()
        incidents = self.incidents.open_severity_counts()
        evidence = self.release_evidence.latest_verified()
        return ReadinessReport.from_inputs(inventory, incidents, evidence)
```

Each runbook entry uses an executable form such as:

```bash
python -m ktown_defense.ops suspend-place --place-id PLACE_ID --reason unsafe
python -m ktown_defense.ops verify-audit --entity-type place --entity-id PLACE_ID
```

- [ ] **Step 4: Run readiness and complete regression**

Run: `python -m pytest tests/e2e/test_pilot_readiness.py -v`  
Expected: PASS with seeded readiness artifacts.  
Run: `python -m pytest -v`  
Expected: all unit, integration, API, E2E, privacy, fault, and release tests PASS.

- [ ] **Step 5: Commit pilot operations**

```bash
git add src/ktown_defense/pilot_readiness.py docs/runbooks tests/e2e/test_pilot_readiness.py
git commit -m "docs: add executable eight-week pilot operations"
```

## Plan Completion Gate

- [ ] Analytics schema rejects raw location and identity fields.
- [ ] Daily aggregates are idempotent and reproduce unique visitor, place, breadth, lift, concentration, and revisit metrics.
- [ ] Small cohorts are suppressed and raw events are never exposed.
- [ ] Database and object-storage retention delete at exact boundaries.
- [ ] Observed traces connect approval, ledger, and projection timestamps.
- [ ] Load and availability gates consume observed evidence with provenance.
- [ ] One-region, three-region, and eight-week readiness checks are executable.
