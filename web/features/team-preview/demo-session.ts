import type { AppTab } from "@/features/app-controller";
import { getArtistHomeTerritories, previewContent } from "./content";
import { stageForPoints, type MissionAward } from "./game-rules";
import type { ArtistId, FandomStanding, Locale, PreviewTerritory, StrongholdStage, TerritoryFilterId, TerritoryId } from "./types";

export const DEMO_SESSION_VERSION = 3;
export const DEMO_SESSION_KEY = "ktown-team-preview-v3";
export const LEGACY_DEMO_SESSION_KEY = "ktown-team-preview-v2";
export const MAX_DEMO_SESSION_CHARS = 1_000_000;

export interface ApprovedCheckInRecord {
  expeditionId: string;
  placeId: string;
  artistId: ArtistId;
  territoryId: TerritoryId;
  awardedPoints: number;
  strongholdStage: StrongholdStage;
}

export interface DemoSession {
  version: typeof DEMO_SESSION_VERSION;
  locale: Locale;
  artistConfirmed: boolean;
  selectedArtistId: ArtistId | null;
  /**
   * Every fandom on the reader's roster. One of them is the active one —
   * `selectedArtistId` — and the map, ranking and recommendations still answer
   * to that one alone; the rest wait on the roster so switching back costs a
   * tap instead of choosing again. The active artist is always a member.
   */
  followedArtistIds: ArtistId[];
  /**
   * Which slice of the board the reader last asked the map to show. It is part
   * of where they are, not a setting, so it survives leaving the page and
   * coming back the same way the chosen territory does.
   */
  territoryFilter: TerritoryFilterId;
  /**
   * Every fold the reader has opened or closed by hand, keyed by panel. A
   * section they shut stays shut when they come back to the page — it used to
   * spring open again on every visit, undoing the choice each time. Signing in
   * or changing the roster starts the reading over, so the bag is emptied
   * there and nowhere else.
   */
  disclosures: Record<string, boolean>;
  selectedTerritoryId: TerritoryId | null;
  activeTab: AppTab;
  selectedExpeditionId: string | null;
  activeExpeditionId: string | null;
  territories: PreviewTerritory[];
  fandoms: FandomStanding[];
  completedExpeditionIds: string[];
  approvedCheckIns: ApprovedCheckInRecord[];
  missionVisitCounts: Record<string, number>;
  contributedToday: number;
}

export type DemoSessionAction =
  | { type: "selectArtist"; artistId: ArtistId }
  | { type: "changeProfile"; artistId: ArtistId }
  | { type: "removeArtist"; artistId: ArtistId }
  | { type: "selectTerritory"; territoryId: TerritoryId | null }
  | { type: "setTerritoryFilter"; filter: TerritoryFilterId }
  | { type: "setDisclosure"; key: string; open: boolean }
  | { type: "changeTab"; tab: AppTab }
  | { type: "openExpedition"; expeditionId: string }
  | { type: "openRecommendedExpedition"; expeditionId: string; territoryId: TerritoryId }
  | { type: "endExpedition" }
  | { type: "setLocale"; locale: Locale }
  | { type: "completeCheckIn"; expeditionId: string; placeId: string; award: MissionAward }
  | { type: "hydrate"; state: DemoSession }
  | { type: "reset" };

function copyTerritory(territory: PreviewTerritory): PreviewTerritory {
  return {
    ...territory,
    name: { ...territory.name },
    centroid: { ...territory.centroid },
    balanceReason: { ...territory.balanceReason },
    sourceUrls: [...territory.sourceUrls],
    standings: territory.standings.map((standing) => ({ ...standing })),
  };
}

function copyTerritories() {
  return previewContent.territories.map(copyTerritory);
}

function getArtistFandom(artistId: ArtistId) {
  return previewContent.artists.find((artist) => artist.id === artistId)!.fandomName;
}

