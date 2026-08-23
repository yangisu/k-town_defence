# K-Town Defense Personalized Territory UX Design

## 1. Purpose

Restructure the team preview so fandom choice behaves like a persistent user
profile, the territory map is immediately understandable after profile setup,
expeditions lead with trustworthy artist-linked destinations, and Ranking and
My Record communicate progress visually instead of as plain text lists.

This design supersedes the first-entry, map legend, expedition fallback, and
ranking/record presentation portions of
`docs/superpowers/specs/2026-08-22-ktown-defense-team-preview-design.md`.
Existing game rules, check-in behavior, bilingual support, MapLibre/Amazon
Location integration, and browser-local demo persistence remain in force.

## 2. Problems Being Corrected

1. Artist selection currently appears beside the territory map, although it is
   account-level identity rather than a map action.
2. The selected fandom's territory is not visually dominant, so users cannot
   quickly decide where to defend or travel.
3. Color communicates both fandom ownership and stronghold growth, creating two
   competing legends.
4. Labels such as `게스트 데모`, `ARMY · #1`, `광주 · ONEDOOR`, and
   `광주 · 제이홉` appear together without explaining whether they refer to the
   user, owner, target, or regional story.
5. An artist-branded expedition may fall back to unrelated public attractions,
   weakening motivation and overstating the relationship.
6. Ranking and My Record expose useful data as undifferentiated text rows rather
   than goals, comparison, progress, and achievement.

## 3. Product Principles

- Identity before exploration: profile setup precedes the personalized map.
- One visual variable, one meaning: color means fandom; size means stronghold
  growth.
- Explicit roles: every fandom or artist label states whether it is `내 팬덤`,
  `현재 소유`, `도전자`, or `지역 연결 스토리`.
- Evidence before branding: only a public, visitable, source-backed place may be
  called an artist-linked destination.
- Actionable progress: rankings explain the next achievable move; records show
  growth over time.

## 4. Scope

### Included

- First-run full-screen fandom profile setup
- Persistent profile control in the app header
- Personalized map emphasis and territory zoom
- Fandom-only color system and size-only stronghold stages
- Clear identity, ownership, target, and connection terminology
- Evidence-first expedition recommendation and honest fallback naming
- Redesigned Ranking and My Record views
- Korean and English copy, keyboard operation, reduced motion, and responsive
  layouts for all changed flows

### Not included

- Production authentication or a server-side profile
- New game scoring or territory-capture rules
- Fabricated artist landmarks, private homes, schools, or sensitive addresses
- A complete content-research program for every Korean artist and city
- Changes to the integrated non-demo service flow

## 5. Entry and Profile Flow

When no artist has been confirmed, the application shows a dedicated profile
setup screen before rendering the territory workspace. The side rail or mobile
navigation may remain visible as product context, but primary navigation is
inert until setup finishes.

The setup screen contains:

- `응원할 아티스트를 선택하세요` heading
- Searchable artist cards with artist name, fandom name, fandom color, and
  representative regions
- One explicit `이 팬덤으로 시작` confirmation action
- A short explanation that the choice personalizes territory and expedition
  recommendations and can be changed later

After confirmation, the choice persists through the existing versioned demo
session in `localStorage`. The header contains a profile button labeled
`내 팬덤 · ARMY` (or its selected equivalent). Activating it reopens the same
selector. Changing fandom preserves completed check-in history but clears the
current territory and expedition selection, then selects the new fandom's most
relevant owned or connected territory.

`게스트 데모` and the ambiguous compact `#1` identity label are removed. Rank
is shown only where its meaning is explicit, such as `팬덤 순위 1위`.

## 6. Territory Map Information Architecture

### 6.1 Default personalized view

After profile setup, the map opens nationwide and emphasizes territories
currently owned by the selected fandom. The initial side panel summarizes:

- Number of territories owned by the selected fandom
- Strongest owned territory
- Nearest contested territory
- One recommended defend or capture action

The default filter is `내 팬덤`, followed by `접전`, `아티스트 연결`, and
`전체`. Filtering changes emphasis and the accessible territory list; it does
not hide the national ownership context without an explicit user action.

### 6.2 Territory interaction

Selecting either a polygon or its territory card:

1. marks the same territory as selected in both controls;
2. fits the polygon bounds into the map viewport with panel-aware padding;
3. opens the territory detail panel;
4. retains a visible `전국 보기` control to restore the national camera.

Keyboard users receive the same behavior through the territory list. Reduced
motion replaces animated flight with an immediate camera fit.

### 6.3 Visual encoding

Territory fill, outline emphasis, and stronghold marker all use the current
owner fandom's color. The selected fandom's owned regions use higher opacity
and a thicker owner-colored outline. Other fandoms remain visible at lower
opacity. The actively selected territory adds a neutral high-contrast selection
ring rather than a new semantic color.

Stronghold stage is encoded only by size:

| Stage | Korean label | Marker diameter | Meaning |
| --- | --- | ---: | --- |
| `seed` | 씨앗 거점 | 14 px | Newly established |
| `tree` | 성장 거점 | 22 px | Established |
| `landmark` | 랜드마크 거점 | 32 px | Highest stage |

The same fandom color remains constant across all three sizes. Text labels and
accessible names remain available so neither color nor size is the sole signal.

