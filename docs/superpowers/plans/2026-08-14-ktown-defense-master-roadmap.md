# KTown Defense Productization Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current in-memory Python domain prototype into a map-first mobile tourism game where K-POP fandoms explore population-decline regions and compete through verified visits.

**Architecture:** Build a modular monolith around the existing domain rules, backed by FastAPI and PostgreSQL/PostGIS, with a Next.js PWA and a PostgreSQL transactional outbox worker. Deliver one independently testable vertical capability per plan and do not begin a dependent plan before its input gate passes.

**Tech Stack:** Python 3.13, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL/PostGIS, S3-compatible private storage, Next.js App Router, TypeScript, Kakao Maps adapter, Server-Sent Events, OpenTelemetry

## Global Constraints

- Preserve all 102 passing domain tests and their current boundary behavior.
- Public tourism places must belong to an approved target region, have valid rights, and have an approved mission.
- Every fandom may contest every published place; artist linkage is optional themed evidence.
- Fandom themes may change copy and visuals, never GPS, dwell, photo, score, or capture rules.
- First approved user/place/season visit awards 100 territory points; repeats award zero.
- Strongholds use 300, 1,000, and 2,000 point levels and the exact 110% capture boundary.
- Recommendations affect discovery order only and never territory points.
- Raw GPS and photos remain private, are stripped of EXIF, and follow retention deletion.
- Production point adjustment and season finalization require two distinct operators.
- The implementation assumes a Git repository exists before execution; complete the preflight gate below before any plan task or commit step.

---

## Execution Preflight Gate

- [ ] Move `travel_data_aws_key.pem` and `travel_data_aws_key.ppk` outside the workspace; if either key has been shared or committed elsewhere, rotate it before use.
- [ ] Create `.gitignore` entries for `.env`, `*.pem`, `*.ppk`, Python caches, test artifacts, `node_modules`, and Next.js build output before running `git init`.
- [ ] Initialize Git and confirm `git status --short` lists no credentials or generated caches.
- [ ] Run `python -m unittest discover -s tests -v` and record the 102-test baseline before Plan 1; Plan 1 Task 1 then creates and verifies the reproducible service stack.

---

## Plan Order and Gates

| Order | Plan | Starts when | Completion gate |
|---:|---|---|---|
| 1 | [Backend productization](./2026-08-14-01-backend-productization.md) | Immediately | Persistent HTTP vertical slice survives restart and duplicate delivery |
| 2 | [Tourism catalog and approval](./2026-08-14-02-tourism-catalog-approval.md) | Plan 1 migrations and API dependencies pass | Approved, non-public target-region places persist and sync incrementally |
| 3 | [Missions and recommendations](./2026-08-14-03-missions-recommendations.md) | Plan 2 approved-place interface is stable | Approved missions publish eligible places and deterministic recommendation API passes |
| 4 | [Check-in vertical flow](./2026-08-14-04-checkin-vertical-flow.md) | Plans 1 and 3 APIs pass | Mobile-facing check-in produces exactly one approval outbox event |
| 5 | [Territory, leagues, seasons, and operations](./2026-08-14-05-territory-leagues-seasons.md) | Plan 4 approval event contract is stable | Projections replay and all governance, DLQ, point-adjustment, and season-finalization contracts pass |
| 6 | [Mobile map and admin web](./2026-08-14-06-mobile-map-admin-web.md) | Plans 2-5 HTTP contracts pass, including operations APIs | Browser E2E completes fandom→map→mission→capture and admin approval |
| 7 | [Analytics and pilot operations](./2026-08-14-07-analytics-pilot.md) | Plan 6 E2E passes | KPI, privacy, SLO, fault, and eight-week pilot gates are executable |

## Execution Rules

- [ ] Execute plans strictly in order; do not start Plan 4 until the Plan 3 mission publication and recommendation API completion gate passes.
- [ ] Run `python -m unittest discover -s tests -v` after every backend task.
- [ ] Run the plan-specific targeted test before the full suite.
- [ ] Run `python -m pytest tests/api/test_write_contract_routes.py -v` after every task that adds or changes an HTTP write route.
- [ ] Keep migrations forward-only and pair every schema change with a repository integration test.
- [ ] Commit only one independently reviewable behavior per commit.
- [ ] Stop at each plan completion gate for product and code review.

## Write API Contract Ownership

`ktown-defense.contracts.yaml` is authoritative. A route cannot be consumed by a later plan until its owner plan has an exact method/path contract test passing.

| Exact method and path | Owner plan |
|---|---:|
| `PUT /api/v1/me/season-membership` | 1 |
| `POST /api/v1/checkin-sessions` | 4 |
| `POST /api/v1/checkin-sessions/{id}/gps-samples` | 4 |
| `POST /api/v1/checkin-sessions/{id}/photo` | 4 |
| `POST /api/v1/checkin-sessions/{id}/submit` | 4 |
| `POST /api/v1/checkins/{id}/appeals` | 4 |
| `PATCH /api/v1/admin/review-tasks/{id}` | 4 |
| `POST /api/v1/admin/places` | 2 |
| `PATCH /api/v1/admin/places/{id}` | 2 |
| `POST /api/v1/admin/catalog-sync-runs` | 2 |
| `POST /api/v1/admin/place-candidates/{id}/approve` | 2 |
| `POST /api/v1/admin/dual-approvals` | 5 |
| `POST /api/v1/admin/dual-approvals/{id}/approve` | 5 |
| `POST /api/v1/admin/point-adjustments` | 5 |
| `POST /api/v1/admin/dlq/{id}/retry` | 5 |
| `POST /api/v1/admin/seasons/{id}/finalize` | 5 |

The contract test fails if a declared route has no validation schema, if an implemented method/path differs from this table, or if a later plan attempts to consume a route before its owner completion gate passes.

## Final Product Gate

- [ ] Operator imports and approves 20-50 places in one target region.
- [ ] Operator approves a versioned mission for every published place.
- [ ] User selects a fandom and discovers a place on the mobile map.
- [ ] Recommendation API explains why an unvisited or low-exposure place is shown.
- [ ] User completes GPS, dwell, and camera evidence in a mobile browser.
- [ ] Approval creates exactly one ledger effect and updates a regional stronghold.
- [ ] Regional and national standings survive replay, reversal, and restart.
- [ ] Rights revocation immediately removes public and check-in eligibility.
- [ ] Admin can review check-ins, retry DLQ work, audit access, and finalize a season.
- [ ] Analytics reports unique visitors, unique places, region breadth, low-exposure lift, concentration, and safety guardrails without exposing raw GPS.