export function selectProfileTerritory(
  artistId: ArtistId,
  territories: PreviewTerritory[],
): PreviewTerritory | null {
  const catalogOrder = new Map(previewContent.territories.map((territory, index) => [territory.id, index]));
  const owned = territories
    .filter((territory) => territory.ownerArtistId === artistId)
    .map((territory) => ({
      territory,
      points: territory.standings.find((standing) => standing.artistId === artistId)?.validPoints ?? 0,
    }))
    .sort((a, b) => b.points - a.points
      || (catalogOrder.get(a.territory.id) ?? Number.MAX_SAFE_INTEGER)
        - (catalogOrder.get(b.territory.id) ?? Number.MAX_SAFE_INTEGER));
  if (owned[0]) return owned[0].territory;

  const connectedTerritoryIds = new Set(previewContent.connections
    .filter((connection) => connection.artistId === artistId)
    .map((connection) => connection.territoryId));
  for (const catalogTerritory of previewContent.territories) {
    if (!connectedTerritoryIds.has(catalogTerritory.id)) continue;
    const territory = territories.find((candidate) => candidate.id === catalogTerritory.id);
    if (territory) return territory;
  }

  for (const representative of getArtistHomeTerritories(artistId)) {
    const territory = territories.find((candidate) => candidate.id === representative.id);
    if (territory) return territory;
  }
  return null;
}

function recomputeTerritory(territory: PreviewTerritory): PreviewTerritory {
  const leader = territory.standings.reduce((best, standing) => standing.validPoints > best.validPoints ? standing : best);
  const currentOwner = territory.standings.find((standing) => standing.artistId === territory.ownerArtistId);
  const ownerArtistId = !currentOwner || leader.validPoints > currentOwner.validPoints
    ? leader.artistId
    : currentOwner.artistId;
  const ownerPoints = territory.standings.find((standing) => standing.artistId === ownerArtistId)?.validPoints ?? 0;
  return { ...territory, ownerArtistId, strongholdStage: stageForPoints(ownerPoints) };
}

function recomputeFandoms(territories: PreviewTerritory[]): FandomStanding[] {
  return previewContent.artists.map((artist) => ({
    artistId: artist.id,
    fandomName: artist.fandomName,
    strongholds: territories.filter((territory) => territory.ownerArtistId === artist.id).length,
    validPoints: territories.reduce(
      (total, territory) => total + (territory.standings.find((standing) => standing.artistId === artist.id)?.validPoints ?? 0),
      0,
    ),
    trend: "same",
  }));
}

export function createInitialDemoSession(): DemoSession {
  const territories = copyTerritories().map(recomputeTerritory);
  return {
    version: DEMO_SESSION_VERSION,
    locale: "ko",
    artistConfirmed: false,
    selectedArtistId: null,
    followedArtistIds: [],
    territoryFilter: "my_fandom",
    disclosures: {},
    selectedTerritoryId: null,
    activeTab: "explore",
    selectedExpeditionId: null,
    activeExpeditionId: null,
    territories,
    fandoms: recomputeFandoms(territories),
    completedExpeditionIds: [],
    approvedCheckIns: [],
    missionVisitCounts: {},
    contributedToday: 0,
  };
}

/** The roster with this artist on it, and the same array when already there. */
function withArtist(followedArtistIds: ArtistId[], artistId: ArtistId) {
  return followedArtistIds.includes(artistId) ? followedArtistIds : [...followedArtistIds, artistId];
}

function compatibleExpedition(expeditionId: string, artistId: ArtistId, territoryId: TerritoryId) {
  const expedition = previewContent.expeditions.find((candidate) => candidate.id === expeditionId);
  return expedition && expedition.territoryId === territoryId && (expedition.artistId === null || expedition.artistId === artistId)
    ? expedition
    : null;
}

function deriveCompletedExpeditionIds(records: ApprovedCheckInRecord[]) {
  const approvedByExpedition = new Map<string, Set<string>>();
  for (const record of records) {
    const approved = approvedByExpedition.get(record.expeditionId) ?? new Set<string>();
    approved.add(record.placeId);
    approvedByExpedition.set(record.expeditionId, approved);
  }
  return previewContent.expeditions
    .filter((expedition) => expedition.stopIds.every((placeId) => approvedByExpedition.get(expedition.id)?.has(placeId)))
    .map((expedition) => expedition.id);
}

