# Territory, Leagues, and Seasons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn approved visit events into replayable regional strongholds, coverage-based regional leagues, national standings, eight-week season results, digital badges, and auditable operator workflows for production corrections and recovery.

**Architecture:** Snapshot `target_region_id` into immutable ledger events, derive every competitive view from the ledger plus a season-frozen place denominator, and publish projection-versioned updates. Keep raw territory ownership separate from exploration-based league scores.

**Tech Stack:** Python 3.13, FastAPI, SQLAlchemy 2, PostgreSQL, Server-Sent Events, pytest

## Global Constraints

- First approved user/place/season visit contributes 100 points and repeats contribute zero.
- Stronghold boundaries remain 300, 1,000, 2,000 and exactly 110%.
- Regional score weights are 50% stronghold coverage, 30% unique-place coverage, 20% low-exposure coverage.
- National score weights are 50/25/15/10 and require at least three recognized regions.
- Low-exposure and place-denominator snapshots are frozen at season start.
- Reversal never deletes an original ledger event.
- Point adjustment and season finalization require an approved request from an operator distinct from the requester; DLQ retries, rights changes, and sensitive access are audited.
- Execution assumes Git has been initialized before commit steps.

---

## File Map

```text
src/ktown_defense/league.py
src/ktown_defense/exploration.py
src/ktown_defense/badges.py
src/ktown_defense/territory_events.py
src/ktown_defense/infrastructure/models/competition.py
src/ktown_defense/infrastructure/repositories/competition.py
src/ktown_defense/api/league_routes.py
src/ktown_defense/api/territory_stream.py
src/ktown_defense/governance_application.py
src/ktown_defense/api/admin_operations_routes.py
src/ktown_defense/infrastructure/models/governance.py
tests/test_regional_territory.py
tests/test_regional_league.py
tests/test_national_league.py
tests/test_badges.py
tests/e2e/test_season_replay.py
tests/api/test_admin_operations_routes.py
tests/api/test_write_contract_routes.py
```

### Task 1: Region-Frozen Ledger Events

**Files:**
- Modify: `src/ktown_defense/points.py`
- Create: `src/ktown_defense/infrastructure/models/competition.py`
- Create: `alembic/versions/20260814_07_competition.py`
- Test: `tests/test_regional_territory.py`

**Interfaces:**
- Extends: `LedgerEvent.target_region_id: str`
- Produces: `CompetitionRepository.append_unique(event) -> LedgerEvent`

- [ ] **Step 1: Write region immutability and repeat tests**

```python
def test_region_is_snapshotted_when_event_is_created(service, approved_checkin):
    event = service.consume_approval(approved_checkin)
    remap_place_to_region_b(approved_checkin.place_id)
    assert event.target_region_id == "region-a"
```

- [ ] **Step 2: Run and confirm ledger lacks region identity**

Run: `python -m pytest tests/test_regional_territory.py -v`  
Expected: FAIL because `LedgerEvent` has no `target_region_id`.

- [ ] **Step 3: Add region to approval payload and ledger constraints**

```python
@dataclass(frozen=True)
class LedgerEvent:
    ledger_event_id: str
    event_key: str
    user_id: str
    place_id: str
    target_region_id: str
    fandom_id: str
    season_id: str
    points: int
    created_at: datetime
```

- [ ] **Step 4: Apply migration and verify old scoring**

Run: `python -m alembic upgrade head`  
Expected: competition tables created.  
Run: `python -m pytest tests/test_regional_territory.py tests/test_points_idempotency.py tests/test_ledger_reversal.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit region-frozen ledger events**

```bash
git add src/ktown_defense/points.py src/ktown_defense/infrastructure/models/competition.py alembic tests/test_regional_territory.py
git commit -m "feat: freeze target region in ledger events"
```

### Task 2: Regional Stronghold Projection

**Files:**
- Modify: `src/ktown_defense/territory.py`
- Create: `src/ktown_defense/territory_events.py`
- Test: `tests/test_regional_territory.py`

**Interfaces:**
- Produces: `RegionalTerritoryProjectionService(season_id, region_id)`
- Produces events: `STRONGHOLD_CREATED`, `LEVEL_UP`, `CAPTURED`, `NEUTRALIZED`, `RETIRED`

- [ ] **Step 1: Write cross-region isolation and retirement tests**

```python
def test_region_projection_ignores_other_region_events():
    snapshot = RegionalTerritoryProjectionService("s1", "r1").rebuild([event(region_id="r2", points=300)])
    assert snapshot.strongholds == ()
