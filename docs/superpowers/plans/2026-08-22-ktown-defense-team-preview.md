# K-Town Defense Team Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vercel-hosted, product-first K-Town Defense prototype in which a teammate selects one of 15 artists, explores a real territory map, completes a condensed regional mission, and sees the resulting stronghold and ranking change.

**Architecture:** Keep integrated mode and its existing backend contracts intact, while demo mode gains a versioned client-side preview session and source-backed content catalog. MapLibre renders Amazon Location Service plus product-owned GeoJSON layers; focused preview components consume pure selectors and reducers so a later AWS API can replace fixtures without replacing the UI.

**Tech Stack:** TypeScript 5.9, React 19, vinext/Vite, Vitest and Testing Library, MapLibre GL JS 5, Amazon Location Service, Vercel Nitro output

**Spec:** `docs/superpowers/specs/2026-08-22-ktown-defense-team-preview-design.md`

## Global Constraints

- Use Node.js `>=22.13.0`, matching `web/package.json`.
- Demo mode must open inside the service shell; do not add a marketing landing page.
- Preserve the existing integrated membership, live place, and evidence-submission flows.
- Include all 14 spreadsheet artists plus SEVENTEEN; the exact slug order is defined in Task 1.
- Every selectable artist needs at least one sourced regional connection and two mission places.
- Direct artist connections require an `official` or `verified` evidence class and at least one HTTPS source URL.
- Nearby tourism recommendations must be labeled `nearby_recommendation` and must not claim a direct artist relationship.
- Private homes, schools, and sensitive personal addresses are not mission places.
- All territories are capturable; officially designated population-decline territories receive a visible multiplier greater than `1`.
- Fandom rank is ordered by stronghold count, then adjusted valid season points.
- Korean and English must cover the complete golden path.
- Missing Amazon Location configuration must show a configuration state plus an accessible territory list, never the decorative grid map.
- Browser-visible Amazon Location credentials must be restricted to required map actions and Vercel origins or referrers.
- Do not add backend credentials, Korea Tourism API secrets, or production identity data to the browser bundle.
- Every implementation task follows red-green-refactor and ends in a focused commit.

## File Structure

### New focused units

- `web/features/team-preview/types.ts` — preview-only domain types and stable IDs.
- `web/features/team-preview/content.ts` — typed aggregation and content selectors.
- `web/features/team-preview/game-rules.ts` — point calculation, stronghold growth, capture, and ranking rules.
- `web/features/team-preview/demo-session.ts` — versioned state, actions, reducer, serialization, and reset.
- `web/features/team-preview/demo-session-context.tsx` — React provider and hooks around the pure session reducer.
- `web/features/team-preview/i18n.ts` — typed Korean and English interface dictionaries.
- `web/lib/demo-preview/artists.ts` — artist, fandom, and source-backed regional connection fixtures.
- `web/lib/demo-preview/territories.ts` — territory centroids, bonus metadata, standings, and GeoJSON IDs.
- `web/lib/demo-preview/missions.ts` — mission places and two- or three-stop expeditions.
- `web/lib/map-config.ts` — Amazon Location configuration validation and style URL creation.
- `web/components/team-preview/start-panel.tsx` — embedded onboarding and current tactical objective.
- `web/components/team-preview/artist-drawer.tsx` — searchable in-product artist selection.
- `web/components/team-preview/objective-strip.tsx` — persistent current objective and season state.
- `web/components/team-preview/territory-map.tsx` — MapLibre lifecycle and product GeoJSON layers.
- `web/components/team-preview/territory-list.tsx` — keyboard and screen-reader equivalent map list.
- `web/components/team-preview/territory-view.tsx` — map filters, map/list composition, and selected territory state.
- `web/components/team-preview/tactical-panel.tsx` — ownership, evidence, reward, and recommended-action details.
- `web/components/team-preview/expedition-view.tsx` — source-aware route and place detail for demo mode.
- `web/components/team-preview/ranking-view.tsx` — stronghold-first leaderboard and contested territories.
- `web/components/team-preview/record-view.tsx` — personal contribution and completed demo history.
- `web/public/data/preview-territories.geojson` — simplified administrative boundaries used by the preview.

### Existing files changed at integration seams

- `web/features/ktown-app.tsx` — select preview or integrated composition without duplicating the whole app.
- `web/features/app-controller.ts` — stable tab navigation and preview route state.
- `web/app/page.tsx` — read server environment and pass validated map configuration.
- `web/components/app-shell.tsx` — localized labels, guest profile, season summary, and locale control.
- `web/components/check-in/check-in-flow.tsx` — add condensed demo evidence and an approved-result callback.
- `web/components/check-in/check-in-reducer.ts` — track dwell, spend, and accommodation evidence in demo mode.
- `web/lib/domain.ts` — extend the existing check-in result only where integrated and demo views share data.
- `web/lib/demo-services.ts` — retain legacy service behavior while preview state owns demo battle mutations.
- `web/app/globals.css` — responsive preview layout, MapLibre canvas sizing, sheets, growth states, and reduced motion.
- `web/.env.example`, `web/README.md`, `web/tests/vercel-deployment.test.ts` — map configuration and deployment safety.

---

### Task 1: Source-Backed Preview Domain and Content Catalog

**Files:**
- Create: `web/features/team-preview/types.ts`
- Create: `web/features/team-preview/content.ts`
- Create: `web/lib/demo-preview/artists.ts`
- Create: `web/lib/demo-preview/territories.ts`
- Create: `web/lib/demo-preview/missions.ts`
- Create: `web/tests/demo-preview-content.test.ts`

