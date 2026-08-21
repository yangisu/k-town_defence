# K-Town Defense Live Busan Tourism and Check-In Design

## Goal

Turn the integrated MVP into a usable Busan-first product: import real Korean
Tourism Organization data into PostgreSQL, show those places in the existing
K-Town Defense web experience, and let a user submit real browser location and
photo evidence for durable review.

The first release covers Busan only. Region, content-type and result limits are
configuration so the same pipeline can expand nationwide without changing its
storage or public API contracts.

## Confirmed Product Decisions

- Reuse the existing web source from nested repository commit `21483e1`. The
  `ktown-defense-site.tar.gz` artifact is only its compiled output.
- Use the official Korean Tourism Information Service GW (`KorService2`).
- Import Busan with `areaBasedList2`, using KTO area code `6`, and enrich each
  row with `detailCommon2`.
- Cache imported data in PostgreSQL. Browser requests never call TourAPI
  directly.
- Cap the first import at 100 places to protect the development account's daily
  request allowance. The cap is configurable.
- Preserve the last good catalog when an upstream request or validation fails.
- Collect real browser geolocation and a real camera/gallery image. Do not
  claim a five-minute dwell check until the backend enforces one.
- Persist submissions as `pending`; this work does not approve visits or award
  points.
- Battle, leaderboard and journey data remain demo-only and must be labeled as
  such in integrated mode.

## Architecture

### Synchronization boundary

`KTourOpenAPIClient` gains a Busan area-list operation that returns transport
DTOs without touching the database. An async `KTourPlaceSyncService` validates
and maps those records, requests details with bounded concurrency, and commits
the complete snapshot in one PostgreSQL transaction.

The synchronizer upserts by KTO `contentId`. A successful complete run marks
previous KTO rows in the same area outside the new snapshot inactive. A failed
or incomplete run changes no place visibility. Operator-created and demo rows
are never deactivated by KTO synchronization.

A CLI is the initial operational entry point:

```powershell
python -m ktown_defense.sync_ktour --area-code 6 --limit 100
```

It exits nonzero on failure and prints only run identifiers and counts, never
the service key or upstream request URL. This boundary can later be invoked by
a scheduler without changing synchronization behavior.

### Database changes

Extend `places` with source information needed by users and future expansion:

- `source` (`KTOUR_API`, `operator`, or `demo`)
- `content_type_id`
- `category_code`
- `image_url`
- `source_modified_at`

Add `catalog_sync_runs` with source, area code, status, started/completed times,
counts, snapshot version and a sanitized error code. It must not store service
keys, complete upstream URLs or upstream bodies.

Photo evidence continues to use `checkin_photos`, but now the server derives
its size, MIME type and SHA-256 from uploaded bytes. Add an upload filename/key
that resolves below the configured private upload root.

### Public and check-in APIs

`GET /api/v1/places` accepts optional `regionCode`, `category`, `query`,
`limit` and `offset`. The response adds content type, category, image and sync
metadata while remaining compatible with current consumers. Place detail uses
the same DTO.

The photo endpoint becomes a multipart upload endpoint. It accepts one JPEG,
PNG or WebP file up to 10 MiB, validates filename-independent magic bytes,
computes SHA-256 server-side, stores it under a generated private key, and then
inserts metadata in PostgreSQL. If the database transaction fails, the newly
written file is removed. Files are never served by the public web root.

GPS continues through the existing JSON endpoint, but the web sends actual
`navigator.geolocation` readings with their browser timestamps. The MVP asks
for three samples and shows their accuracy. The backend still declares a
session ready when at least one valid GPS sample and one photo exist; requiring
three samples and dwell duration is a later policy migration.

## Web Experience

The existing K-Town visual system and responsive navigation remain intact.
Integrated mode changes the content layer:

1. 부산 is selected and labeled as live-data enabled.
2. A real-place section fetches PostgreSQL places, supports text search and
   content-type filters, and shows loading, empty and recoverable error states.
3. Place cards show the official Korean name, address, description, image when
   provided, and a check-in action.
4. Opening check-in asks for location permission, captures three readings, then
   accepts a camera/gallery image through a file input using
   `accept="image/jpeg,image/png,image/webp"` and `capture="environment"`.
5. The UI uploads the binary image, displays progress, permits retry after
   recoverable failures, and submits only after evidence is stored.
6. The result explicitly says DB submission is awaiting review and contains no
   invented points or approval.

Existing demo mode remains operational without FastAPI, PostgreSQL, permissions
or a KTour key.

## Security and Privacy

- `KTOUR_SERVICE_KEY`, database credentials and trusted identity headers remain
  server-only.
- The trusted gateway allowlists the multipart photo route but never forwards
  browser-provided identity, cookie or authorization headers.
- Upload names are generated by the server; client paths and traversal tokens
  are ignored.
- Validate request and response size before buffering where the runtime permits.
- Store photos outside tracked and public directories. `.gitignore` excludes the
  configured local upload root.
- Integrated UI tells users what location and image data is collected before
  requesting permission.
- No EXIF-removal claim is made in this release. The UI warns that the original
  image is uploaded for review; EXIF stripping and object-storage retention are
  required before public production launch.

## Failure Handling

- Missing or rejected KTour credentials: failed sync run, no place mutation.
- TourAPI timeout, malformed payload or zero validated rows: failed sync run,
  last good place snapshot remains visible.
- Individual detail failure: fail the complete run rather than publish a partial
  catalog.
- Duplicate content IDs: deterministic last-modified winner before upsert.
- Geolocation unavailable or denied: explain the browser setting and keep the
  session recoverable.
- Invalid or oversized photo: stable 4xx error and no file/row left behind.
- Network interruption: keep the current check-in session ID and allow retry.

## Testing Strategy

- Unit-test area-list pagination, query parameters, DTO validation and error
  sanitization with a fake transport.
- PostgreSQL integration-test successful upsert, repeat idempotency, removal
  deactivation, operator-row preservation and failed-run rollback.
- API-test search/filter pagination and real multipart image validation/storage.
- Web-test real place rendering, filters, permission errors, GPS payloads,
  multipart upload and pending result without points.
- Run a live smoke import using the existing ignored root `.env`, verify real
  Busan content IDs in PostgreSQL, and never print the key.
- Start both servers and use browser verification for the actual place-selection
  and permission-aware check-in path. Automated tests mock device permissions;
  final physical camera/location confirmation remains a user-device check.

## Release Boundary

This release is locally usable and production-shaped, but it is not a public
production launch. Public launch additionally requires durable private object
storage, EXIF stripping, retention/deletion jobs, production authentication,
HTTPS permission testing, monitoring and a scheduled sync runner.

