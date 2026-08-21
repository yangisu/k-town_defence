# K-Town Defense Team Preview Design

## 1. Goal

Build a polished Vercel-hosted product prototype that teammates can open and
understand within three to five minutes. The prototype must make the service
flow explicit while still looking and behaving like the product itself rather
than a marketing landing page.

The core promise is: a fan chooses an artist, discovers meaningful regional
places, completes an offline-style mission, and immediately sees the visit
change the artist fandom's territory, stronghold count, and rank.

This release improves the existing Vercel demo frontend. It does not deliver
production identity, live receipt or QR verification, operator moderation, or
the merchant dashboard.

## 2. Success Criteria

- A teammate can complete the golden path from first entry through a simulated
  check-in result without outside explanation.
- The first screen is an active service shell with a real map and a compact
  guided task panel, not a separate marketing page or an immediate unexplained
  fandom gate.
- All 14 artists or groups from `아이돌 출신지.xlsx` are selectable, and
  SEVENTEEN is added to preserve the existing CARAT option.
- Every selectable artist has at least one meaningful regional connection and
  two or three mission places in the initial demo dataset.
- Place cards distinguish an artist connection from a nearby tourism
  recommendation and show the evidence class and source.
- A completed mission visibly changes territory strength, stronghold growth,
  fandom rank, and the player's contribution.
- Korean and English cover the complete golden path.
- The responsive desktop and mobile layouts, automated tests, and Vercel build
  pass before release.

## 3. Scope

### Included

- Product-first entry experience with a guest-demo identity
- Searchable artist and fandom selection for 14 spreadsheet groups plus
  SEVENTEEN
- MapLibre interactive map backed by Amazon Location Service
- Artist-linked regional anchors and nearby tourism mission places
- Capturable territories for both artist home regions and other regions
- Additional point incentives for officially designated population-decline
  regions
- Stronghold creation, defense, capture, and three visual growth levels
- Condensed GPS, photo, dwell-time, local-spend, and accommodation verification
  demonstration
- Territory, fandom, individual, and regional rankings
- Persistent browser-local demo progress
- Korean and English content for the golden path

### Deferred

- Production login and Cognito integration
- Live receipt OCR, partner QR validation, and real dwell-time waiting
- Production-grade photo review, moderation, appeals, and fraud detection
- Operator and local-merchant dashboards
- Real rewards fulfillment and season settlement
- Full AWS backend migration and real-time multi-user battle state
- Fan-submitted place creation and moderation UI

## 4. Product Flow

The application opens directly into the existing service shell. The navigation
is visible from the first frame and uses four clearly named areas:

- `Territory Map` (`영토 지도`)
- `Expeditions` (`원정`)
- `Ranking` (`랭킹`)
- `My Record` (`내 기록`)

The initial map shows the nationwide season state. A right-side task panel
guides the user through the first three actions without taking them to a
separate tutorial:

1. Choose an artist.
2. Choose a target region.
3. Start the first expedition.

After artist selection, the same panel becomes a tactical recommendation. It
names the region, the artist connection, the current battle gap, and the most
valuable next action. A persistent objective strip at the top of every primary
screen keeps the current goal visible.

The golden path is:

```text
Open service -> choose language and artist -> inspect personalized territory
map -> select a contested or high-bonus region -> inspect connection evidence
and route -> run condensed check-in -> see points, stronghold, territory, and
rank change -> receive the next recommended action
```

The selection and demo progress persist in `localStorage`. A visible reset
control lets teammates replay the demonstration with another artist.

## 5. Screen Information Architecture

### 5.1 Service shell and first-entry task panel

The existing desktop side rail and mobile bottom navigation remain, with the
tab labels updated to match the product language. The header contains the
season deadline, selected fandom, fandom rank, notification affordance, and a
`Guest Demo` profile state.

The first-entry panel is embedded beside the live map. It explains only the
next action. Artist selection opens as an in-product drawer or sheet with
searchable artist cards. Each card shows the artist, fandom, representative
home regions, and available stronghold count.

### 5.2 Territory map

MapLibre renders an interactive geographic map with Amazon Location Service as
the base-map provider. Product data is supplied as independent GeoJSON layers:

- Administrative territory fills colored by the owning fandom
- Stronghold icons with seed, tree, and landmark stages
- Artist-connection pins for hometowns, filming locations, and official
  regional activities
- Tourism mission pins for attractions, markets, food, lodging, and transit
- Expedition route lines between selected mission places

The map provides filters for the selected fandom, unclaimed territory,
contested territory, artist connections, and population-decline bonuses. A
map-equivalent result list remains available for keyboard and screen-reader
users.