**Interfaces:**
- Consumes: `아이돌 출신지.xlsx` as a research input only; existing `PlaceCategory` semantics from `web/lib/domain.ts`.
- Produces: `ArtistId`, `TerritoryId`, `MissionPlaceId`, `ArtistProfile`, `ArtistConnection`, `PreviewTerritory`, `PreviewMissionPlace`, `PreviewExpedition`, `previewContent`, `getArtistHomeTerritories()`, and `getExpeditionsForArtist()`.

- [ ] **Step 1: Write the failing artist and content coverage test**

```ts
import { describe, expect, it } from "vitest";
import { previewContent } from "@/features/team-preview/content";

const expectedArtists = [
  ["bts", "ARMY"],
  ["blackpink", "BLINK"],
  ["rescene", "REMINE"],
  ["cortis", "COER"],
  ["btob", "MELODY"],
  ["ive", "DIVE"],
  ["kiiikiii", "TiiiKiii"],
  ["riize", "BRIIZE"],
  ["zerobaseone", "ZEROSE"],
  ["boynextdoor", "ONEDOOR"],
  ["le-sserafim", "FEARNOT"],
  ["aespa", "MY"],
  ["newjeans", "Bunnies"],
  ["iu", "UAENA"],
  ["seventeen", "CARAT"],
] as const;

describe("team preview content", () => {
  it("covers every approved artist and fandom in stable order", () => {
    expect(previewContent.artists.map(({ id, fandomName }) => [id, fandomName]))
      .toEqual(expectedArtists);
  });

  it("gives every artist a sourced connection and a playable expedition", () => {
    for (const artist of previewContent.artists) {
      const connections = previewContent.connections.filter((item) => item.artistId === artist.id);
      const expeditions = previewContent.expeditions.filter((item) => item.artistId === artist.id);
      expect(connections.length, artist.id).toBeGreaterThanOrEqual(1);
      expect(connections.every((item) => item.sourceUrls.length > 0)).toBe(true);
      expect(connections.flatMap((item) => item.sourceUrls).every((url) => url.startsWith("https://"))).toBe(true);
      expect(expeditions.length, artist.id).toBeGreaterThanOrEqual(1);
      expect(expeditions[0].stopIds.length, artist.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("labels direct connections and nearby recommendations honestly", () => {
    for (const connection of previewContent.connections) {
      expect(["official", "verified"]).toContain(connection.evidenceClass);
    }
    for (const place of previewContent.places) {
      if (place.relationship === "nearby_recommendation") {
        expect(place.artistConnectionId).toBeNull();
      }
    }
  });
});
```

- [ ] **Step 2: Run the content test and verify the missing module failure**

Run: `cd web && npm test -- demo-preview-content.test.ts`

Expected: FAIL because `@/features/team-preview/content` does not exist.

- [ ] **Step 3: Define the preview domain with explicit localized and evidence fields**

```ts
export type Locale = "ko" | "en";
export type LocalizedText = Record<Locale, string>;
export type TerritoryId = string;
export type MissionPlaceId = string;
export type ArtistId =
  | "bts" | "blackpink" | "rescene" | "cortis" | "btob"
  | "ive" | "kiiikiii" | "riize" | "zerobaseone"
  | "boynextdoor" | "le-sserafim" | "aespa" | "newjeans"
  | "iu" | "seventeen";
export type EvidenceClass = "official" | "verified";
export type PlaceRelationship = "artist_connection" | "nearby_recommendation";
export type StrongholdStage = "seed" | "tree" | "landmark";

export interface ArtistProfile {
  id: ArtistId;
  artistName: LocalizedText;
  fandomName: string;
  color: string;
  representativeTerritoryIds: TerritoryId[];
}

export interface ArtistConnection {
  id: string;
  artistId: ArtistId;
  territoryId: TerritoryId;
  memberName: LocalizedText;
  relationType: "birthplace" | "hometown" | "filming" | "official_activity";
  evidenceClass: EvidenceClass;
  story: LocalizedText;
  sourceUrls: string[];
}
```

Add equally explicit types for territories, places, expeditions, standings,
and localized transport information. Use `null`, not omitted fields, when a
nearby recommendation has no artist connection.

- [ ] **Step 4: Build the content fixtures from the approved research rules**

Create the 15 artist rows in the exact test order. Seed representative regional
connections from the workbook, add SEVENTEEN from authoritative public sources,
and store real source URLs on every connection. Use official tourism or local
government pages for mission places. Share public mission places between
artists when their expeditions use the same region rather than duplicating
place records.

Required representative research queue:

```text
BTS: 부산·대구·광주
BLACKPINK: 군포·성남
RESCENE: 거제·수원·경주
CORTIS: 대전·수원·서울
BTOB: 용인·수원·고양
IVE: 대전·인천·제주
KiiiKiii: 부산·서울
RIIZE: 울산·시흥·서울
ZEROBASEONE: 천안·포항·원주
BOYNEXTDOOR: 원주·광주·부산·수원
LE SSERAFIM: 서울
aespa: 수원·부산
NewJeans: 춘천·인천·서울
IU: 서울·의정부
SEVENTEEN: 공식 출신지 자료로 대표 지역 확정
```

For population-decline flags and multipliers, record the official government
designation source in `PreviewTerritory.sourceUrls`. Set ordinary regions to
`balanceMultiplier: 1` and designated regions to `1.8` for the deterministic
preview.

- [ ] **Step 5: Add aggregation and selector functions**

```ts
export const previewContent = {
  artists,
  connections,
  territories,
  places,
  expeditions,
} as const;

export function getArtistHomeTerritories(artistId: ArtistId) {
  const ids = new Set(connections.filter((item) => item.artistId === artistId).map((item) => item.territoryId));
  return territories.filter((item) => ids.has(item.id));
}

export function getExpeditionsForArtist(artistId: ArtistId) {
  return expeditions.filter((item) => item.artistId === artistId);
}
```

