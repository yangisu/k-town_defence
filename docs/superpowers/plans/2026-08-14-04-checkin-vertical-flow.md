# Check-in Vertical Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the complete mission-bound GPS, dwell, camera, review, and approval flow and emit exactly one durable approval event.

**Architecture:** Persist every check-in transition while delegating rule evaluation to existing domain code. Store private evidence separately, pin a mission version at session creation, and commit approved-processing, fandom lock, and outbox in one database transaction.

**Tech Stack:** Python 3.13, FastAPI, SQLAlchemy 2, PostgreSQL, S3-compatible private storage, pytest

## Global Constraints

- Mission version is immutable for the lifetime of a check-in session.
- Season and selected fandom are snapshotted when the session starts; approval locks that exact season membership and never reads a later client-supplied fandom.
- GPS counts only while the tab is foreground, connected, permitted, and location-confirmed.
- Start, middle, and end samples require accuracy at most 100m; all at most 50m for auto approval.
- Active dwell is at least 300 seconds and sessions expire at exactly 30 minutes.
- Only a camera capture from the active session is valid; gallery upload is rejected.
- Submit, photo upload, and approval effects are idempotent.
- Execution assumes Git has been initialized before commit steps.

---

## File Map

```text
src/ktown_defense/infrastructure/models/checkins.py
src/ktown_defense/infrastructure/repositories/checkins.py
src/ktown_defense/checkin_application.py
src/ktown_defense/approval_application.py
src/ktown_defense/api/checkin_routes.py
src/ktown_defense/api/review_routes.py
alembic/versions/20260814_06_checkins.py
tests/integration/test_persistent_checkin.py
tests/api/test_checkin_routes.py
tests/api/test_review_routes.py
tests/api/test_write_contract_routes.py
tests/e2e/test_approval_outbox_vertical.py
```

### Task 1: Persistent Mission-Pinned Sessions

**Files:**
- Create: `src/ktown_defense/infrastructure/models/checkins.py`
- Create: `src/ktown_defense/infrastructure/repositories/checkins.py`
- Create: `alembic/versions/20260814_06_checkins.py`
- Test: `tests/integration/test_persistent_checkin.py`

**Interfaces:**
- Produces: `CheckInRepository.create_session(user_id, place_id, season_id, fandom_id, mission_id, mission_version, now) -> CheckInSession`
- Produces: `CheckInRepository.get_for_update(session_id) -> CheckInSession`

- [ ] **Step 1: Write mission pin and one-active-session tests**

```python
def test_session_pins_season_fandom_and_mission_version(repository, approved_mission):
    session = repository.create_session("u1", "p1", "s1", "f1", approved_mission.id, 3, NOW)
    revise_mission_to_version_four(approved_mission)
    restored = repository.get(session.checkin_session_id)
    assert (restored.season_id, restored.fandom_id) == ("s1", "f1")
    assert restored.mission_version == 3
```

- [ ] **Step 2: Run and confirm check-in tables are absent**

Run: `python -m pytest tests/integration/test_persistent_checkin.py -v`  
Expected: FAIL with missing model or repository.

- [ ] **Step 3: Define check-in, GPS, photo, and decision rows**

```python
class CheckInSessionRow(Base):
    __tablename__ = "checkin_session"
    id: Mapped[UUID] = mapped_column(primary_key=True)
    user_id: Mapped[UUID]
    place_id: Mapped[UUID]
    season_id: Mapped[UUID]
    fandom_id: Mapped[UUID]
    mission_id: Mapped[UUID]
    mission_version: Mapped[int]
    idempotency_key: Mapped[UUID]
    status: Mapped[str]
    started_at: Mapped[datetime]
    expires_at: Mapped[datetime]
    active_dwell_seconds: Mapped[int] = mapped_column(default=0)
```

Use a partial unique index for one open session per user, a unique constraint on `(user_id, idempotency_key)`, foreign keys for user/place/season/fandom/mission, and sample sequence uniqueness.

- [ ] **Step 4: Apply migration and verify persistence**

