# Missions and Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate safe, versioned place missions from approved tourism facts and rank eligible places with deterministic, explainable exploration recommendations.

**Architecture:** Use deterministic templates rather than free-form generation. Separate immutable verification rules from fandom presentation, require operator approval, and calculate recommendations with hard filters followed by a fixed 100-point score.

**Tech Stack:** Python 3.13, FastAPI, SQLAlchemy 2, PostgreSQL/PostGIS, Alembic, pytest

## Global Constraints

- Mission generation never invents tourism facts or photo targets.
- Every published check-in mission has a version and an approving operator.
- Fandom themes cannot alter radius, dwell, evidence, verification, points, or capture rules.
- Recommendation weights are exactly 25/20/15/15/10/5/5/5.
- Recommendation scores never alter territory points.
- Execution assumes Git has been initialized before commit steps.

---

## File Map

```text
src/ktown_defense/missions.py
src/ktown_defense/mission_generation.py
src/ktown_defense/recommendations.py
src/ktown_defense/infrastructure/models/missions.py
src/ktown_defense/infrastructure/repositories/missions.py
src/ktown_defense/api/mission_routes.py
src/ktown_defense/api/admin_mission_routes.py
src/ktown_defense/api/recommendation_routes.py
tests/test_mission_generation.py
tests/test_mission_approval.py
tests/test_recommendations.py
tests/api/test_mission_recommendation_routes.py
```

### Task 1: Mission Template and Draft Generation

**Files:**
- Create: `src/ktown_defense/missions.py`
- Create: `src/ktown_defense/mission_generation.py`
- Test: `tests/test_mission_generation.py`

**Interfaces:**
- Produces: `MissionTemplate`
- Produces: `PlaceMissionDraft`
- Produces: `MissionGenerator.generate(place: PlaceFacts, template: MissionTemplate) -> PlaceMissionDraft`

- [ ] **Step 1: Write deterministic shopping-place tests**

```python
def test_market_draft_uses_only_approved_place_facts():
    draft = generator.generate(MARKET_FACTS, MARKET_TEMPLATE)
    assert draft.title_ko == "정선아리랑시장 현장 방문"
    assert draft.radius_m == 100
    assert draft.dwell_seconds == 300
    assert draft.photo_target_ko == "시장 입구의 공식 명칭 표지판"
```

- [ ] **Step 2: Run and confirm mission types are absent**

Run: `python -m pytest tests/test_mission_generation.py -v`  
Expected: FAIL with missing mission module.

- [ ] **Step 3: Implement strict template rendering**

```python
class MissionGenerator:
    def generate(self, place: PlaceFacts, template: MissionTemplate) -> PlaceMissionDraft:
        if template.content_type_id != place.content_type_id:
            raise MissionError("TEMPLATE_CONTENT_TYPE_MISMATCH")
        return PlaceMissionDraft(
            place_id=place.place_id,
            title_ko=template.title_template_ko.format(place_name=place.name_ko),
            instruction_ko=template.instruction_template_ko.format(place_name=place.name_ko),
            photo_target_ko=template.photo_target_ko,
            radius_m=template.default_radius_m,
            dwell_seconds=template.default_dwell_seconds,
        )
```

- [ ] **Step 4: Run generation tests**

Run: `python -m pytest tests/test_mission_generation.py -v`  
Expected: PASS for valid templates and explicit failures for missing facts.

- [ ] **Step 5: Commit deterministic mission generation**

```bash
git add src/ktown_defense/missions.py src/ktown_defense/mission_generation.py tests/test_mission_generation.py
git commit -m "feat: generate deterministic tourism missions"
```

### Task 2: Persistent Versioning and Approval

**Files:**
- Create: `src/ktown_defense/infrastructure/models/missions.py`
- Create: `src/ktown_defense/infrastructure/repositories/missions.py`
- Create: `alembic/versions/20260814_05_missions.py`
- Modify: `src/ktown_defense/catalog.py`
- Test: `tests/test_mission_approval.py`

**Interfaces:**
- Produces: `MissionApprovalService.approve(mission_id, operator_id) -> PlaceMission`
- Produces: `MissionRepository.current_approved(place_id, at) -> PlaceMission | None`