- [ ] **Step 6: Run content tests and the existing demo service tests**

Run: `cd web && npm test -- demo-preview-content.test.ts demo-services.test.ts service-factory.test.ts`

Expected: PASS; existing demo service contracts remain unchanged.

- [ ] **Step 7: Commit the domain and content catalog**

```bash
git add web/features/team-preview web/lib/demo-preview web/tests/demo-preview-content.test.ts
git commit -m "feat(web): add sourced team preview content"
```

### Task 2: Deterministic Game Rules and Versioned Demo Session

**Files:**
- Create: `web/features/team-preview/game-rules.ts`
- Create: `web/features/team-preview/demo-session.ts`
- Create: `web/features/team-preview/demo-session-context.tsx`
- Create: `web/tests/team-preview-game-rules.test.ts`
- Create: `web/tests/team-preview-session.test.ts`

**Interfaces:**
- Consumes: `ArtistId`, `PreviewTerritory`, `PreviewMissionPlace`, and `StrongholdStage` from Task 1.
- Produces: `calculateMissionAward(input): MissionAward`, `applyMissionImpact(state, missionId, award): DemoSession`, `rankFandoms(standings): RankedFandom[]`, `demoSessionReducer`, `loadDemoSession(storage)`, `saveDemoSession(storage, state)`, `DemoSessionProvider`, and `useDemoSession()`.

- [ ] **Step 1: Write failing point, ranking, and session tests**

```ts
import { describe, expect, it } from "vitest";
import { calculateMissionAward, rankFandoms } from "@/features/team-preview/game-rules";

describe("preview game rules", () => {
  it("rewards longer local impact and the population-decline multiplier", () => {
    const award = calculateMissionAward({
      visitBase: 100,
      dwellMinutes: 45,
      localSpendVerified: true,
      accommodationVerified: false,
      balanceMultiplier: 1.8,
      fandomSizeMultiplier: 1,
      repeatCount: 0,
      contributedToday: 0,
    });
    expect(award).toEqual({
      visit: 100,
      dwell: 60,
      localSpend: 100,
      accommodation: 0,
      subtotal: 260,
      multiplier: 1.8,
      validPoints: 468,
      cappedPoints: 468,
    });
  });

  it("ranks by strongholds before points", () => {
    const ranked = rankFandoms([
      { fandomName: "ARMY", strongholds: 3, validPoints: 9000 },
      { fandomName: "BLINK", strongholds: 4, validPoints: 6000 },
    ]);
    expect(ranked.map((item) => item.fandomName)).toEqual(["BLINK", "ARMY"]);
  });
});
```

Add session tests for artist selection, locale change, mission completion,
stronghold growth, persistence version mismatch, corrupt JSON, and reset.
Add rule tests proving the second visit receives `0.5` repeat efficiency, a
fourth repeat receives `0`, the `1200` daily cap cannot be exceeded, fandom-size
multipliers are applied, seed/tree/landmark thresholds are exact, and ownership
transfers only after a challenger becomes the strict leader.

- [ ] **Step 2: Run the focused tests and verify missing module failures**

Run: `cd web && npm test -- team-preview-game-rules.test.ts team-preview-session.test.ts`

Expected: FAIL because both modules are absent.

- [ ] **Step 3: Implement the exact preview scoring rules**

Use these constants in `game-rules.ts`:

```ts
export const GAME_RULES = {
  dwell30Minutes: 30,
  dwell60Minutes: 60,
  localSpend: 100,
  accommodation: 300,
  dailyCap: 1200,
  repeatDecay: [1, 0.5, 0.25, 0] as const,
  strongholdTreeAt: 1000,
  strongholdLandmarkAt: 3000,
} as const;
```

Award `30` dwell points at 20 minutes, `60` at 40 minutes, and no further
dwell increment in the preview. Apply repeat decay before the daily cap. Round
the multiplied subtotal to the nearest integer.

- [ ] **Step 4: Implement stronghold and rank transitions as pure functions**

```ts
export function stageForPoints(points: number): StrongholdStage {
  if (points >= GAME_RULES.strongholdLandmarkAt) return "landmark";
  if (points >= GAME_RULES.strongholdTreeAt) return "tree";
  return "seed";
}

export function rankFandoms(rows: FandomStanding[]) {
  return [...rows]
    .sort((a, b) => b.strongholds - a.strongholds || b.validPoints - a.validPoints)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
```

Ownership transfers only when the challenger total is strictly greater than
the current owner total. Recompute stronghold counts from owned territories
after every mission impact; do not increment a cached count independently.

- [ ] **Step 5: Implement a versioned reducer and guarded storage**

```ts
export const DEMO_SESSION_VERSION = 1;
export const DEMO_SESSION_KEY = "ktown-team-preview-v1";

export type DemoSessionAction =
  | { type: "selectArtist"; artistId: ArtistId }
  | { type: "selectTerritory"; territoryId: TerritoryId }
  | { type: "setLocale"; locale: Locale }
  | { type: "completeMission"; missionId: string; award: MissionAward }
  | { type: "reset" };

export function loadDemoSession(storage: Pick<Storage, "getItem">): DemoSession {
  try {
    const raw = storage.getItem(DEMO_SESSION_KEY);
    if (!raw) return createInitialDemoSession();
    const parsed = JSON.parse(raw) as DemoSession;
    return parsed.version === DEMO_SESSION_VERSION ? parsed : createInitialDemoSession();
  } catch {
    return createInitialDemoSession();
  }
}
```