Run: `python -m alembic upgrade head`  
Expected: check-in tables created.  
Run: `python -m pytest tests/integration/test_persistent_checkin.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit persistent sessions**

```bash
git add src/ktown_defense/infrastructure/models/checkins.py src/ktown_defense/infrastructure/repositories/checkins.py alembic tests/integration/test_persistent_checkin.py
git commit -m "feat: persist mission-pinned check-in sessions"
```

### Task 2: Session Start and Evidence APIs

**Files:**
- Create: `src/ktown_defense/checkin_application.py`
- Create: `src/ktown_defense/api/checkin_routes.py`
- Modify: `src/ktown_defense/api/main.py`
- Test: `tests/api/test_checkin_routes.py`

**Interfaces:**
- Produces: `CheckInApplication.start(user_id, place_id, season_id, idempotency_key, now) -> CheckInSession`
- Produces: sample and photo application methods

- [ ] **Step 1: Write start eligibility and evidence tests**

```python
def test_start_rejects_expired_catalog_snapshot(member_client, expired_place):
    response = member_client.post(
        "/api/v1/checkin-sessions",
        json={"place_id": expired_place.id, "season_id": ACTIVE_SEASON_ID},
        headers=IDEMPOTENCY,
    )
    assert response.status_code == 409
    assert response.json()["code"] == "CATALOG_SNAPSHOT_EXPIRED"
```

- [ ] **Step 2: Run and observe missing endpoint**

Run: `python -m pytest tests/api/test_checkin_routes.py -v`  
Expected: FAIL with 404.

- [ ] **Step 3: Implement start guard order and adapters**

```python
def start(self, user_id, place_id, season_id, idempotency_key, now):
    cached = self.idempotency.find(user_id, idempotency_key)
    if cached:
        return cached.result
    membership = self.memberships.require_selected(user_id, season_id)
    place = self.places.require_checkin_eligible(place_id, now)
    mission = self.missions.require_current_approved(place_id, now)
    self.attempts.require_below_limit(user_id, place_id, local_date(now, "Asia/Seoul"), maximum=3)
    return self.sessions.create_session(
        user_id, place_id, season_id, membership.fandom_id,
        mission.id, mission.version, now,
    )
```

GPS and photo routes load the session with a row lock, rehydrate the existing `CheckInSession` domain object, call its method, and persist the result.

- [ ] **Step 4: Verify API and existing recovery boundaries**

Run: `python -m pytest tests/api/test_checkin_routes.py tests/test_checkin_recovery.py -v`  
Expected: PASS.
Run: `python -m pytest tests/api/test_write_contract_routes.py -v`  
Expected: check-in start, GPS, photo, submit, appeal, and review routes match `ktown-defense.contracts.yaml`.

- [ ] **Step 5: Commit evidence APIs**

```bash
git add src/ktown_defense/checkin_application.py src/ktown_defense/api/checkin_routes.py tests/api/test_checkin_routes.py
git commit -m "feat: expose persistent check-in evidence APIs"
```

### Task 3: Submit and Verification Decision

**Files:**
- Modify: `src/ktown_defense/checkin_application.py`
- Modify: `src/ktown_defense/api/checkin_routes.py`
- Test: `tests/api/test_checkin_submit.py`

**Interfaces:**
- Produces: `CheckInApplication.submit(session_id, user_id, idempotency_key, now) -> SubmissionResult`
- Consumes: existing `classify_verification(evidence, policy)`

- [ ] **Step 1: Write auto, review, and duplicate-submit tests**

```python
def test_duplicate_submit_returns_original_checkin_id(ready_session, member_client):
    first = member_client.post(f"/api/v1/checkin-sessions/{ready_session.id}/submit", headers=KEY)
    second = member_client.post(f"/api/v1/checkin-sessions/{ready_session.id}/submit", headers=KEY)
    assert second.json() == first.json()
```

- [ ] **Step 2: Run and confirm submit is not persisted**

Run: `python -m pytest tests/api/test_checkin_submit.py -v`  
Expected: FAIL because the real submit handler is missing.

- [ ] **Step 3: Build evidence from authoritative rows**

```python
evidence = VerificationEvidence(
    samples=repository.samples(session.id),
    active_dwell_seconds=session.active_dwell_seconds,
    photo=repository.photo(session.id),
    duplicate_media=duplicate_detector.matches_other_user(session.photo_sha256, user_id),
    gps_weak=place.gps_weak,
)
decision = classify_verification(evidence, policy)
```

Never trust client-supplied dwell, previous sequence, distance, or risk flags.

- [ ] **Step 4: Run submit and verification suites**

Run: `python -m pytest tests/api/test_checkin_submit.py tests/test_verification_policy.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit persistent verification submission**