export function applyCheckInImpact(state: DemoSession, expeditionId: string, placeId: string, award: MissionAward): DemoSession {
  const artistId = state.selectedArtistId;
  const territoryId = state.selectedTerritoryId;
  if (!state.artistConfirmed || artistId === null || territoryId === null || state.selectedExpeditionId !== expeditionId) return state;
  const expedition = compatibleExpedition(expeditionId, artistId, territoryId);
  const place = previewContent.places.find((candidate) => candidate.id === placeId);
  // Every check-in lands in full. There used to be a 1200P daily ceiling here,
  // which one stop in a 1.8x region all but exhausted, leaving the next stop on
  // the same route worth almost nothing for no reason the traveller could see.
  const actualApplied = Math.max(Number.isFinite(award.cappedPoints) ? award.cappedPoints : 0, 0);
  if (!expedition || !place || place.territoryId !== expedition.territoryId || !expedition.stopIds.includes(place.id)) return state;

  const territories = state.territories.map((territory) => {
    if (territory.id !== expedition.territoryId) return territory;
    const existing = territory.standings.find((standing) => standing.artistId === artistId);
    const standings = existing
      ? territory.standings.map((standing) => standing.artistId === artistId
        ? { ...standing, validPoints: standing.validPoints + actualApplied }
        : standing)
      : [...territory.standings, { artistId, fandomName: getArtistFandom(artistId), validPoints: actualApplied }];
    return recomputeTerritory({ ...territory, standings });
  });
  const influencedTerritory = territories.find((territory) => territory.id === expedition.territoryId)!;
  const approvedCheckIns = [...state.approvedCheckIns, {
    expeditionId,
    placeId,
    artistId,
    territoryId: expedition.territoryId,
    awardedPoints: actualApplied,
    strongholdStage: influencedTerritory.strongholdStage,
  }];
  return {
    ...state,
    territories,
    fandoms: recomputeFandoms(territories),
    completedExpeditionIds: deriveCompletedExpeditionIds(approvedCheckIns),
    approvedCheckIns,
    missionVisitCounts: { ...state.missionVisitCounts, [placeId]: (state.missionVisitCounts[placeId] ?? 0) + 1 },
    contributedToday: state.contributedToday + actualApplied,
  };
}