The React provider loads only after mount, persists every settled state, and
exposes `state`, `dispatch`, `selectedArtist`, `selectedTerritory`, and `reset`.

- [ ] **Step 6: Run focused and reducer regression tests**

Run: `cd web && npm test -- team-preview-game-rules.test.ts team-preview-session.test.ts app-controller.test.ts check-in-reducer.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the game and session core**

```bash
git add web/features/team-preview web/tests/team-preview-game-rules.test.ts web/tests/team-preview-session.test.ts
git commit -m "feat(web): add deterministic preview game session"
```

### Task 3: Product-First Shell, Localization, and Embedded Artist Selection

**Files:**
- Create: `web/features/team-preview/i18n.ts`
- Create: `web/components/team-preview/objective-strip.tsx`
- Create: `web/components/team-preview/start-panel.tsx`
- Create: `web/components/team-preview/artist-drawer.tsx`
- Modify: `web/features/ktown-app.tsx`
- Modify: `web/components/app-shell.tsx`
- Modify: `web/features/app-controller.ts`
- Test: `web/tests/team-preview-entry.test.tsx`
- Test: `web/tests/team-preview-i18n.test.ts`

**Interfaces:**
- Consumes: `DemoSessionProvider`, `useDemoSession()`, `previewContent`, `Locale`, and existing `AppTab`.
- Produces: `t(locale, key)`, `ObjectiveStrip`, `StartPanel`, `ArtistDrawer`, and a demo-mode app composition that bypasses only the full-screen `MembershipGate`.

- [ ] **Step 1: Write a failing first-entry service test**

```tsx
it("opens in the product shell and guides artist selection beside the service", async () => {
  const user = userEvent.setup();
  render(<KTownApp mode="demo" mapConfig={null} />);

  expect(await screen.findByRole("navigation", { name: "주요 메뉴" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "영토 지도" })).toBeVisible();
  expect(screen.getByText("게스트 데모")).toBeVisible();
  expect(screen.getByText("1. 아티스트 선택")).toBeVisible();
  expect(screen.queryByRole("heading", { name: /함께 여행할 팬덤/ })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "아티스트 선택" }));
  expect(screen.getByRole("dialog", { name: "아티스트 선택" })).toBeVisible();
  expect(screen.getAllByRole("radio")).toHaveLength(15);
});
```

Add a second test that searches for `aespa`, selects it, and verifies the task
panel changes to a real recommended region and the objective strip includes
`MY`.

- [ ] **Step 2: Write a failing translation completeness test**

```ts
import { copy } from "@/features/team-preview/i18n";

it("keeps Korean and English key sets identical", () => {
  expect(Object.keys(copy.en).sort()).toEqual(Object.keys(copy.ko).sort());
  expect(copy.ko.navTerritory).toBe("영토 지도");
  expect(copy.en.navTerritory).toBe("Territory Map");
});
```

- [ ] **Step 3: Run the entry and locale tests to verify failure**

Run: `cd web && npm test -- team-preview-entry.test.tsx team-preview-i18n.test.ts`

Expected: FAIL because the preview shell components and dictionaries are absent.

- [ ] **Step 4: Add the typed Korean and English interface catalog**

Include keys for navigation, guest state, season status, task steps, selection,
map states, evidence classes, reward breakdown, ranking, record, reset, loading,
retry, and configuration errors. Export a `t(locale, key)` function whose key
parameter is `keyof typeof copy.ko`.

- [ ] **Step 5: Make the app shell locale- and session-aware**

Change shell props to:

```ts
interface Props {
  activeTab: AppTab;
  locale: Locale;
  fandomName: string | null;
  rank: number | null;
  onLocaleChange(locale: Locale): void;
  onTabChange(tab: AppTab): void;
  children: ReactNode;
}
```

Keep tab IDs stable (`explore`, `expedition`, `battle`, `journey`) so integrated
mode and existing tests keep working. Change only displayed demo labels to
Territory Map, Expeditions, Ranking, and My Record. Add locale and guest-demo
controls to the shell header and mobile sheet.

- [ ] **Step 6: Compose the embedded task panel and artist drawer**

Render the real service shell immediately in demo mode. Keep `MembershipGate`
around integrated mode only. The drawer search filters both localized artist
names and fandom names. Selection dispatches `selectArtist`, closes the drawer,
and sets the first recommended territory from `getArtistHomeTerritories()`.

- [ ] **Step 7: Run entry, membership, and fan-journey regression tests**

Run: `cd web && npm test -- team-preview-entry.test.tsx team-preview-i18n.test.ts membership-flow.test.tsx fan-journey.test.tsx`

Expected: the new preview tests PASS. Update `fan-journey.test.tsx` only to use
the embedded artist drawer; the integrated `membership-flow.test.tsx` remains
unchanged and PASSes.

- [ ] **Step 8: Commit the product-first entry flow**

```bash
git add web/features web/components/app-shell.tsx web/components/team-preview web/tests/team-preview-entry.test.tsx web/tests/team-preview-i18n.test.ts web/tests/fan-journey.test.tsx
git commit -m "feat(web): guide preview users inside the service shell"
```

### Task 4: MapLibre and Amazon Location Map Boundary

**Files:**
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Create: `web/lib/map-config.ts`
- Create: `web/components/team-preview/territory-map.tsx`
- Create: `web/components/team-preview/territory-list.tsx`
- Create: `web/public/data/preview-territories.geojson`
- Create: `web/public/data/preview-territories.SOURCE.md`
- Modify: `web/app/page.tsx`
- Modify: `web/features/ktown-app.tsx`
- Test: `web/tests/map-config.test.ts`
- Test: `web/tests/territory-map.test.tsx`

**Interfaces:**
- Consumes: `PreviewTerritory`, `DemoSession`, and `NEXT_PUBLIC_AWS_LOCATION_API_KEY`, `NEXT_PUBLIC_AWS_LOCATION_REGION`, `NEXT_PUBLIC_AWS_LOCATION_STYLE`.
- Produces: `MapConfig`, `readMapConfig(env): MapConfig | null`, `amazonLocationStyleUrl(config): string`, `TerritoryMap`, and `TerritoryList`.

- [ ] **Step 1: Write failing map configuration tests**

```ts
import { expect, it } from "vitest";
import { amazonLocationStyleUrl, readMapConfig } from "@/lib/map-config";