- [ ] **Step 1: Write version immutability and dangerous-change tests**

```python
def test_radius_change_creates_new_review_required_version(service, approved_mission):
    revised = service.revise(approved_mission.id, radius_m=150)
    assert revised.version == approved_mission.version + 1
    assert revised.status == "review_required"
    assert approved_mission.status == "approved"

def test_first_default_mission_publishes_eligible_approved_place(service, approved_place, mission_draft):
    mission = service.approve(mission_draft.id, "operator-2")
    place = service.places.get(approved_place.id)
    assert mission.status == "approved"
    assert place.status == "published"
    assert place.public_visible is True
    assert place.checkin_enabled is True
```

- [ ] **Step 2: Run and confirm persistence is missing**

Run: `python -m pytest tests/test_mission_approval.py -v`  
Expected: FAIL because mission repository is absent.

- [ ] **Step 3: Implement version and approval constraints**

```python
__table_args__ = (
    UniqueConstraint("place_id", "version"),
    CheckConstraint("radius_m BETWEEN 50 AND 200"),
    CheckConstraint("dwell_seconds >= 300"),
)
```

Approval writes `approved_by`, `approved_at`, and an immutable change-log entry. Activating the first approved default mission performs the sole `approved → published` transition and sets `public_visible=True` and `checkin_enabled=True` only if target-region, rights, catalog freshness, source, and safety gates remain valid. Suspension or loss of any gate clears public and check-in eligibility without deleting the approved place or mission history.

- [ ] **Step 4: Apply migration and run approval tests**

Run: `python -m alembic upgrade head`  
Expected: mission tables created.  
Run: `python -m pytest tests/test_mission_approval.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit mission approval persistence**

```bash
git add src/ktown_defense/infrastructure/models/missions.py src/ktown_defense/infrastructure/repositories/missions.py src/ktown_defense/catalog.py alembic tests/test_mission_approval.py
git commit -m "feat: version and approve place missions"
```

### Task 3: Fandom Theme Invariants

**Files:**
- Modify: `src/ktown_defense/missions.py`
- Modify: `src/ktown_defense/infrastructure/models/missions.py`
- Test: `tests/test_fandom_mission_themes.py`

**Interfaces:**
- Produces: `FandomMissionTheme`
- Produces: `MissionPresenter.present(mission, fandom_id) -> PresentedMission`

- [ ] **Step 1: Write copy-only theme tests**

```python
def test_theme_changes_copy_but_not_verification_rules(presenter, mission):
    shown = presenter.present(mission, "fandom-a")
    assert shown.success_message_ko == "팬덤 A가 이 지역에 힘을 보탰어요!"
    assert shown.radius_m == mission.radius_m
    assert shown.dwell_seconds == mission.dwell_seconds
    assert shown.photo_target_ko == mission.photo_target_ko
```

- [ ] **Step 2: Run and confirm presenter is missing**

Run: `python -m pytest tests/test_fandom_mission_themes.py -v`  
Expected: FAIL with missing presenter.

- [ ] **Step 3: Implement a presentation-only merge**

```python
return PresentedMission(
    mission_id=mission.id,
    version=mission.version,
    title_ko=theme.title_ko if theme else mission.title_ko,
    success_message_ko=theme.success_message_ko if theme else DEFAULT_SUCCESS,
    radius_m=mission.radius_m,
    dwell_seconds=mission.dwell_seconds,
    photo_target_ko=mission.photo_target_ko,
)
```

- [ ] **Step 4: Run theme and mission tests**

Run: `python -m pytest tests/test_fandom_mission_themes.py tests/test_mission_approval.py -v`  
Expected: PASS.

- [ ] **Step 5: Commit fandom presentation themes**

```bash
git add src/ktown_defense/missions.py src/ktown_defense/infrastructure/models/missions.py tests/test_fandom_mission_themes.py
git commit -m "feat: add fair fandom mission themes"
```

### Task 4: Recommendation Hard Filters and Scoring

**Files:**
- Create: `src/ktown_defense/recommendations.py`
- Test: `tests/test_recommendations.py`

**Interfaces:**
- Produces: `RecommendationContext`
- Produces: `RecommendationService.rank(candidates, context) -> tuple[Recommendation, ...]`

- [ ] **Step 1: Write exact weight and filter tests**

```python
def test_full_candidate_scores_one_hundred(service):
    result = service.rank([FULL_MATCH], CONTEXT)[0]
    assert result.score == 100
    assert len(result.reasons) == 2

