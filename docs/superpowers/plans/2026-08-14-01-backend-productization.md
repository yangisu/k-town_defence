# Backend Productization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a persistent FastAPI and PostgreSQL foundation that executes existing domain behavior through real HTTP transactions and durable outbox processing.

**Architecture:** Keep domain objects independent from frameworks. Add SQLAlchemy models and repositories behind explicit ports, use FastAPI only at the boundary, and poll transactional outbox rows with PostgreSQL row locking.

**Tech Stack:** Python 3.13, FastAPI, Pydantic Settings, SQLAlchemy 2, Alembic, PostgreSQL/PostGIS, pytest, httpx, boto3-compatible storage client

## Global Constraints

- Preserve `KTownDefenseApp` as an in-process domain test adapter while real routes move to `src/ktown_defense/api`.
- Do not store service keys, database credentials, or object-storage secrets in source control.
- Every write endpoint uses a UUID-v4 idempotency key where declared by `ktown-defense.contracts.yaml`.
- Database and outbox commits must be atomic.
- Existing `unittest` tests remain green after every task.
- Execution assumes Git has been initialized before commit steps.

---

## File Map

```text
pyproject.toml                                      package and test dependencies
compose.yaml                                        PostgreSQL/PostGIS and private object-storage test services
.env.example                                        non-secret local configuration template
.gitignore                                          credentials, caches, and build-output exclusions
alembic.ini                                        migration configuration
alembic/env.py                                     SQLAlchemy metadata binding
src/ktown_defense/settings.py                      environment settings
src/ktown_defense/api/main.py                      FastAPI application factory
src/ktown_defense/api/dependencies.py              DB and principal dependencies
src/ktown_defense/api/errors.py                    stable domain-to-HTTP errors
src/ktown_defense/infrastructure/database.py        engine and session factory
src/ktown_defense/infrastructure/models/core.py     account, fandom, idempotency models
src/ktown_defense/infrastructure/models/events.py   outbox and DLQ models
src/ktown_defense/infrastructure/outbox_worker.py   row-locked durable worker
src/ktown_defense/infrastructure/storage.py         private photo storage port
tests/api/test_health.py                            application boot contract
tests/integration/test_database_foundation.py       persistence constraints
tests/integration/test_outbox_worker.py             crash and duplicate delivery
```

### Task 1: Package and Application Factory

**Files:**
- Create: `pyproject.toml`
- Create: `compose.yaml`
- Create: `.env.example`
- Modify: `.gitignore`
- Create: `src/ktown_defense/settings.py`
- Create: `src/ktown_defense/api/__init__.py`
- Create: `src/ktown_defense/api/main.py`
- Test: `tests/api/test_health.py`

**Interfaces:**
- Produces: `create_app(settings: Settings | None = None) -> FastAPI`
- Produces: `Settings(database_url, object_storage_endpoint, object_storage_bucket, environment)`
- Produces: reproducible local PostgreSQL/PostGIS and S3-compatible private-storage services with health checks

- [ ] **Step 1: Write the failing health test**

```python
from fastapi.testclient import TestClient
from ktown_defense.api.main import create_app

def test_health_returns_service_identity():
    response = TestClient(create_app()).get("/health")
    assert response.status_code == 200
    assert response.json() == {"service": "ktown-defense", "status": "ok"}
```

- [ ] **Step 2: Run the test and observe the missing module failure**

Run: `python -m pytest tests/api/test_health.py -v`  
Expected: FAIL with `ModuleNotFoundError: ktown_defense.api`.

- [ ] **Step 3: Add package metadata and the minimal app factory**

```python
from fastapi import FastAPI

def create_app(settings=None) -> FastAPI:
    app = FastAPI(title="KTown Defense", version="1.0.0")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"service": "ktown-defense", "status": "ok"}

    return app
```

Declare runtime dependencies for FastAPI, uvicorn, pydantic-settings, SQLAlchemy, Alembic, psycopg, GeoAlchemy2, and boto3; declare pytest and httpx as test dependencies.

Create `compose.yaml` with pinned PostGIS and S3-compatible service images, named health checks, non-production local credentials supplied through `.env`, and persistent named volumes. `.env.example` contains only placeholders; `.gitignore` excludes `.env`, `*.pem`, `*.ppk`, `__pycache__/`, `.pytest_cache/`, `node_modules/`, `.next/`, and generated evidence artifacts.