it("builds a restricted Amazon Location style descriptor URL", () => {
  const config = readMapConfig({
    NEXT_PUBLIC_AWS_LOCATION_API_KEY: "test-map-key",
    NEXT_PUBLIC_AWS_LOCATION_REGION: "ap-northeast-2",
    NEXT_PUBLIC_AWS_LOCATION_STYLE: "Standard",
  });
  expect(config).not.toBeNull();
  expect(amazonLocationStyleUrl(config!)).toBe(
    "https://maps.geo.ap-northeast-2.amazonaws.com/v2/styles/Standard/descriptor?key=test-map-key",
  );
});

it("returns null when any required map value is missing", () => {
  expect(readMapConfig({ NEXT_PUBLIC_AWS_LOCATION_REGION: "ap-northeast-2" })).toBeNull();
});
```

- [ ] **Step 2: Write failing map behavior and accessible-list tests**

Test that configured render creates a container labeled `대한민국 팬덤 영토
지도`, clicking the equivalent list selects the same territory as a map event,
and missing configuration shows `지도를 연결하려면 Amazon Location 설정이
필요해요` while keeping every territory button operable.
Also simulate a map style load error and assert the configuration message,
retry action, attribution, and accessible territory list remain visible.

- [ ] **Step 3: Run tests and verify missing modules**

Run: `cd web && npm test -- map-config.test.ts territory-map.test.tsx`

Expected: FAIL because config and components do not exist.

- [ ] **Step 4: Install MapLibre GL JS**

Run: `cd web && npm install maplibre-gl@^5.24.0`

Expected: `package.json` and `package-lock.json` contain `maplibre-gl`; no other
dependency receives an unrelated version change.

- [ ] **Step 5: Add validated server-to-client map configuration**

`page.tsx` calls `readMapConfig(process.env)` and passes only the returned
`MapConfig` into `KTownApp`. Do not pass the entire environment object. The API
key is browser-visible by design and must be documented as a resource- and
referrer-restricted Amazon Location key.

- [ ] **Step 6: Add sourced territory GeoJSON**

Use a public administrative-boundary source whose license permits redistribution.
Extract and simplify only the preview territories, preserve valid Polygon or
MultiPolygon geometry, and key every feature with the exact `PreviewTerritory.id`.
Record source URL, license, retrieval date, simplification command, and included
feature IDs in `preview-territories.SOURCE.md`.

Add a test assertion that GeoJSON feature IDs and preview territory IDs are
identical sets.

- [ ] **Step 7: Implement MapLibre lifecycle and product layers**

Initialize MapLibre inside `useEffect`, import its CSS once, and remove the map
on unmount. Add sources for administrative GeoJSON, stronghold points, mission
points, and the selected expedition line. Add fill, outline, stronghold symbol,
and selected-state layers. Wire map clicks back to `onSelectTerritory(id)` and
use `flyTo` when selection comes from the accessible list.

Do not render the old `.map-grid`, region buttons with percentage positioning,
or a map watermark in demo mode.

- [ ] **Step 8: Run map, build, and integrated regression tests**

Run: `cd web && npm test -- map-config.test.ts territory-map.test.tsx live-places.test.tsx && npm run build`

Expected: PASS; production build emits MapLibre assets and integrated live-place
tests remain green.

- [ ] **Step 9: Commit the real map boundary**

```bash
git add web/package.json web/package-lock.json web/lib/map-config.ts web/components/team-preview/territory-map.tsx web/components/team-preview/territory-list.tsx web/public/data web/app/page.tsx web/features/ktown-app.tsx web/tests/map-config.test.ts web/tests/territory-map.test.tsx
git commit -m "feat(web): render fandom territories on Amazon Location"
```

### Task 5: Personalized Territory View and Tactical Panel

**Files:**
- Create: `web/components/team-preview/territory-view.tsx`
- Create: `web/components/team-preview/tactical-panel.tsx`
- Create: `web/components/team-preview/map-filters.tsx`
- Modify: `web/features/ktown-app.tsx`
- Modify: `web/features/app-controller.ts`
- Test: `web/tests/team-preview-territory.test.tsx`

**Interfaces:**
- Consumes: `TerritoryMap`, `TerritoryList`, `previewContent`, `useDemoSession()`, `getArtistHomeTerritories()`, and `getExpeditionsForArtist()`.
- Produces: `TerritoryView`, `TacticalPanel`, `TerritoryFilter`, and callbacks to open an expedition from the selected territory.

- [ ] **Step 1: Write the failing personalized territory test**

```tsx
it("turns artist choice into a visible tactical recommendation", async () => {
  renderPreviewWithArtist("bts");
  expect(await screen.findByText(/정국|지민/)).toBeVisible();
  expect(screen.getByText(/부산/)).toBeVisible();
  expect(screen.getByText(/점령|방어/)).toBeVisible();
  expect(screen.getByText(/지역균형 보너스/)).toBeVisible();
  expect(screen.getByRole("button", { name: /원정 시작/ })).toBeEnabled();
});