```

- [ ] **Step 2: Run and observe missing regional projector**

Run: `python -m pytest tests/test_regional_territory.py -v`  
Expected: FAIL with missing class.

- [ ] **Step 3: Filter before existing deterministic replay**

```python
regional_events = tuple(
    event for event in events
    if event.season_id == self.season_id and event.target_region_id == self.region_id
)
```

Use the existing ordering, reversal, 300 threshold, level, and 110% logic. Mark rights-revoked place projections `retired` without deleting history.

- [ ] **Step 4: Run regional and legacy territory tests**

Run: `python -m pytest tests/test_regional_territory.py tests/test_territory_projection.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit regional territory projections**

```bash
git add src/ktown_defense/territory.py src/ktown_defense/territory_events.py tests/test_regional_territory.py
git commit -m "feat: project strongholds per target region"
```

### Task 3: Exploration and Regional League Score

**Files:**
- Create: `src/ktown_defense/exploration.py`
- Create: `src/ktown_defense/league.py`
- Test: `tests/test_regional_league.py`

**Interfaces:**
- Produces: `SeasonRegionSnapshot(active_place_ids, low_exposure_place_ids)`
- Produces: `RegionalLeagueCalculator.calculate(snapshot, ledger, strongholds) -> tuple[RegionalStanding, ...]`

- [ ] **Step 1: Write the approved 57-point example and repeat test**

```python
def test_regional_score_matches_design_example():
    standing = calculate(active=20, strongholds=8, visited=14, low_total=5, low_visited=4)
    assert standing.score == Decimal("57.00")

def test_repeat_visits_do_not_increase_coverage():
    assert coverage([visit("u1", "p1"), visit("u2", "p1")]) == {"p1"}
```

- [ ] **Step 2: Run and confirm calculator is missing**

Run: `python -m pytest tests/test_regional_league.py -v`  
Expected: FAIL with missing module.

- [ ] **Step 3: Implement fixed-denominator coverage**

```python
score = (
    ratio(stronghold_ids, snapshot.active_place_ids) * Decimal(50)
    + ratio(visited_ids, snapshot.active_place_ids) * Decimal(30)
    + ratio(visited_ids & snapshot.low_exposure_place_ids,
            snapshot.low_exposure_place_ids) * Decimal(20)
)
```

Round only the final public score to two decimals; retain exact Decimal components.

- [ ] **Step 4: Run all regional league boundaries**

Run: `python -m pytest tests/test_regional_league.py -v`  
Expected: PASS for empty low-exposure denominator, retired places, ties, and duplicate users.

- [ ] **Step 5: Commit regional league scoring**

```bash
git add src/ktown_defense/exploration.py src/ktown_defense/league.py tests/test_regional_league.py
git commit -m "feat: calculate coverage-based regional leagues"
```

### Task 4: National Standings

**Files:**
- Modify: `src/ktown_defense/league.py`
- Test: `tests/test_national_league.py`

**Interfaces:**
- Produces: `NationalLeagueCalculator.calculate(regional, visits, strongholds) -> tuple[NationalStanding, ...]`

- [ ] **Step 1: Write recognized-region and top-five tests**

```python
def test_national_rank_requires_three_regions(calculator):
    standing = calculator.calculate(fandom_with_two_regions())
    assert standing.eligible is False
    assert standing.ineligible_reason == "MINIMUM_THREE_REGIONS_REQUIRED"
```

- [ ] **Step 2: Run and confirm national calculator is absent**

Run: `python -m pytest tests/test_national_league.py -v`  
Expected: FAIL with missing class.

- [ ] **Step 3: Implement recognition and 50/25/15/10 scoring**

```python
recognized = [r for r in regional if r.unique_places >= 3 or r.owns_stronghold or r.visited_all_small_region]
top_five = sorted(recognized, key=lambda r: r.score, reverse=True)[:5]
```

Use regional average 50, region breadth 25, national stronghold coverage 15, and national low-exposure coverage 10. Tie-break by stronghold count, unique place count, earliest last acquisition, fandom ID.

- [ ] **Step 4: Run national standing tests**