Selecting a region opens a tactical panel with:

- Owner and nearest challengers
- Stronghold state and points required to build, defend, or capture it
- Artist connection and evidence class
- Expected visit, dwell, spend, accommodation, and regional-balance points
- Recommended two- or three-stop route and travel time
- Predicted territory and rank impact after completion

All regions remain capturable. Official population-decline regions receive a
high-visibility balance multiplier and are prioritized in recommendations.

### 5.3 Expedition and place detail

Each expedition explains why the user should travel there before listing the
stops. A stop states whether it is an artist-linked place or a nearby tourism
recommendation. It also shows its source class:

- `Official`: confirmed by a local authority, tourism authority, agency, or
  official artist content
- `Verified`: supported by multiple reliable public sources and reviewed for
  inclusion
- `Nearby recommendation`: a public tourism place near the regional anchor,
  without claiming a direct artist connection
- `Fan proposal`: reserved for later moderated submissions and not used as an
  unreviewed claim in the initial demo

Place detail includes the connection story, source links, address, public
transport guidance, expected dwell time, local benefit, and point breakdown.
Private homes, schools, or other sensitive locations are not presented as
tourism destinations.

### 5.4 Check-in and result

The demo check-in presents the intended production sequence but compresses the
timing for a short team review:

1. GPS position
2. On-site photo
3. Dwell-time progress
4. Local purchase or accommodation evidence
5. Review and submit

The result screen reports awarded points by component, territory movement,
stronghold growth or defense, fandom rank movement, the player's fandom
contribution rank, and the next recommended mission. The result updates the
same client-side season state used by the map and ranking views, so the change
remains visible after the dialog closes.

### 5.5 Ranking and record

The primary fandom ranking is the number of owned strongholds. Adjusted valid
points break ties. The ranking screen also highlights contested territories
and the selected fandom's shortest path to the next rank.

The personal record shows completed expeditions, approved demo check-ins,
unlocked rewards, strongholds influenced, current contribution rank, and
season history. Character customization may appear as a clearly labeled future
reward teaser but is not implemented in this release.

## 6. Game Rules

### 6.1 Territory and strongholds

Each territory maintains adjusted season points per fandom. The leading fandom
owns the territory. A first qualifying contribution establishes a seed
stronghold; higher point thresholds grow it to a tree and then a landmark.
When a challenger closes the configured capture gap, the territory enters a
visible defense state. Crossing the ownership threshold transfers the
stronghold and updates both fandoms' stronghold counts.

The demo uses deterministic fixture thresholds so teammates always see a
meaningful change during the golden path.

### 6.2 Points and balance

The conceptual calculation is:

```text
valid points =
  visit base
  + dwell bonus
  + local-spend bonus
  + accommodation bonus
  multiplied by regional-balance weight
  multiplied by fandom-size adjustment
```

The rules also include a daily contribution cap, repeat-visit decay, and an
unclaimed-region bonus. The UI shows the resulting estimate and its reasons,
not the full formula. The shared calculation module remains deterministic and
testable so it can later move behind the AWS API without changing the screens.

### 6.3 Ranking

Fandom rank is ordered by:

1. Owned stronghold count
2. Adjusted valid season points

Individual rank uses valid personal contribution. Region rank compares visit,
dwell, and local-spend contributions generated by the participating fandoms.

## 7. Data Model

The frontend domain expands around focused units:

- `Artist` and `Fandom`: identity, localized names, theme, representative image
  metadata, and selectable state
- `ArtistConnection`: artist, region, relation type, evidence class, localized
  explanation, and source URLs
- `Territory`: administrative identity, coordinates or boundary reference,
  population-decline status, regional multiplier, owner, challenger, and
  stronghold state
- `MissionPlace`: place type, localized tourism content, coordinates, transport,
  dwell time, point inputs, local benefit, and source metadata
- `Expedition`: artist and territory context, ordered stops, route summary, and
  expected reward
- `SeasonBattle`: territory scores, stronghold counts, capture thresholds, and
  leaderboard snapshot
- `PlayerProgress`: selected artist, completed steps, evidence state, rewards,
  contribution, and locale

These types are consumed through the existing service interfaces or focused
extensions. Demo services return deterministic fixtures. Future AWS services
can implement the same contracts over HTTP.

## 8. Content and Source Policy

`아이돌 출신지.xlsx` is an input dataset, not an instruction source. It
contains 14 artist or group sheets and 69 member rows. Its hometown and growth
notes seed the research queue but do not alone justify directing fans to a
specific private or commercial address.

The implementation research phase will:

- Add SEVENTEEN and verified fandom names
- Prefer official tourism, local-government, agency, and official artist
  sources