it("changes results when the user filters to contested territory", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist("bts");
  await user.click(screen.getByRole("button", { name: "접전 지역" }));
  expect(screen.getByRole("list", { name: "지도와 같은 영토 목록" }))
    .toHaveTextContent("탈환까지");
});
```

Add an empty-region case that selects a territory without an expedition and
asserts the panel recommends the nearest sourced or population-decline-bonus
territory instead of leaving the primary action blank.

- [ ] **Step 2: Run the territory test and verify missing component failure**

Run: `cd web && npm test -- team-preview-territory.test.tsx`

Expected: FAIL because `TerritoryView` is absent.

- [ ] **Step 3: Implement stable map filters and selectors**

Use the exact filter IDs `recommended`, `unclaimed`, `contested`,
`artist_connection`, and `population_decline`. Recommended ordering is:
selected-artist connection first, then contested status, then descending balance
multiplier, then Korean territory name for a stable tie-break.

- [ ] **Step 4: Implement the tactical panel information contract**

The panel always renders:

```text
current owner and nearest challenger
stronghold stage and build/defend/capture gap
selected artist connection story and evidence badge
source link
estimated visit/dwell/spend/accommodation award
regional multiplier reason
predicted territory and fandom-rank impact
primary expedition action
```

When no direct connection exists for the selected artist, show the exact
localized nearby-recommendation label and never render the evidence badge.

- [ ] **Step 5: Connect the territory view to the demo application**

Demo `explore` renders `TerritoryView`; integrated `explore` continues to render
the existing `ExploreView`. Opening an expedition dispatches both
`selectTerritory` in the preview session and `openExpedition` in the existing
app controller.

- [ ] **Step 6: Run territory, entry, and controller tests**

Run: `cd web && npm test -- team-preview-territory.test.tsx team-preview-entry.test.tsx app-controller.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the tactical territory experience**

```bash
git add web/components/team-preview web/features/ktown-app.tsx web/features/app-controller.ts web/tests/team-preview-territory.test.tsx
git commit -m "feat(web): personalize territory strategy by artist"
```

### Task 6: Source-Aware Expedition and Condensed Check-In Impact

**Files:**
- Create: `web/components/team-preview/expedition-view.tsx`
- Modify: `web/components/check-in/check-in-flow.tsx`
- Modify: `web/components/check-in/check-in-reducer.ts`
- Modify: `web/lib/domain.ts`
- Modify: `web/features/ktown-app.tsx`
- Test: `web/tests/team-preview-expedition.test.tsx`
- Test: `web/tests/team-preview-check-in.test.tsx`
- Modify: `web/tests/check-in-reducer.test.ts`

**Interfaces:**
- Consumes: `PreviewExpedition`, `PreviewMissionPlace`, `calculateMissionAward()`, `DemoSessionAction.completeMission`, and existing `CheckInService`.
- Produces: demo expedition route UI, extended demo evidence state, `onApproved(result, award)` callback, and a result view that reports all mission impacts.

- [ ] **Step 1: Write a failing source-aware expedition test**

Assert that a selected expedition shows its artist story, `공식` or `검증`
badge, clickable source, nearby recommendation label, public transit, expected
dwell time, regional multiplier, and expected total points. Assert that a
nearby recommendation does not contain `아티스트 연관 장소`.

- [ ] **Step 2: Write a failing condensed check-in test**

```tsx
it("connects demo evidence to territory and rank impact", async () => {
  const user = userEvent.setup();
  renderReadyPreviewCheckIn();
  await user.click(screen.getByRole("button", { name: "데모 인증 진행" }));
  expect(screen.getByText("GPS 위치 확인 완료")).toBeVisible();
  expect(screen.getByText("현장 사진 확인 완료")).toBeVisible();
  expect(screen.getByText("체류 45분 확인")).toBeVisible();
  await user.click(screen.getByRole("checkbox", { name: "로컬 소비 인증 포함" }));
  await user.click(screen.getByRole("button", { name: "포인트 검토" }));
  await user.click(screen.getByRole("button", { name: "체크인 제출" }));
  expect(await screen.findByText(/지역 점유율/)).toBeVisible();
  expect(screen.getByText(/거점/)).toBeVisible();
  expect(screen.getByText(/팬덤 순위/)).toBeVisible();
  expect(screen.getByText(/내 기여 순위/)).toBeVisible();
});
```

- [ ] **Step 3: Run expedition, check-in, and reducer tests to verify failure**

Run: `cd web && npm test -- team-preview-expedition.test.tsx team-preview-check-in.test.tsx check-in-reducer.test.ts`

Expected: FAIL on missing preview behavior.

- [ ] **Step 4: Extend check-in state without weakening integrated evidence**

Add demo-only evidence fields:

```ts
interface DemoEvidence {
  simulatedDwellMinutes: number;
  localSpendVerified: boolean;
  accommodationVerified: boolean;
  reviewAccepted: boolean;
}
```

Integrated mode still requires three real GPS samples and a real photo. Demo
mode fills three synthetic GPS samples, a synthetic photo asset, and 45 minutes
of simulated dwell only after the explicit `데모 인증 진행` action. Spending
and accommodation are user-controlled demo checkboxes. Submission remains
blocked until the review step is accepted.

Add a network-failure test in which submission fails after evidence collection.
The dialog must retain GPS, photo, dwell, and spend evidence, announce the
failure without exposing a raw error, and submit the same idempotency key after
the user chooses `다시 제출`.

- [ ] **Step 5: Build the source-aware route screen**

Use Task 1 localized content rather than hard-coded Busan strings. Display each
place relationship, evidence class, source, transport, dwell, local benefit,
and reward estimate. Render the selected territory standings beside the route.

- [ ] **Step 6: Apply the approved award to the single preview session**

