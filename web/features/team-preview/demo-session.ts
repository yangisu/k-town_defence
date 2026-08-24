import type { AppTab } from "@/features/app-controller";
import { getArtistHomeTerritories, previewContent } from "./content";
import { GAME_RULES, stageForPoints, type MissionAward } from "./game-rules";
import { selectRecommendedExpedition } from "./expedition-selection";
import type { ArtistId, FandomStanding, Locale, PreviewTerritory, StrongholdStage, TerritoryId } from "./types";

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
  selectedTerritoryId: TerritoryId | null;
  activeTab: AppTab;
  selectedExpeditionId: string | null;
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
  | { type: "selectTerritory"; territoryId: TerritoryId }
  | { type: "changeTab"; tab: AppTab }
  | { type: "openExpedition"; expeditionId: string }
  | { type: "openRecommendedExpedition"; expeditionId: string; territoryId: TerritoryId }
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
    selectedTerritoryId: null,
    activeTab: "explore",
    selectedExpeditionId: null,
    territories,
    fandoms: recomputeFandoms(territories),
    completedExpeditionIds: [],
    approvedCheckIns: [],
    missionVisitCounts: {},
    contributedToday: 0,
  };
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
  const actualApplied = Math.min(
    Math.max(Number.isFinite(award.cappedPoints) ? award.cappedPoints : 0, 0),
    Math.max(GAME_RULES.dailyCap - state.contributedToday, 0),
  );
  if (!expedition || !place || place.territoryId !== expedition.territoryId || !expedition.stopIds.includes(place.id) || actualApplied <= 0) return state;

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
        selectedTerritoryId: null,
        activeTab: "explore",
        selectedExpeditionId: null,
      };
    case "changeProfile": {
      if (state.artistConfirmed && state.selectedArtistId === action.artistId) return state;
      const territory = selectProfileTerritory(action.artistId, state.territories);
      return {
        ...state,
        artistConfirmed: true,
        selectedArtistId: action.artistId,
        selectedTerritoryId: territory?.id ?? null,
        activeTab: "explore",
        selectedExpeditionId: null,
      };
    }
    case "selectTerritory":
      return state.artistConfirmed
        ? { ...state, selectedTerritoryId: action.territoryId, activeTab: "explore", selectedExpeditionId: null }
        : state;
    case "changeTab": {
      if (action.tab !== "expedition") return { ...state, activeTab: action.tab, selectedExpeditionId: null };
      if (!state.selectedArtistId) return state;
      const anchorTerritoryId = state.selectedTerritoryId
        ?? selectProfileTerritory(state.selectedArtistId, state.territories)?.id
        ?? null;
      if (!anchorTerritoryId) return state;
      const recommended = selectRecommendedExpedition(state.selectedArtistId, anchorTerritoryId);
      return recommended ? {
        ...state,
        selectedTerritoryId: recommended.territoryId,
        activeTab: "expedition",
        selectedExpeditionId: recommended.expedition.id,
      } : state;
    }
    case "openExpedition": {
      if (!state.selectedArtistId || !state.selectedTerritoryId) return state;
      const expedition = compatibleExpedition(action.expeditionId, state.selectedArtistId, state.selectedTerritoryId);
      return expedition ? { ...state, activeTab: "expedition", selectedExpeditionId: expedition.id } : state;
    }
    case "openRecommendedExpedition": {
      if (!state.artistConfirmed || !state.selectedArtistId) return state;
      const expedition = compatibleExpedition(action.expeditionId, state.selectedArtistId, action.territoryId);
      return expedition && expedition.territoryId === action.territoryId
        ? {
            ...state,
            selectedTerritoryId: action.territoryId,
            selectedExpeditionId: expedition.id,
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

function isValidDemoSession(value: unknown): value is DemoSession {
  if (!isRecord(value)
    || value.version !== DEMO_SESSION_VERSION
    || (value.locale !== "ko" && value.locale !== "en")
    || typeof value.artistConfirmed !== "boolean"
    || (value.selectedArtistId !== null && !isArtistId(value.selectedArtistId))
    || (value.selectedTerritoryId !== null && !isTerritoryId(value.selectedTerritoryId))
    || !["explore", "expedition", "battle", "journey"].includes(value.activeTab as string)
    || (value.selectedExpeditionId !== null && (typeof value.selectedExpeditionId !== "string" || !expeditionIds.has(value.selectedExpeditionId)))
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
    || !isNonNegativeFinite(value.contributedToday)
    || value.contributedToday > GAME_RULES.dailyCap) return false;

  if (value.artistConfirmed !== (value.selectedArtistId !== null)) return false;
  if (!value.artistConfirmed && value.selectedTerritoryId !== null) return false;
  if (!value.artistConfirmed && (value.activeTab !== "explore" || value.selectedExpeditionId !== null)) return false;
  if (value.selectedExpeditionId !== null) {
    if (!value.selectedArtistId || !value.selectedTerritoryId
      || !compatibleExpedition(value.selectedExpeditionId, value.selectedArtistId, value.selectedTerritoryId)) return false;
  }
  if ((value.activeTab === "expedition") !== (value.selectedExpeditionId !== null)) return false;

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

export function loadDemoSession(storage: Pick<Storage, "getItem">): DemoSession {
  try {
    const raw = storage.getItem(DEMO_SESSION_KEY);
    if (!raw) return createInitialDemoSession();
    if (raw.length > MAX_DEMO_SESSION_CHARS) return createInitialDemoSession();
    const parsed: unknown = JSON.parse(raw);
    return isValidDemoSession(parsed) ? parsed : createInitialDemoSession();
  } catch {
    return createInitialDemoSession();
  }
}

export function saveDemoSession(storage: Pick<Storage, "setItem">, state: DemoSession) {
  storage.setItem(DEMO_SESSION_KEY, JSON.stringify(state));
}