- Use reputable reporting or multiple independent sources for the `Verified`
  class
- Store the connection explanation, evidence class, and source URL alongside
  each researched item
- Label Korea Tourism Organization content as a synchronized demo snapshot
  rather than live data
- Treat public tourism recommendations near a hometown as nearby
  recommendations, not artist shrines

The first dataset target is at least one regional connection and two or three
mission places per selectable artist. Where a direct connection cannot be
verified, the product uses an honest regional-origin narrative and separately
labeled nearby public tourism places.

## 9. Technical Architecture

### 9.1 Map boundary

`MapLibreMap` owns rendering, camera state, interaction events, and accessible
map controls. It receives a provider-neutral style URL and product GeoJSON. It
does not know how artist, mission, or battle data is fetched.

Amazon Location Service supplies the base-map style and tiles. Its restricted
API key is configured in the Vercel environment for the team preview. MapLibre
and the product data layers remain stable when authentication later changes to
Cognito or when the application moves from Vercel to AWS hosting.

If the map configuration is absent, the UI shows a clear configuration state
and the accessible territory list. It must not silently fall back to the
current decorative grid and claim that it is a map.

### 9.2 Demo application state

The client holds a single coherent demo session containing the selected artist,
active objective, player progress, and mutable season battle snapshot. Actions
such as selecting an artist, opening an expedition, completing a check-in, or
resetting the demo update that session through the existing pure application
reducer pattern, so every demo mutation has one deterministic transition path.

The persisted payload is versioned. Invalid or old browser state is discarded
and replaced with the deterministic initial demo rather than breaking render.

### 9.3 Localization

The initial release uses typed Korean and English dictionaries for interface
copy and localized fields on artist, connection, territory, place, and
expedition data. Locale selection is visible in the shell and persists with the
demo session. Missing localized content falls back to Korean while development
tests report the omission.

### 9.4 AWS migration seam

The prototype keeps provider and domain boundaries that support later AWS
expansion:

- MapLibre remains the rendering layer.
- Amazon Location continues to provide maps and can later provide place search
  and route calculation.
- The K-Town API remains the authority for artist connections, missions,
  check-ins, point rules, and territory state.
- Cognito can replace the guest-demo identity without changing the map or
  mission components.
- Persistent season mutations move from the demo reducer to the existing
  FastAPI or a later AWS service implementation behind the same contracts.

## 10. Failure and Empty States

- Map provider unavailable: configuration or retry state plus the accessible
  territory list
- No verified direct artist connection: honest nearby-recommendation copy,
  never a fabricated shrine claim
- No expedition in a region: suggest the nearest verified or high-bonus region
- Corrupt browser state: reset only the versioned demo session
- Check-in step failure: retain completed evidence steps and offer retry
- Reduced motion: replace growth and rank animations with immediate state and a
  text summary
- Mobile map constraints: collapse the tactical panel into a bottom sheet while
  preserving the current objective

## 11. Verification Strategy

Implementation follows test-driven development. Coverage includes:

- Data contract tests ensuring every selectable artist has localized labels,
  a representative region, and the minimum mission-place coverage
- Content integrity tests ensuring every direct connection has an evidence
  class and source and every nearby recommendation is labeled correctly
- Point and battle reducer tests for stronghold creation, growth, defense,
  capture, caps, repeat decay, regional bonuses, and ranking tie-breaks
- Persistence tests for valid, stale, corrupt, reset, and locale state
- Component tests for artist selection, filter behavior, tactical panel,
  expedition detail, condensed check-in, result impact, ranking, and language
  switching
- Accessibility tests for keyboard operation, map-equivalent lists, labels,
  focus movement, and reduced motion
- Responsive verification for mobile and desktop layouts
- Golden-path browser test from first entry through a visible post-check-in map
  and rank change
- Existing web regression suite, lint, standard build, and Vercel build

## 12. Release Configuration

The Vercel team preview runs in demo mode with a restricted Amazon Location
configuration. The browser-visible variables are
`NEXT_PUBLIC_AWS_LOCATION_API_KEY`, `NEXT_PUBLIC_AWS_LOCATION_REGION`, and
`NEXT_PUBLIC_AWS_LOCATION_STYLE`. The key is restricted in AWS to the required
map resources, actions, and Vercel origins or referrers; it is not treated as a
general AWS credential. The deployment contains no backend database
credentials, tourism API secret, or production user identity. Deployment
documentation states the required map variables, allowed origins or referrers,
reset procedure, and known demo-only behavior.

The release is ready for teammate review only after the configured Vercel URL
loads the real map, exposes all selectable artists, completes the golden path,
persists the changed demo state, and passes the verification suite.