On successful demo submission, calculate one `MissionAward`, dispatch one
`completeMission` action, and render before/after values returned by the
reducer. Do not mutate fixture arrays or maintain a second leaderboard state in
the component.

- [ ] **Step 7: Run preview and integrated check-in regressions**

Run: `cd web && npm test -- team-preview-expedition.test.tsx team-preview-check-in.test.tsx check-in-reducer.test.ts integrated-check-in.test.tsx real-check-in.test.tsx`

Expected: PASS; the integrated privacy, GPS, photo, and pending-decision copy
remains unchanged.

- [ ] **Step 8: Commit the connected mission loop**

```bash
git add web/components/team-preview/expedition-view.tsx web/components/check-in web/lib/domain.ts web/features/ktown-app.tsx web/tests/team-preview-expedition.test.tsx web/tests/team-preview-check-in.test.tsx web/tests/check-in-reducer.test.ts
git commit -m "feat(web): connect preview check-ins to territory impact"
```

### Task 7: Stronghold Ranking, Personal Record, and Replay

**Files:**
- Create: `web/components/team-preview/ranking-view.tsx`
- Create: `web/components/team-preview/record-view.tsx`
- Modify: `web/features/ktown-app.tsx`
- Modify: `web/components/app-shell.tsx`
- Test: `web/tests/team-preview-ranking.test.tsx`
- Test: `web/tests/team-preview-record.test.tsx`

**Interfaces:**
- Consumes: `rankFandoms()`, completed mission history, territory ownership, `useDemoSession()`, and typed translations.
- Produces: stronghold-first leaderboard, contested-territory summary, personal contribution record, and reset/replay control.

- [ ] **Step 1: Write failing leaderboard and record tests**

The leaderboard test must prove that a fandom with more strongholds ranks above
a fandom with more points, highlight the selected fandom, and show the exact
gap to the next rank. The record test must complete one mission, verify the
place, points, stronghold influenced, reward badge, and contribution rank, then
reset and confirm artist selection and history are cleared while locale remains
the user's selected locale.

- [ ] **Step 2: Run the ranking and record tests to verify failure**

Run: `cd web && npm test -- team-preview-ranking.test.tsx team-preview-record.test.tsx`

Expected: FAIL because both views are absent.

- [ ] **Step 3: Implement the stronghold-first ranking view**

Render rank, fandom, artist, stronghold count, valid points, trend, and selected
fandom state. Add a `Contested now` section ordered by smallest absolute score
gap. The top objective states the exact number of additional strongholds needed
for the next fandom rank.

- [ ] **Step 4: Implement the personal record and reward history**

Render completed expedition count, total valid points, contribution rank,
territories influenced, check-in history, and unlocked seed/tree/landmark
badges. Character customization is a disabled, labeled future reward teaser and
must not appear functional.

- [ ] **Step 5: Add safe replay behavior**

The reset button opens a confirmation dialog, calls the session `reset`, keeps
the current locale, returns the app controller to `explore`, and restores the
three-step start panel. It removes only `DEMO_SESSION_KEY`; it does not call
`localStorage.clear()`.

- [ ] **Step 6: Run ranking, record, entry, and session tests**