Run: `python -m pytest tests/test_national_league.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit national standings**

```bash
git add src/ktown_defense/league.py tests/test_national_league.py
git commit -m "feat: aggregate national fandom standings"
```

### Task 5: Eight-Week Season Results and Badges

**Files:**
- Modify: `src/ktown_defense/season.py`
- Create: `src/ktown_defense/badges.py`
- Test: `tests/test_badges.py`
- Test: `tests/e2e/test_season_replay.py`

**Interfaces:**
- Produces: `BadgeEvaluator.evaluate(user_id, fandom_id, season_snapshot) -> tuple[DigitalBadge, ...]`
- Extends: `SeasonResult` with regional and national results

- [ ] **Step 1: Write eight-week, grace, replay, and badge tests**

```python
def test_region_three_place_badge_is_issued_once(evaluator):
    badges = evaluator.evaluate("u1", "f1", snapshot_with_three_places())
    assert [b.code for b in badges] == ["REGION_EXPLORER_3"]
```

- [ ] **Step 2: Run and confirm badge evaluator is absent**

Run: `python -m pytest tests/test_badges.py tests/e2e/test_season_replay.py -v`  
Expected: FAIL on missing badge and result fields.

- [ ] **Step 3: Implement immutable final result bundle**

```python
@dataclass(frozen=True)
class FinalSeasonResult:
    season_id: str
    regional: tuple[RegionalStanding, ...]
    national: tuple[NationalStanding, ...]
    badges: tuple[DigitalBadge, ...]
    projection_hash: str
    finalized_at: datetime
```

Hash canonical ledger, denominator snapshots, standings, and badges before two-operator finalization.

- [ ] **Step 4: Run season and replay suites**

Run: `python -m pytest tests/test_badges.py tests/e2e/test_season_replay.py tests/test_season_finalization.py -v`  
Expected: PASS and rebuild hash equals stored hash.

- [ ] **Step 5: Commit season results and badges**

```bash
git add src/ktown_defense/season.py src/ktown_defense/badges.py tests/test_badges.py tests/e2e/test_season_replay.py
git commit -m "feat: finalize league results and digital badges"
```

### Task 6: League APIs and SSE Recovery

**Files:**
- Create: `src/ktown_defense/api/league_routes.py`
- Create: `src/ktown_defense/api/territory_stream.py`
- Modify: `src/ktown_defense/api/main.py`
- Test: `tests/api/test_league_routes.py`
- Test: `tests/api/test_territory_stream.py`

**Interfaces:**
- Produces public region and national standings routes
- Produces: `GET /api/v1/territory/events?after_version=N`

- [ ] **Step 1: Write stale client recovery test**

```python
def test_client_recovers_events_after_projection_version(client, captured_events):
    response = client.get("/api/v1/territory/events?after_version=7")
    assert [e["projection_version"] for e in response.json()["items"]] == [8, 9]
```

- [ ] **Step 2: Run and confirm routes are absent**

Run: `python -m pytest tests/api/test_league_routes.py tests/api/test_territory_stream.py -v`  
Expected: FAIL with 404.

- [ ] **Step 3: Expose projection-versioned reads and SSE**

```python
@router.get("/territory/events")
def events(after_version: int = 0, region_id: UUID | None = None):
    return event_repository.after(after_version, region_id)
```

SSE is a notification channel only; every reconnect queries durable events after the last version.

- [ ] **Step 4: Run API, replay, and full suites**

Run: `python -m pytest tests/api/test_league_routes.py tests/api/test_territory_stream.py tests/e2e/test_season_replay.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit competition APIs**

```bash
git add src/ktown_defense/api tests/api/test_league_routes.py tests/api/test_territory_stream.py
git commit -m "feat: expose replayable league and territory updates"
```

### Task 7: Governance, DLQ, Point Adjustment, and Season Finalization APIs

**Files:**
- Create: `src/ktown_defense/governance_application.py`
- Create: `src/ktown_defense/api/admin_operations_routes.py`
- Create: `src/ktown_defense/infrastructure/models/governance.py`
- Create: `alembic/versions/20260814_08_governance.py`
- Modify: `src/ktown_defense/api/main.py`
- Test: `tests/api/test_admin_operations_routes.py`
- Test: `tests/api/test_write_contract_routes.py`