- [ ] **Step 4: Run targeted and legacy tests**

Run: `docker compose config`  
Expected: configuration renders without missing variables or embedded private keys.  
Run: `docker compose up -d --wait`  
Expected: PostgreSQL/PostGIS and private object storage report healthy.  
Run: `python -m pytest tests/api/test_health.py -v`  
Expected: PASS.  
Run: `python -m unittest discover -s tests -v`  
Expected: 102 existing tests PASS.

- [ ] **Step 5: Commit the application foundation**

```bash
git add .gitignore .env.example compose.yaml pyproject.toml src/ktown_defense/settings.py src/ktown_defense/api tests/api/test_health.py
git commit -m "feat: add FastAPI application foundation"
```

### Task 2: Database Session and Initial Migration

**Files:**
- Create: `src/ktown_defense/infrastructure/database.py`
- Create: `src/ktown_defense/infrastructure/models/__init__.py`
- Create: `src/ktown_defense/infrastructure/models/core.py`
- Create: `alembic.ini`
- Create: `alembic/env.py`
- Create: `alembic/versions/20260814_01_foundation.py`
- Test: `tests/integration/test_database_foundation.py`

**Interfaces:**
- Produces: `make_engine(database_url: str) -> Engine`
- Produces: `make_session_factory(engine: Engine) -> sessionmaker[Session]`
- Produces tables: `user_account`, `fandom`, `season_membership`, `idempotency_record`

- [ ] **Step 1: Write a failing uniqueness integration test**

```python
def test_one_membership_per_user_and_season(db_session):
    db_session.add_all([
        SeasonMembershipRow(user_id="u1", season_id="s1", fandom_id="f1"),
        SeasonMembershipRow(user_id="u1", season_id="s1", fandom_id="f2"),
    ])
    with pytest.raises(IntegrityError):
        db_session.commit()
```

- [ ] **Step 2: Run the migration test before models exist**

Run: `python -m pytest tests/integration/test_database_foundation.py -v`  
Expected: FAIL because `SeasonMembershipRow` and the tables do not exist.

- [ ] **Step 3: Define typed declarative models and migration**

```python
class SeasonMembershipRow(Base):
    __tablename__ = "season_membership"
    id: Mapped[UUID] = mapped_column(primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("user_account.id"))
    season_id: Mapped[UUID]
    fandom_id: Mapped[UUID] = mapped_column(ForeignKey("fandom.id"))
    locked_at: Mapped[datetime | None]
    __table_args__ = (UniqueConstraint("user_id", "season_id"),)
```

Enable PostGIS in the migration with `CREATE EXTENSION IF NOT EXISTS postgis` and use timezone-aware timestamps.

- [ ] **Step 4: Apply migration and run tests**

Run: `python -m alembic upgrade head`  
Expected: migration succeeds on the test PostgreSQL database.  
Run: `python -m pytest tests/integration/test_database_foundation.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit the persistent foundation**

```bash
git add alembic.ini alembic src/ktown_defense/infrastructure tests/integration/test_database_foundation.py
git commit -m "feat: add PostgreSQL persistence foundation"
```

### Task 3: Authentication Dependency and Stable Errors

**Files:**
- Create: `src/ktown_defense/api/dependencies.py`
- Create: `src/ktown_defense/api/errors.py`
- Create: `src/ktown_defense/api/member_routes.py`
- Modify: `src/ktown_defense/api/main.py`
- Test: `tests/api/test_auth_boundary.py`

**Interfaces:**
- Consumes: existing `Principal`, `authorize`, and `policy_for`
- Produces: `require_member() -> Principal`
- Produces: `require_operator(*roles: OperatorRole) -> Principal`

- [ ] **Step 1: Write the failing member-boundary test**

```python
def test_adult_active_member_is_required(client):
    assert client.get("/api/v1/me/season-membership").status_code == 401
    headers = {"Authorization": "Test member:u1:adult:active"}
    assert client.get("/api/v1/me/season-membership", headers=headers).status_code == 200