## 7. Terminology and Context Hierarchy

The shell and territory panel use the following exact role hierarchy:

| Context | Korean pattern | Gwangju example |
| --- | --- | --- |
| User identity | `내 팬덤 · {fandom}` | `내 팬덤 · ARMY` |
| Selected target | `목표 지역 · {territory}` | `목표 지역 · 광주` |
| Current owner | `현재 소유 · {fandom}` | `현재 소유 · ONEDOOR` |
| Challenger | `도전자 · {fandom}` | `도전자 · ARMY` |
| Regional story | `지역 연결 스토리 · {member}` | `지역 연결 스토리 · 제이홉` |
| Rank | `팬덤 순위 {rank}위` | `팬덤 순위 1위` |

The territory card shows territory name, `현재 소유`, owner-colored marker,
stronghold stage, and the selected fandom's defend/capture gap. Member names do
not appear in the ownership line.

## 8. Evidence-First Expedition Recommendations

### 8.1 Place classification

An `artist_connection` place must have `access: public`, be visitable and
non-sensitive, and be supported by a claim-specific HTTPS source. It may use
`official` evidence or the existing multi-source `verified` policy. A hometown
connection alone does not turn arbitrary nearby attractions into artist-linked
destinations. `restricted` and `sensitive` places are ineligible for routes.

A `nearby_recommendation` remains a public tourism stop and must not use
artist-branded language.

### 8.2 Recommendation order

For the selected artist and territory, the route selector applies this order:

1. Artist-linked expedition containing at least one eligible
   `artist_connection` stop
2. Another artist-linked expedition in the nearest connected territory
3. Clearly labeled `지역 응원 원정` containing only public tourism stops

The UI never presents case 3 as `{artist} {territory} 원정`. It states that the
route supports the territory but has no verified direct artist destination.

### 8.3 Route composition

An artist-linked route leads with the direct connection stop and may add one or
two nearby recommendations for food, culture, or accommodation. The route hero
states `아티스트 연관 장소 중심` and shows source/evidence details before the
public recommendations.

When only a regional story is known, the panel shows that story separately and
offers either the nearest verified artist-linked route or the honest regional
support route. It does not imply that a member's hometown is itself a tourist
destination.

## 9. Ranking Design

The Ranking page becomes a dashboard with four sections:

1. Top-three podium cards with rank, fandom color, artist/fandom identity,
   stronghold count, points, and trend
2. Sticky `내 팬덤` card showing explicit rank, distance to the next rank, and a
   progress bar
3. Full leaderboard rows with proportional stronghold bars and clear selected
   state
4. `지금 접전 중` territory cards with owner, challenger, point gap, and a
   direct action to inspect the territory

Stronghold count remains the primary ranking rule and valid points remain the
tie-breaker. Visual bar length never changes the underlying calculation.

## 10. My Record Design

My Record becomes a personal season dashboard:

- Hero summary with contribution points and explicit contribution rank
- Four metric cards: completed expeditions, approved check-ins, influenced
  territories, and highest stronghold stage
- Stronghold growth track from seed to tree to landmark
- Reverse-chronological activity timeline with place, territory, points, and
  resulting stage
- Reward badge collection with clear locked/unlocked treatment
- Empty state with one primary action returning to the personalized map

The record remains derived from the existing approved check-in history; no
parallel analytics state is introduced.

## 11. Technical Boundaries

- `DemoSession` remains the single persisted source of profile, selected
  territory, check-in history, territory state, and rankings.
- Profile setup reuses the artist catalog and session reducer; no second profile
  store is created.
- Map rendering remains in `territory-map.tsx`, while pure map expressions and
  camera helpers move to a focused module so they can be unit tested.
- Expedition selection becomes a pure selector that distinguishes an eligible
  artist route from a regional support fallback.
- Ranking and record views consume selectors and existing session data; they do
  not calculate alternate standings.
- Existing integrated-mode components and backend service contracts remain
  untouched.

## 12. Failure and Empty States

- Corrupt or old session: reset to profile setup while preserving no untrusted
  payload fields.
- No owned territory: show connected and contested recommendations without
  claiming ownership.
- No artist-linked place: show the nearest verified route or `지역 응원 원정`.
- Map unavailable: retain the same personalized accessible territory list and
  profile controls.
- No check-ins: show a friendly empty record and `영토 둘러보기` action.
- Fewer than three ranked fandoms: render available podium cards without empty
  decorative placeholders.

## 13. Acceptance Criteria

- A first-time user cannot reach an unexplained map before confirming a fandom.
- A returning user lands on a personalized map with the saved fandom.
- The header says `내 팬덤`, never `게스트 데모` or an unexplained `#1`.
- On the Gwangju/BTS case, ONEDOOR is labeled owner, ARMY is labeled user or
  challenger, and j-hope is labeled regional story.
- Fandom color is stable across territory and every stronghold stage; marker
  size increases from seed to tree to landmark.
- Selecting a polygon or card opens and enlarges the same territory; `전국 보기`
  restores the national map.
- Public-only routes are never artist-branded.
- Ranking visibly prioritizes top three, the user's next goal, and contested
  territories.
- My Record visibly communicates summary, progression, history, and rewards.
- Korean and English component tests, accessibility tests, full web tests,
  lint, standard build, and Vercel build pass.