export function demoSessionReducer(state: DemoSession, action: DemoSessionAction): DemoSession {
  switch (action.type) {
    case "selectArtist":
      return {
        ...state,
        artistConfirmed: true,
        selectedArtistId: action.artistId,
        followedArtistIds: withArtist(state.followedArtistIds, action.artistId),
        disclosures: {},
        selectedTerritoryId: null,
        activeTab: "explore",
        selectedExpeditionId: null,
        activeExpeditionId: null,
      };
    case "changeProfile": {
      // Picking an artist adds them to the roster as well as making them the
      // active one, so "change" and "add" are the same gesture from the reader's
      // side: they end up following whoever they just chose.
      if (state.artistConfirmed && state.selectedArtistId === action.artistId) {
        const followedArtistIds = withArtist(state.followedArtistIds, action.artistId);
        return followedArtistIds === state.followedArtistIds ? state : { ...state, followedArtistIds };
      }
      // The territory on screen is wherever the reader last went, and switching
      // fandom is not a request to be moved. Only a reader who has not chosen
      // one yet gets a suggestion.
      const territory = state.selectedTerritoryId
        ? state.territories.find((candidate) => candidate.id === state.selectedTerritoryId)
        : selectProfileTerritory(action.artistId, state.territories);
      return {
        ...state,
        artistConfirmed: true,
        selectedArtistId: action.artistId,
        followedArtistIds: withArtist(state.followedArtistIds, action.artistId),
        disclosures: {},
        selectedTerritoryId: territory?.id ?? null,
        // Switching fandom is not a request to go somewhere: the reader stays
        // on the page they were reading, now showing it as the new fandom. The
        // one exception is a route, which this switch has just cleared.
        activeTab: state.activeTab === "expedition" ? "explore" : state.activeTab,
        selectedExpeditionId: null,
        activeExpeditionId: null,
      };
    }
    case "removeArtist": {
      if (!state.followedArtistIds.includes(action.artistId)) return state;
      const followedArtistIds = state.followedArtistIds.filter((artistId) => artistId !== action.artistId);
      // Leaving the active fandom hands the seat to the next one on the roster.
      // Leaving the last one empties it, and the reader chooses again — their
      // visits keep the fandom they were made for either way.
      if (state.selectedArtistId !== action.artistId) return { ...state, followedArtistIds };
      const successor = followedArtistIds[0] ?? null;
      if (!successor) {
        return {
          ...state,
          followedArtistIds,
          disclosures: {},
          artistConfirmed: false,
          selectedArtistId: null,
          selectedTerritoryId: null,
          activeTab: "explore",
          selectedExpeditionId: null,
          activeExpeditionId: null,
        };
      }
      const territory = selectProfileTerritory(successor, state.territories);
      return {
        ...state,
        followedArtistIds,
        disclosures: {},
        artistConfirmed: true,
        selectedArtistId: successor,
        selectedTerritoryId: territory?.id ?? null,
        activeTab: state.activeTab === "journey" ? "journey" : "explore",
        selectedExpeditionId: null,
        activeExpeditionId: null,
      };
    }
    case "setTerritoryFilter":
      return state.territoryFilter === action.filter ? state : { ...state, territoryFilter: action.filter };
    case "setDisclosure":
      return state.disclosures[action.key] === action.open
        ? state
        : { ...state, disclosures: { ...state.disclosures, [action.key]: action.open } };
    case "selectTerritory":
      return state.artistConfirmed
        ? { ...state, selectedTerritoryId: action.territoryId, activeTab: "explore", selectedExpeditionId: null }
        : state;
    case "changeTab": {
      if (action.tab !== "expedition") return { ...state, activeTab: action.tab, selectedExpeditionId: null };
      if (!state.selectedArtistId) return state;
      // The tab shows a route only once the traveller has started one; until
      // then it stays empty instead of opening a recommendation for them.
      const active = state.activeExpeditionId
        ? previewContent.expeditions.find((candidate) => candidate.id === state.activeExpeditionId)
        : undefined;
      // The route carries its own territory, so opening it leaves the map's
      // selection alone. It used to overwrite it, and a reader who started in
      // Yeongwol, then read up on Ulsan, found Yeongwol waiting on the map
      // again — the route had quietly undone their last move.
      return active && (active.artistId === null || active.artistId === state.selectedArtistId)
        ? { ...state, activeTab: "expedition", selectedExpeditionId: active.id }
        : { ...state, activeTab: "expedition", selectedExpeditionId: null };
    }
    case "endExpedition":
      // Approved check-ins already landed in the territories, so only the
      // running route is cleared and its territory opens up again.
      return state.activeExpeditionId === null
        ? state
        : { ...state, activeExpeditionId: null, selectedExpeditionId: null };
    case "openExpedition": {
      if (!state.selectedArtistId || !state.selectedTerritoryId) return state;
      const expedition = compatibleExpedition(action.expeditionId, state.selectedArtistId, state.selectedTerritoryId);
      if (expedition && state.activeExpeditionId !== null && state.activeExpeditionId !== expedition.id) return state;
      return expedition
        ? { ...state, activeTab: "expedition", selectedExpeditionId: expedition.id, activeExpeditionId: expedition.id }
        : state;
    }
    case "openRecommendedExpedition": {
      if (!state.artistConfirmed || !state.selectedArtistId) return state;
      // Opening a route elsewhere ends the one that was running. The screen
      // asks before it comes to this, and the check-ins already approved stay
      // where they landed — only the unfinished route is let go.
      const expedition = compatibleExpedition(action.expeditionId, state.selectedArtistId, action.territoryId);
      return expedition && expedition.territoryId === action.territoryId
        ? {
            ...state,
            selectedTerritoryId: action.territoryId,
            selectedExpeditionId: expedition.id,
            activeExpeditionId: expedition.id,
            activeTab: "expedition",
          }
        : state;
    }
    case "setLocale": return { ...state, locale: action.locale };
    case "completeCheckIn": return applyCheckInImpact(state, action.expeditionId, action.placeId, action.award);
    case "hydrate": return action.state;
    case "reset": return { ...createInitialDemoSession(), locale: state.locale };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

const artistIds = new Set<ArtistId>(previewContent.artists.map((artist) => artist.id));
const territoryIds = new Set<TerritoryId>(previewContent.territories.map((territory) => territory.id));
const placeIds = new Set(previewContent.places.map((place) => place.id));
const expeditionIds = new Set(previewContent.expeditions.map((expedition) => expedition.id));

function isArtistId(value: unknown): value is ArtistId {
  return typeof value === "string" && artistIds.has(value as ArtistId);
}

function isTerritoryId(value: unknown): value is TerritoryId {
  return typeof value === "string" && territoryIds.has(value);
}

function isLocalizedText(value: unknown) {
  return isRecord(value) && typeof value.ko === "string" && typeof value.en === "string";
}

function isValidTerritory(value: unknown): value is PreviewTerritory {
  if (!isRecord(value)
    || !isTerritoryId(value.id)
    || !isLocalizedText(value.name)
    || !isRecord(value.centroid)
    || !Number.isFinite(value.centroid.latitude)
    || !Number.isFinite(value.centroid.longitude)
    || typeof value.populationDecline !== "boolean"
    || (value.balanceMultiplier !== 1 && value.balanceMultiplier !== 1.8)
    || !isLocalizedText(value.balanceReason)
    || !Array.isArray(value.sourceUrls)
    || !value.sourceUrls.every((url) => typeof url === "string")
    || !isArtistId(value.ownerArtistId)
    || !["seed", "tree", "landmark"].includes(value.strongholdStage as string)
    || !Array.isArray(value.standings)
    || value.standings.length === 0) return false;
  const standingIds = new Set<string>();
  for (const standing of value.standings) {
    if (!isRecord(standing)
      || !isArtistId(standing.artistId)
      || standingIds.has(standing.artistId)
      || standing.fandomName !== getArtistFandom(standing.artistId)
      || !isNonNegativeFinite(standing.validPoints)) return false;
    standingIds.add(standing.artistId);
  }
  const owner = value.standings.find((standing) => standing.artistId === value.ownerArtistId);
  return Boolean(owner && value.strongholdStage === stageForPoints(owner.validPoints));
}

function hasExactIds(values: unknown[], expected: Set<string>, idOf: (value: unknown) => string | null) {
  const ids = values.map(idOf);
  return ids.every((id): id is string => id !== null)
    && ids.length === expected.size
    && new Set(ids).size === expected.size
    && ids.every((id) => expected.has(id));
}

function isValidFandom(value: unknown): value is FandomStanding {
  return isRecord(value)
    && isArtistId(value.artistId)
    && value.fandomName === getArtistFandom(value.artistId)
    && Number.isInteger(value.strongholds)
    && isNonNegativeFinite(value.strongholds)
    && isNonNegativeFinite(value.validPoints)
    && ["up", "down", "same"].includes(value.trend as string);
}

function isValidApprovedCheckIn(value: unknown): value is ApprovedCheckInRecord {
  if (!isRecord(value)
    || typeof value.expeditionId !== "string"
    || !expeditionIds.has(value.expeditionId)
    || typeof value.placeId !== "string"
    || !placeIds.has(value.placeId)
    || !isArtistId(value.artistId)
    || !isTerritoryId(value.territoryId)
    || !isNonNegativeFinite(value.awardedPoints)
    || value.awardedPoints <= 0
    || !["seed", "tree", "landmark"].includes(value.strongholdStage as string)) return false;
  const expedition = previewContent.expeditions.find((candidate) => candidate.id === value.expeditionId);
  const place = previewContent.places.find((candidate) => candidate.id === value.placeId);
  return Boolean(expedition
    && place
    && expedition.stopIds.includes(value.placeId)
    && expedition.territoryId === value.territoryId
    && place.territoryId === value.territoryId
    && (expedition.artistId === null || expedition.artistId === value.artistId));
}

function exactJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function rebuildTerritories(records: ApprovedCheckInRecord[]) {
  let territories = copyTerritories().map(recomputeTerritory);
  for (const record of records) {
    territories = territories.map((territory) => {
      if (territory.id !== record.territoryId) return territory;
      const existing = territory.standings.find((standing) => standing.artistId === record.artistId);
      const standings = existing
        ? territory.standings.map((standing) => standing.artistId === record.artistId
          ? { ...standing, validPoints: standing.validPoints + record.awardedPoints }
          : standing)
        : [...territory.standings, {
          artistId: record.artistId,
          fandomName: getArtistFandom(record.artistId),
          validPoints: record.awardedPoints,
        }];
      const updated = recomputeTerritory({ ...territory, standings });
      return updated.strongholdStage === record.strongholdStage ? updated : { ...updated, strongholdStage: "" as StrongholdStage };
    });
  }
  return territories;
}

export function isValidDemoSession(value: unknown): value is DemoSession {
  if (!isRecord(value)
    || value.version !== DEMO_SESSION_VERSION
    || (value.locale !== "ko" && value.locale !== "en")
    || typeof value.artistConfirmed !== "boolean"
    || (value.selectedArtistId !== null && !isArtistId(value.selectedArtistId))
    || (value.selectedTerritoryId !== null && !isTerritoryId(value.selectedTerritoryId))
    || !["explore", "expedition", "battle", "journey"].includes(value.activeTab as string)
    || (value.selectedExpeditionId !== null && (typeof value.selectedExpeditionId !== "string" || !expeditionIds.has(value.selectedExpeditionId)))
    || (value.activeExpeditionId !== null && (typeof value.activeExpeditionId !== "string" || !expeditionIds.has(value.activeExpeditionId)))
    || !Array.isArray(value.territories)
    || !value.territories.every(isValidTerritory)
    || !hasExactIds(value.territories, territoryIds, (territory) => isRecord(territory) && isTerritoryId(territory.id) ? territory.id : null)
    || !Array.isArray(value.fandoms)
    || !value.fandoms.every(isValidFandom)
    || !hasExactIds(value.fandoms, artistIds, (fandom) => isRecord(fandom) && isArtistId(fandom.artistId) ? fandom.artistId : null)
    || !Array.isArray(value.completedExpeditionIds)
    || !value.completedExpeditionIds.every((id) => typeof id === "string" && expeditionIds.has(id))
    || new Set(value.completedExpeditionIds).size !== value.completedExpeditionIds.length
    || !Array.isArray(value.approvedCheckIns)
    || !value.approvedCheckIns.every(isValidApprovedCheckIn)
    || !isRecord(value.missionVisitCounts)
    || !Object.entries(value.missionVisitCounts).every(([placeId, count]) => placeIds.has(placeId) && Number.isInteger(count) && isNonNegativeFinite(count))
    || !isNonNegativeFinite(value.contributedToday)) return false;

  if (!TERRITORY_FILTER_IDS.includes(value.territoryFilter as TerritoryFilterId)) return false;
  if (!isRecord(value.disclosures)
    || Object.values(value.disclosures).some((open) => typeof open !== "boolean")) return false;
  if (!Array.isArray(value.followedArtistIds)
    || !value.followedArtistIds.every(isArtistId)
    || new Set(value.followedArtistIds).size !== value.followedArtistIds.length) return false;
  // The active fandom is always on the roster, and an unconfirmed reader has
  // no roster to be active in.
  if (value.selectedArtistId !== null && !value.followedArtistIds.includes(value.selectedArtistId)) return false;
  if (value.selectedArtistId === null && value.followedArtistIds.length > 0) return false;
  if (value.artistConfirmed !== (value.selectedArtistId !== null)) return false;
  if (!value.artistConfirmed && value.selectedTerritoryId !== null) return false;
  if (!value.artistConfirmed && (value.activeTab !== "explore" || value.selectedExpeditionId !== null)) return false;
  if (!value.artistConfirmed && value.activeExpeditionId !== null) return false;
  if (value.activeExpeditionId !== null) {
    const active = previewContent.expeditions.find((candidate) => candidate.id === value.activeExpeditionId);
    if (!active || (active.artistId !== null && active.artistId !== value.selectedArtistId)) return false;
  }
  if (value.selectedExpeditionId !== null) {
    // The open route stands on its own territory — the map may be looking
    // somewhere else entirely while the route keeps running.
    const open = previewContent.expeditions.find((candidate) => candidate.id === value.selectedExpeditionId);
    if (!value.selectedArtistId || !open
      || !compatibleExpedition(value.selectedExpeditionId, value.selectedArtistId, open.territoryId)) return false;
  }
  // An open route implies the expedition tab, but the tab may sit empty.
  if (value.selectedExpeditionId !== null && value.activeTab !== "expedition") return false;
  if (value.selectedExpeditionId !== null && value.selectedExpeditionId !== value.activeExpeditionId) return false;

  const derivedCounts = value.approvedCheckIns.reduce<Record<string, number>>((counts, record) => {
    counts[record.placeId] = (counts[record.placeId] ?? 0) + 1;
    return counts;
  }, {});
  const rebuiltTerritories = rebuildTerritories(value.approvedCheckIns);
  return exactJson(value.missionVisitCounts, derivedCounts)
    && value.contributedToday === value.approvedCheckIns.reduce((total, record) => total + record.awardedPoints, 0)
    && exactJson(value.completedExpeditionIds, deriveCompletedExpeditionIds(value.approvedCheckIns))
    && exactJson(value.territories, rebuiltTerritories)
    && exactJson(value.fandoms, recomputeFandoms(rebuiltTerritories));
}

export function parseDemoSession(value: unknown): DemoSession | null {
  // The roster is derivable where it is absent or incomplete: a session saved
  // before it existed followed exactly the one fandom it had chosen, and the
  // active fandom is a member by definition. Filling that in beats rejecting a
  // session that is otherwise sound, which would throw away a whole history.
  const candidate = isRecord(value)
    ? {
      ...value,
      followedArtistIds: rosterOf(value),
      // A session saved before the filter was remembered was showing the
      // default, so that is what it comes back as.
      territoryFilter: TERRITORY_FILTER_IDS.includes(value.territoryFilter as TerritoryFilterId)
        ? value.territoryFilter
        : "my_fandom",
      // Folds saved before they were remembered come back at their defaults.
      disclosures: isRecord(value.disclosures)
        ? Object.fromEntries(Object.entries(value.disclosures).filter(([, open]) => typeof open === "boolean"))
        : {},
    }
    : value;
  return isValidDemoSession(candidate) ? candidate : null;
}

const TERRITORY_FILTER_IDS: readonly TerritoryFilterId[] = ["my_fandom", "contested", "artist_connection", "all"];

function rosterOf(value: Record<string, unknown>) {
  const stored = Array.isArray(value.followedArtistIds) ? value.followedArtistIds.filter(isArtistId) : [];
  const roster = [...new Set(stored)];
  if (!isArtistId(value.selectedArtistId)) return roster.length > 0 && value.selectedArtistId === null ? [] : roster;
  return roster.includes(value.selectedArtistId) ? roster : [...roster, value.selectedArtistId];
}

export function loadDemoSession(storage: Pick<Storage, "getItem">): DemoSession {
  try {
    const raw = storage.getItem(DEMO_SESSION_KEY);
    if (!raw) return createInitialDemoSession();
    if (raw.length > MAX_DEMO_SESSION_CHARS) return createInitialDemoSession();
    const parsed: unknown = JSON.parse(raw);
    return parseDemoSession(parsed) ?? createInitialDemoSession();
  } catch {
    return createInitialDemoSession();
  }
}

export function saveDemoSession(storage: Pick<Storage, "setItem">, state: DemoSession) {
  storage.setItem(DEMO_SESSION_KEY, JSON.stringify(state));
}