```

- [ ] **Step 2: Run and confirm the route is absent**

Run: `python -m pytest tests/api/test_auth_boundary.py -v`  
Expected: FAIL because the route returns 404.

- [ ] **Step 3: Implement principal parsing and dependency checks**

```python
def require_member(principal: Principal | None = Depends(current_principal)) -> Principal:
    if principal is None:
        raise HTTPException(401, detail={"code": "AUTHENTICATION_REQUIRED"})
    if principal.kind != "member" or principal.status != "active" or not principal.adult_verified:
        raise HTTPException(403, detail={"code": "FORBIDDEN"})
    return principal
```

Keep the `Test` authorization scheme restricted to the test app; production uses a pluggable token verifier.

- [ ] **Step 4: Verify authentication and legacy RBAC**

Run: `python -m pytest tests/api/test_auth_boundary.py tests/test_rbac_integration.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit the HTTP authorization boundary**

```bash
git add src/ktown_defense/api tests/api/test_auth_boundary.py
git commit -m "feat: enforce API authentication dependencies"
```

### Task 4: Private Photo Storage

**Files:**
- Create: `src/ktown_defense/infrastructure/storage.py`
- Modify: `src/ktown_defense/privacy.py`
- Test: `tests/integration/test_private_storage.py`

**Interfaces:**
- Consumes: existing `strip_exif(content: bytes, mime_type: str) -> bytes`
- Produces: `PrivateObjectStorage.put_photo(key, content, mime_type) -> StoredObject`
- Produces: `PrivateObjectStorage.delete(key) -> None`

- [ ] **Step 1: Write a failing storage safety test**

```python
def test_photo_is_stripped_and_never_public(storage, jpeg_with_exif):
    saved = storage.put_photo("checkins/c1/photo", jpeg_with_exif, "image/jpeg")
    assert saved.public_url is None
    assert b"Exif" not in storage.read_private(saved.key)
```

- [ ] **Step 2: Run and confirm the storage port is missing**

Run: `python -m pytest tests/integration/test_private_storage.py -v`  
Expected: FAIL with missing `PrivateObjectStorage`.

- [ ] **Step 3: Implement the private adapter contract**

```python
@dataclass(frozen=True)
class StoredObject:
    key: str
    sha256: str
    byte_size: int
    public_url: None = None

class PrivateObjectStorage:
    def put_photo(self, key: str, content: bytes, mime_type: str) -> StoredObject:
        clean = strip_exif(content, mime_type)
        self.client.put_object(Bucket=self.bucket, Key=key, Body=clean,
                               ContentType=mime_type, ACL="private")
        return StoredObject(key, sha256(clean).hexdigest(), len(clean))
```

- [ ] **Step 4: Verify storage and privacy regression**

Run: `python -m pytest tests/integration/test_private_storage.py tests/test_privacy_retention.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit private evidence storage**

```bash
git add src/ktown_defense/infrastructure/storage.py src/ktown_defense/privacy.py tests/integration/test_private_storage.py
git commit -m "feat: add private EXIF-safe photo storage"
```

### Task 5: Transactional Outbox Worker

**Files:**
- Create: `src/ktown_defense/infrastructure/models/events.py`
- Create: `alembic/versions/20260814_02_outbox.py`
- Create: `src/ktown_defense/infrastructure/outbox_worker.py`
- Test: `tests/integration/test_outbox_worker.py`

**Interfaces:**
- Produces: `OutboxWorker.process_batch(limit: int = 100) -> BatchResult`
- Produces: `OutboxHandler.handle(session: Session, event_key: str, payload: dict[str, object]) -> None`
- Produces: `RETRY_OFFSETS = (1, 5, 30, 120, 300)` seconds from `first_failed_at`

- [ ] **Step 1: Write duplicate and crash recovery tests**

```python
def test_handler_effect_rolls_back_and_is_applied_once_after_worker_restart(db_session, handler):
    enqueue(db_session, event_key="checkin:c1:approved:v1")
    crashing = OutboxWorker(db_session, CrashAfterHandle(handler))
    with pytest.raises(InjectedCrash):
        crashing.process_batch()
    db_session.rollback()
    OutboxWorker(db_session, handler).process_batch()
    assert db_session.scalar(select(func.count()).select_from(LedgerEventRow)) == 1
    assert db_session.scalar(select(OutboxEventRow.status)) == "applied"