Run: `cd web && npm test -- team-preview-ranking.test.tsx team-preview-record.test.tsx team-preview-entry.test.tsx team-preview-session.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit rankings and replay**

```bash
git add web/components/team-preview web/features/ktown-app.tsx web/components/app-shell.tsx web/tests/team-preview-ranking.test.tsx web/tests/team-preview-record.test.tsx
git commit -m "feat(web): show stronghold rankings and player impact"
```

### Task 8: Responsive Visual System and Accessibility Completion

**Files:**
- Modify: `web/app/globals.css`
- Modify: `web/components/team-preview/*.tsx`
- Modify: `web/tests/setup.ts`
- Create: `web/tests/team-preview-accessibility.test.tsx`
- Create: `web/tests/team-preview-responsive-contract.test.ts`

**Interfaces:**
- Consumes: all preview components from Tasks 3 through 7.
- Produces: stable desktop split layout, mobile map plus bottom sheet, visible focus states, reduced-motion behavior, and test shims for MapLibre browser APIs.

- [ ] **Step 1: Write failing accessibility contract tests**

Test keyboard opening and closing of the artist drawer, focus return to its
trigger, one current-page navigation item, labeled locale and reset controls,
live announcement of mission impact, map-equivalent territory buttons, and
dialog title focus. Add a reduced-motion assertion that stronghold change also
renders a complete textual summary.

- [ ] **Step 2: Write a failing responsive CSS contract test**

Read `globals.css` and assert it contains:

```text
.preview-map-layout
.maplibregl-map
.tactical-panel
.artist-drawer
@media(max-width:767px)
@media(prefers-reduced-motion:reduce)
:focus-visible
```

Also assert `.territory-map .map-grid` is not used by any preview component.

- [ ] **Step 3: Run the accessibility and CSS tests to verify failure**

Run: `cd web && npm test -- team-preview-accessibility.test.tsx team-preview-responsive-contract.test.ts`

Expected: FAIL on missing focus, live-region, or responsive contracts.

- [ ] **Step 4: Implement the desktop and mobile layout**

At `768px` and above, render map and tactical panel in a minimum `minmax(0,
1fr) 360px` grid. Below `768px`, keep the map at a usable `52dvh` minimum and
render the selected territory as a scrollable bottom sheet. Keep primary actions
above the mobile navigation safe area.

- [ ] **Step 5: Add stronghold growth states without relying on animation**

Use distinct seed, tree, and landmark silhouettes, text labels, and accessible
names. Motion may enhance a state change but cannot be the only signal. In
reduced motion, remove transforms and transitions and update the live text
summary immediately.

- [ ] **Step 6: Complete focus, dialog, and map accessibility**

Trap focus in the artist drawer and check-in dialog, support Escape, return
focus to the invoking control, add `aria-live="polite"` to mission impact, and
ensure the territory list mirrors filters and selection. Do not hide Amazon
Location or boundary-data attribution.

- [ ] **Step 7: Run accessibility, preview component, lint, and build checks**

Run: `cd web && npm test -- team-preview && npm run lint && npm run build`

Expected: PASS with no `jsx-a11y` errors and no MapLibre server-render crash.

- [ ] **Step 8: Commit responsive and accessible presentation**

```bash
git add web/app/globals.css web/components/team-preview web/tests/setup.ts web/tests/team-preview-accessibility.test.tsx web/tests/team-preview-responsive-contract.test.ts
git commit -m "feat(web): polish preview responsiveness and accessibility"
```

### Task 9: Vercel Configuration, Golden Path, and Release Verification

**Files:**
- Modify: `web/.env.example`
- Modify: `web/README.md`
- Modify: `web/tests/vercel-deployment.test.ts`
- Modify: `web/tests/fan-journey.test.tsx`
- Create: `web/tests/team-preview-golden-path.test.tsx`

**Interfaces:**
- Consumes: the complete preview application and map configuration from Tasks 1 through 8.
- Produces: repeatable Vercel setup instructions, a complete automated golden path, and final release evidence.

- [ ] **Step 1: Write the failing Vercel environment contract test**

Extend the deployment test to assert that `.env.example` documents all three
public map variables, `KTOWN_SERVICE_MODE=demo`, and an explicit warning that
the Amazon Location key must be map-action and Vercel-origin restricted. Assert
the built artifact still excludes `KTOUR_SERVICE_KEY`, database URLs,
`KTOWN_DEV_USER_ID`, and local backend origins.

- [ ] **Step 2: Write the complete golden-path test**

The test must:

```text
render the product shell
switch to English and back to Korean
open the artist drawer
search for and select BTS
choose the recommended population-decline or contested region
open the recommended expedition
inspect one sourced direct connection and one nearby recommendation
run condensed demo evidence
include local spending
review and submit
assert awarded points and before/after territory values
open Ranking and assert the updated fandom position
open My Record and assert the completed mission
remount and assert persistence
reset and assert the start panel returns
```

- [ ] **Step 3: Run deployment and golden-path tests to verify failure**

Run: `cd web && npm test -- vercel-deployment.test.ts team-preview-golden-path.test.tsx`

Expected: FAIL until docs, environment contracts, and final selectors are
complete.

- [ ] **Step 4: Document exact Vercel preview configuration**

Add this environment contract to `.env.example` and explain it in README:

```dotenv
KTOWN_SERVICE_MODE=demo
NEXT_PUBLIC_AWS_LOCATION_API_KEY=example-restricted-map-key
NEXT_PUBLIC_AWS_LOCATION_REGION=ap-northeast-2
NEXT_PUBLIC_AWS_LOCATION_STYLE=Standard
```

Document AWS restrictions, Preview and Production origin entries, deployment,
demo reset, map attribution, and the fact that check-in, battle updates, and
Korea Tourism data are deterministic demo behavior.

- [ ] **Step 5: Make the golden path pass without test-only product branches**

Use injected map configuration and the accessible territory list in jsdom.
Do not add `if (process.env.NODE_ENV === "test")` product behavior. Stabilize
selectors with roles, labels, and public text rather than CSS class names.

- [ ] **Step 6: Run the full web verification suite**

Run:

```bash
cd web
npm test
npm run lint
npm run build
npm run build:vercel
```

Expected: all tests PASS; lint exits `0`; both standard and Vercel builds exit
`0`; `.vercel/output/config.json`, static assets, and the Nitro server function
exist.

- [ ] **Step 7: Inspect the Vercel artifact for secrets and local endpoints**

Run: `cd web && npm test -- vercel-deployment.test.ts`

Expected: PASS; artifact text contains none of the forbidden secret or local
backend patterns. The public Amazon Location key variable name may appear, but
the committed files contain only the example replacement value.

- [ ] **Step 8: Perform browser verification on desktop and mobile widths**

Start the production-equivalent preview with configured map variables. Verify
the golden path at `1440x900` and `390x844`, capture screenshots of first entry,
selected territory, and post-check-in impact, and confirm map pan/zoom, bottom
sheet behavior, keyboard navigation, English switch, persistence, and reset.

- [ ] **Step 9: Commit release configuration and verification**

```bash
git add web/.env.example web/README.md web/tests/vercel-deployment.test.ts web/tests/fan-journey.test.tsx web/tests/team-preview-golden-path.test.tsx
git commit -m "test(web): verify the K-Town team preview journey"
```

## Final Verification Gate

- [ ] Run `git status --short` and confirm only intentional files remain.
- [ ] Run `cd web && npm test` and record the passing test count.
- [ ] Run `cd web && npm run lint` and confirm exit code `0`.
- [ ] Run `cd web && npm run build` and confirm exit code `0`.
- [ ] Run `cd web && npm run build:vercel` and confirm exit code `0`.
- [ ] Confirm all 15 artist IDs have a connection, source, and playable expedition.
- [ ] Confirm the configured Vercel URL loads a real Amazon Location map.
- [ ] Confirm one check-in changes the same territory and ranking state shown elsewhere.
- [ ] Confirm Korean and English complete the golden path.
- [ ] Confirm desktop, mobile, keyboard, and reduced-motion checks pass.
- [ ] Confirm no user-owned unrelated worktree changes were staged or committed.