def test_expired_snapshot_is_filtered(service):
    assert service.rank([replace(FULL_MATCH, snapshot_age_hours=24.0001)], CONTEXT) == ()
```

- [ ] **Step 2: Run and confirm recommendation service is missing**

Run: `python -m pytest tests/test_recommendations.py -v`  
Expected: FAIL with missing module.

- [ ] **Step 3: Implement fixed component weights**

```python
WEIGHTS = {
    "proximity": 25, "unvisited_place": 20, "new_region": 15,
    "low_exposure": 15, "territory_relevance": 10,
    "opening": 5, "fandom_theme": 5, "quality": 5,
}
```

Apply hard filters before score calculation and order ties by distance, `place_id`. Select the two highest positive components as localized reasons.

- [ ] **Step 4: Run all recommendation boundaries**

Run: `python -m pytest tests/test_recommendations.py -v`  
Expected: PASS at 24-hour, distance, open-state, rights, and score tie boundaries.

- [ ] **Step 5: Commit explainable recommendation ranking**

```bash
git add src/ktown_defense/recommendations.py tests/test_recommendations.py
git commit -m "feat: rank explainable exploration recommendations"
```

### Task 5: Mission and Recommendation APIs

**Files:**
- Create: `src/ktown_defense/api/mission_routes.py`
- Create: `src/ktown_defense/api/admin_mission_routes.py`
- Create: `src/ktown_defense/api/recommendation_routes.py`
- Modify: `src/ktown_defense/api/main.py`
- Test: `tests/api/test_mission_recommendation_routes.py`

**Interfaces:**
- Produces: `GET /api/v1/places/{placeId}/mission`
- Produces: `GET /api/v1/recommendations`
- Produces: admin mission list, patch, and approve endpoints

- [ ] **Step 1: Write member and operator API tests**

```python
def test_recommendation_response_explains_order(member_client, seeded_places):
    body = member_client.get("/api/v1/recommendations?lat=37&lng=127").json()
    assert body["items"][0]["score"] >= body["items"][1]["score"]
    assert len(body["items"][0]["reasons"]) == 2
```

- [ ] **Step 2: Run and confirm endpoints return 404**

Run: `python -m pytest tests/api/test_mission_recommendation_routes.py -v`  
Expected: FAIL with missing endpoints.

- [ ] **Step 3: Implement thin route adapters**

```python
@router.get("/recommendations", response_model=RecommendationListResponse)
def recommendations(lat: float, lng: float, principal=Depends(require_member)):
    context = context_service.for_user(principal.subject_id, lat, lng)
    return recommendation_service.rank(place_repository.eligible(), context)
```

- [ ] **Step 4: Run API and full backend tests**

Run: `python -m pytest tests/api/test_mission_recommendation_routes.py tests/test_mission_generation.py tests/test_recommendations.py -v`  
Expected: PASS.  
Run: `python -m unittest discover -s tests -v`  
Expected: legacy suite PASS.

- [ ] **Step 5: Commit mission and recommendation APIs**

```bash
git add src/ktown_defense/api tests/api/test_mission_recommendation_routes.py
git commit -m "feat: expose missions and exploration recommendations"
```

## Plan Completion Gate

- [ ] Deterministic templates produce Korean mission drafts from approved facts.
- [ ] Dangerous changes create a new review-required version.
- [ ] Check-in eligibility requires an approved current mission.
- [ ] Only mission activation publishes an otherwise eligible approved place.
- [ ] Fandom themes cannot alter verification or scoring.
- [ ] Recommendations apply all hard filters before exact 100-point scoring.
- [ ] Recommendation responses contain two stable reasons.