```

- [ ] **Step 2: Run and confirm worker types are missing**

Run: `python -m pytest tests/integration/test_outbox_worker.py -v`  
Expected: FAIL on missing outbox model.

- [ ] **Step 3: Implement row locking and idempotent completion**

```python
rows = session.scalars(
    select(OutboxEventRow)
    .where(OutboxEventRow.status == "pending")
    .order_by(OutboxEventRow.created_at)
    .with_for_update(skip_locked=True)
    .limit(limit)
).all()
```

For each row, call the handler and mark the outbox row `applied` inside the same `session.begin()` transaction. Every durable handler effect has a unique `event_key`; a crash before commit rolls back both the effect and outbox status, while replay observes the same uniqueness key. Never claim exactly-once delivery to an external non-transactional system—external consumers must implement their own inbox keyed by `event_key`.

Record `attempt_count`, `first_failed_at`, `next_attempt_at`, and `failed_stage`. Schedule retries at exactly 1, 5, 30, 120, and 300 seconds from `first_failed_at`; after the fifth failed retry, create one unique DLQ row per event key and emit the operator notification in the same transaction.

- [ ] **Step 4: Verify fault behavior and existing reconcile rules**

Run: `python -m pytest tests/integration/test_outbox_worker.py tests/test_reconcile_recovery.py tests/test_points_idempotency.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit durable event processing**

```bash
git add alembic src/ktown_defense/infrastructure/models/events.py src/ktown_defense/infrastructure/outbox_worker.py tests/integration/test_outbox_worker.py
git commit -m "feat: add durable transactional outbox worker"
```

### Task 6: Persistent Membership HTTP Vertical Slice

**Files:**
- Create: `src/ktown_defense/infrastructure/repositories/membership.py`
- Modify: `src/ktown_defense/api/member_routes.py`
- Modify: `src/ktown_defense/api/main.py`
- Test: `tests/e2e/test_membership_persistence.py`

**Interfaces:**
- Produces: `MembershipRepository.get(user_id, season_id) -> SeasonMembership | None`
- Produces: `MembershipRepository.select(user_id, season_id, fandom_id) -> SeasonMembership`

- [ ] **Step 1: Write restart persistence and conflict tests**

```python
def test_selected_fandom_survives_new_app_instance(app_factory):
    first = TestClient(app_factory())
    response = first.put("/api/v1/me/season-membership", json={"fandom_id": "f1"}, headers=MEMBER)
    assert response.status_code == 200
    second = TestClient(app_factory())
    assert second.get("/api/v1/me/season-membership", headers=MEMBER).json()["fandom_id"] == "f1"
```

- [ ] **Step 2: Run and observe the missing repository behavior**

Run: `python -m pytest tests/e2e/test_membership_persistence.py -v`  
Expected: FAIL because membership is not persisted.

- [ ] **Step 3: Implement repository and real route responses**

```python
@router.put("/api/v1/me/season-membership")
def select_membership(body: SelectFandomBody, principal=Depends(require_member),
                      repo=Depends(membership_repository)):
    membership = repo.select(principal.subject_id, current_season_id(), body.fandom_id)
    return MembershipResponse.model_validate(membership)
```

- [ ] **Step 4: Run targeted, API, and full suites**

Run: `python -m pytest tests/e2e/test_membership_persistence.py tests/api -v`  
Expected: PASS.  
Run: `python -m unittest discover -s tests -v`  
Expected: all legacy tests PASS.

- [ ] **Step 5: Commit the persistent vertical slice**

```bash
git add src/ktown_defense/infrastructure/repositories src/ktown_defense/api tests/e2e/test_membership_persistence.py
git commit -m "feat: persist season membership through HTTP"
```

## Plan Completion Gate

- [ ] `alembic upgrade head` succeeds on a clean PostgreSQL/PostGIS database.
- [ ] `docker compose up -d --wait` provisions healthy PostgreSQL/PostGIS and private object storage from a clean checkout and `.env.example` template.
- [ ] Health and membership routes run through FastAPI.
- [ ] Membership survives application restart.
- [ ] Private photos have no public URL and no EXIF.
- [ ] Duplicate or crashed outbox processing creates one effect.
- [ ] Retry timestamps are exactly 1s, 5s, 30s, 2m, and 5m from the first failure, and only exhausted work enters DLQ.
- [ ] Existing 102 domain tests and all new foundation tests pass.