**Interfaces:**
- Produces: `DualApprovalService.request(action_type, subject_id, requester_id) -> DualApproval`
- Produces: `DualApprovalService.approve(request_id, approver_id) -> DualApproval`
- Produces: `PointAdjustmentService.apply(command, operator_id) -> LedgerEvent`
- Produces: `DlqRetryService.retry(dlq_id, operator_id) -> DlqItem`
- Produces: `SeasonFinalizationService.finalize(season_id, dual_approval_id, operator_id) -> FinalSeasonResult`
- Produces exact contract routes: `POST /api/v1/admin/dual-approvals`, `POST /api/v1/admin/dual-approvals/{id}/approve`, `POST /api/v1/admin/point-adjustments`, `POST /api/v1/admin/dlq/{id}/retry`, `POST /api/v1/admin/seasons/{id}/finalize`
- Produces: `GET /api/v1/admin/audit-logs` with role-scoped metadata only; evidence download remains a separately authorized, audited action

- [ ] **Step 1: Write failing dual-control, ledger-only adjustment, DLQ, and audit tests**

```python
def test_requester_cannot_approve_own_point_adjustment(admin_client, pending_adjustment):
    response = admin_client.post(
        f"/api/v1/admin/dual-approvals/{pending_adjustment.dual_approval_id}/approve",
        headers=operator_headers(pending_adjustment.requester_id),
    )
    assert response.status_code == 409
    assert response.json()["code"] == "DISTINCT_APPROVER_REQUIRED"

def test_approved_adjustment_appends_event_and_audit_log(operations, approved_adjustment):
    event = operations.apply_point_adjustment(approved_adjustment.command)
    assert event.event_type == "POINT_ADJUSTMENT"
    assert operations.ledger.original_event(approved_adjustment.original_event_id).points == 100
    assert operations.audit.latest().action == "POINT_ADJUSTMENT_APPLIED"
```

- [ ] **Step 2: Run and confirm operations routes and persistence are absent**

Run: `python -m pytest tests/api/test_admin_operations_routes.py -v`  
Expected: FAIL because governance persistence and routes do not exist.

- [ ] **Step 3: Implement transactional dual control and audited operations**

```python
def require_distinct_approved(request: DualApproval, approver_id: UUID, action_type: str) -> None:
    if request.action_type != action_type or request.status != "approved":
        raise GovernanceError("APPROVED_DUAL_CONTROL_REQUIRED")
    if request.requester_id == approver_id:
        raise GovernanceError("DISTINCT_APPROVER_REQUIRED")
```

Persist `DualApproval` and append-only `AuditLog` rows. Point corrections append a new `POINT_ADJUSTMENT` ledger event and never mutate prior events. Season finalization requires review grace to have ended, consumes one approved `SEASON_FINALIZATION` request once, verifies the projection hash, and stores the immutable result in the same transaction. DLQ retry uses a row lock, rejects `resolved`, resets only the selected exhausted event to its recoverable state, and records actor, reason, before/after hashes, and outcome.

- [ ] **Step 4: Apply migration and verify exact write contracts and regressions**

Run: `python -m alembic upgrade head`  
Expected: governance, dual-approval, and audit tables are created.  
Run: `python -m pytest tests/api/test_admin_operations_routes.py tests/api/test_write_contract_routes.py tests/test_dual_approval_audit.py tests/test_ledger_reversal.py tests/test_season_finalization.py tests/test_reconcile_recovery.py -v`  
Expected: all operations, exact-route, dual-control, immutable-ledger, finalization, and DLQ tests PASS.

- [ ] **Step 5: Commit production operations contracts**

```bash
git add alembic src/ktown_defense/governance_application.py src/ktown_defense/infrastructure/models/governance.py src/ktown_defense/api tests/api/test_admin_operations_routes.py tests/api/test_write_contract_routes.py
git commit -m "feat: add audited dual-control operations APIs"
```

## Plan Completion Gate

- [ ] Ledger events freeze target region and remain idempotent.
- [ ] Regional strongholds match all old and new boundaries.
- [ ] Regional 50/30/20 score uses season-frozen denominators.
- [ ] National 50/25/15/10 score enforces three recognized regions and top five.
- [ ] Reversal and rights retirement replay deterministically.
- [ ] Eight-week season finalization preserves history and issues badges once.
- [ ] SSE reconnect restores all durable versions without trusting transient messages.
- [ ] Point adjustment and season finalization reject same-operator approval and consume approved dual-control requests exactly once.
- [ ] DLQ retry, rights changes, sensitive access, point adjustment, and season finalization append audit records.
- [ ] Every write route in `ktown-defense.contracts.yaml` has an exact method/path contract test.