```bash
git add src/ktown_defense/checkin_application.py src/ktown_defense/api/checkin_routes.py tests/api/test_checkin_submit.py
git commit -m "feat: persist check-in verification decisions"
```

### Task 4: Manual Review and Appeal APIs

**Files:**
- Create: `src/ktown_defense/api/review_routes.py`
- Create: `src/ktown_defense/infrastructure/repositories/reviews.py`
- Test: `tests/api/test_review_routes.py`

**Interfaces:**
- Produces: reviewer decision and member appeal endpoints
- Consumes: existing `ReviewAppealService`

- [ ] **Step 1: Write owner, role, and exact-48-hour tests**

```python
def test_non_owner_cannot_appeal(member_client_for_other_user, rejected_checkin):
    response = member_client_for_other_user.post(f"/api/v1/checkins/{rejected_checkin.id}/appeals", json={"reason_ko": "재검토 요청"})
    assert response.status_code == 403
```

- [ ] **Step 2: Run and confirm review endpoints are absent**

Run: `python -m pytest tests/api/test_review_routes.py -v`  
Expected: FAIL with 404.

- [ ] **Step 3: Implement review repository and route authorization**

```python
@router.patch("/api/v1/admin/review-tasks/{task_id}")
def decide(task_id: UUID, body: ReviewDecisionBody,
           principal=Depends(require_operator(OperatorRole.REVIEWER))):
    return review_application.decide(task_id, principal.subject_id, body.status, body.reason_ko)
```

- [ ] **Step 4: Verify API and domain review tests**

Run: `python -m pytest tests/api/test_review_routes.py tests/test_retry_and_appeal.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit review and appeal workflows**

```bash
git add src/ktown_defense/api/review_routes.py src/ktown_defense/infrastructure/repositories/reviews.py tests/api/test_review_routes.py
git commit -m "feat: expose check-in review and appeal workflows"
```

### Task 5: Atomic Approval, Fandom Lock, and Outbox

**Files:**
- Create: `src/ktown_defense/approval_application.py`
- Modify: `src/ktown_defense/infrastructure/repositories/checkins.py`
- Test: `tests/e2e/test_approval_outbox_vertical.py`

**Interfaces:**
- Produces: `ApprovalApplication.commit(checkin_id, decision_id, now) -> ApprovalCommit`
- Produces event key: `checkin:{checkin_id}:approved:v1`

- [ ] **Step 1: Write rollback and duplicate commit tests**

```python
def test_failure_before_commit_changes_nothing(approval, db_session, approved_decision):
    with pytest.raises(InjectedFailure):
        approval.commit(approved_decision.checkin_id, approved_decision.id, NOW, fail_before_commit=True)
    assert load_checkin(db_session).status == "submitted"
    assert outbox_count(db_session) == 0
    assert membership(db_session).locked_at is None
```

- [ ] **Step 2: Run and confirm atomic application service is absent**

Run: `python -m pytest tests/e2e/test_approval_outbox_vertical.py -v`  
Expected: FAIL with missing service.

- [ ] **Step 3: Implement one database transaction**

```python
with self.session.begin():
    checkin = self.checkins.get_for_update(checkin_id)
    membership = self.memberships.get_for_update(checkin.user_id, checkin.season_id)
    membership.lock(checkin.fandom_id, now)
    checkin.status = "approved_processing"
    self.outbox.enqueue_unique(f"checkin:{checkin.id}:approved:v1", approval_payload(checkin))
```

- [ ] **Step 4: Run approval, outbox, and idempotency tests**

Run: `python -m pytest tests/e2e/test_approval_outbox_vertical.py tests/integration/test_outbox_worker.py tests/test_points_idempotency.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit atomic approval handoff**

```bash
git add src/ktown_defense/approval_application.py src/ktown_defense/infrastructure/repositories/checkins.py tests/e2e/test_approval_outbox_vertical.py
git commit -m "feat: atomically hand approved check-ins to outbox"
```

## Plan Completion Gate

- [ ] Session persists and pins mission version.
- [ ] Session snapshots `season_id` and `fandom_id`, and approval locks that exact membership.
- [ ] Tab, network, permission, GPS, dwell, photo, and 30-minute boundaries match legacy tests.
- [ ] Submit returns stable results under duplicate delivery.
- [ ] Review and appeal enforce owner, role, retry, and 48-hour rules.
- [ ] Approval locks fandom and creates one outbox event atomically.
- [ ] Restart and injected failure do not create partial state.
