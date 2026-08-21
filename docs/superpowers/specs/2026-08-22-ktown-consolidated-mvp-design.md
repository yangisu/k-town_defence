# K-Town Defense Consolidated MVP Design

## Goal

Unify the independently completed membership web release with the live Busan
catalog and evidence-backed check-in MVP without losing either repository's
tested behavior.

## Baseline and ownership

`codex/consolidated-mvp` starts from `codex/integrated-mvp`. The standalone
`codex/ktown-membership-integration` web branch is a read-only implementation
source until all unique behavior is represented and tested in the monorepo.
The dirty main checkout, its nested `web` repository, documents, archive, and
root `.env` remain untouched.

## Architecture

FastAPI owns fandom discovery and the current user's season membership in the
same PostgreSQL database as places and check-ins. A trusted Sites subject is
accepted only through the server-side gateway header and resolved to a durable
user record. The first membership selection is persisted; selecting another
fandom after lock returns the stable `FANDOM_LOCKED` error.

The web app composes a membership provider and gate around the existing K-Town
application. After selection, the same application loads live Busan places and
submits real browser GPS and photo evidence. Demo mode stays usable without a
backend. Integrated mode uses one same-origin gateway whose explicit allowlist
contains only membership, place, and check-in contracts.

## Data model

- `users`: internal UUID and unique trusted platform subject.
- `fandoms`: UUID, Korean fandom name, optional Korean artist name, active flag.
- `seasons`: UUID, Korean name, active interval, exactly one current seeded MVP season.
- `season_memberships`: unique `(user_id, season_id)`, selected fandom, optional
  `locked_at`, and timestamps.

The initial migration seeds a small deterministic fandom catalog and one current
season. API selection is idempotent for the same fandom. A different selection
is rejected after the record exists; this MVP therefore locks on selection.

## HTTP contracts

- `GET /api/v1/fandoms` returns active fandoms.
- `GET /api/v1/me/season-membership` returns `null` or the current membership.
- `PUT /api/v1/me/season-membership` accepts `{ "fandomId": "<uuid>" }`.
- Membership routes require `x-ktown-user-id`; public place reads remain anonymous.
- Stable errors are `AUTHENTICATION_REQUIRED`, `FANDOM_NOT_FOUND`,
  `CURRENT_SEASON_NOT_CONFIGURED`, and `FANDOM_LOCKED`.

## Security and failure behavior

The browser never receives a backend origin or credential. The gateway strips
browser identity and emits `x-ktown-user-id` only from the platform-controlled
Sites header or the explicitly configured local development subject. Route,
method, query, content type, and body limits are fail-closed. Database writes
are transactional and constraint-backed.

## Verification

Each behavior is implemented test-first. Completion requires the original 102
domain tests, PostgreSQL migration/API/E2E tests, the combined web suite, lint,
production build, and a local HTTP flow covering membership selection, live
Busan place retrieval, and check-in creation.

## Deferred scope

Operator review, point-ledger application, EXIF removal, production Sites
binding deployment, and nationwide catalog scheduling remain follow-up work.
