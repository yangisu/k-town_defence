import { previewContent } from "./content";
import { GAME_RULES, stageForPoints, type MissionAward } from "./game-rules";
import type { ArtistId, FandomStanding, Locale, PreviewTerritory, TerritoryId } from "./types";

export const DEMO_SESSION_VERSION = 1;
export const DEMO_SESSION_KEY = "ktown-team-preview-v1";

export interface DemoSession {
  version: typeof DEMO_SESSION_VERSION;
  locale: Locale;
  selectedArtistId: ArtistId | null;
  selectedTerritoryId: TerritoryId | null;
  territories: PreviewTerritory[];
  fandoms: FandomStanding[];
  completedMissionIds: string[];
  missionVisitCounts: Record<string, number>;
  contributedToday: number;
}

export type DemoSessionAction =
  | { type: "selectArtist"; artistId: ArtistId }
  | { type: "selectTerritory"; territoryId: TerritoryId }
  | { type: "setLocale"; locale: Locale }
  | { type: "completeMission"; missionId: string; award: MissionAward }
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

function recomputeTerritory(territory: PreviewTerritory): PreviewTerritory {
  const owner = territory.standings.find((standing) => standing.artistId === territory.ownerArtistId)!;
  const leader = territory.standings.reduce((best, standing) => standing.validPoints > best.validPoints ? standing : best);
  const ownerArtistId = leader.validPoints > owner.validPoints ? leader.artistId : territory.ownerArtistId;
  const ownerPoints = territory.standings.find((standing) => standing.artistId === ownerArtistId)!.validPoints;
  return { ...territory, ownerArtistId, strongholdStage: stageForPoints(ownerPoints) };
}

function recomputeFandoms(territories: PreviewTerritory[]): FandomStanding[] {
  return previewContent.artists.map((artist) => {
    const owned = territories.filter((territory) => territory.ownerArtistId === artist.id);
    return {
      artistId: artist.id,
      fandomName: artist.fandomName,
      strongholds: owned.length,
      validPoints: territories.reduce(
        (total, territory) => total + (territory.standings.find((standing) => standing.artistId === artist.id)?.validPoints ?? 0),
        0,
      ),
      trend: "same",
    };
  });
}

export function createInitialDemoSession(): DemoSession {
  const territories = copyTerritories().map(recomputeTerritory);
  return {
    version: DEMO_SESSION_VERSION,
    locale: "ko",
    selectedArtistId: "bts",
    selectedTerritoryId: "busan",
    territories,
    fandoms: recomputeFandoms(territories),
    completedMissionIds: [],
    missionVisitCounts: {},
    contributedToday: 0,
  };
}

export function applyMissionImpact(state: DemoSession, missionId: string, award: MissionAward): DemoSession {
  const mission = previewContent.places.find((place) => place.id === missionId);
  const artistId = state.selectedArtistId;
  const actualApplied = Math.min(
    Math.max(Number.isFinite(award.cappedPoints) ? award.cappedPoints : 0, 0),
    Math.max(GAME_RULES.dailyCap - state.contributedToday, 0),
  );
  if (!mission || artistId === null || actualApplied <= 0) return state;

  const territories = state.territories.map((territory) => {
    if (territory.id !== mission.territoryId) return territory;
    const existing = territory.standings.find((standing) => standing.artistId === artistId);
    const standings = existing
      ? territory.standings.map((standing) => standing.artistId === artistId
        ? { ...standing, validPoints: standing.validPoints + actualApplied }
        : standing)
      : [...territory.standings, {
        artistId,
        fandomName: getArtistFandom(artistId),
        validPoints: actualApplied,
      }];
    return recomputeTerritory({ ...territory, standings });
  });

  return {
    ...state,
    territories,
    fandoms: recomputeFandoms(territories),
    completedMissionIds: [...new Set([...state.completedMissionIds, missionId])],
    missionVisitCounts: { ...state.missionVisitCounts, [missionId]: (state.missionVisitCounts[missionId] ?? 0) + 1 },
    contributedToday: state.contributedToday + actualApplied,
  };
}

export function demoSessionReducer(state: DemoSession, action: DemoSessionAction): DemoSession {
  switch (action.type) {
    case "selectArtist": return { ...state, selectedArtistId: action.artistId };
    case "selectTerritory": return { ...state, selectedTerritoryId: action.territoryId };
    case "setLocale": return { ...state, locale: action.locale };
    case "completeMission": return applyMissionImpact(state, action.missionId, action.award);
    case "hydrate": return action.state;
    case "reset": return createInitialDemoSession();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeFinite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

const artistIds = new Set<ArtistId>(previewContent.artists.map((artist) => artist.id));
const territoryIds = new Set<TerritoryId>(previewContent.territories.map((territory) => territory.id));
const missionIds = new Set(previewContent.places.map((place) => place.id));

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
  return value.standings.every((standing) => isRecord(standing)
    && isArtistId(standing.artistId)
    && typeof standing.fandomName === "string"
    && isNonNegativeFinite(standing.validPoints));
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
    && typeof value.fandomName === "string"
    && Number.isInteger(value.strongholds)
    && isNonNegativeFinite(value.strongholds)
    && isNonNegativeFinite(value.validPoints)
    && ["up", "down", "same"].includes(value.trend as string);
}

function isValidDemoSession(value: unknown): value is DemoSession {
  if (!isRecord(value)
    || value.version !== DEMO_SESSION_VERSION
    || (value.locale !== "ko" && value.locale !== "en")
    || (value.selectedArtistId !== null && !isArtistId(value.selectedArtistId))
    || (value.selectedTerritoryId !== null && !isTerritoryId(value.selectedTerritoryId))
    || !Array.isArray(value.territories)
    || !value.territories.every(isValidTerritory)
    || !hasExactIds(value.territories, territoryIds, (territory) => isRecord(territory) && isTerritoryId(territory.id) ? territory.id : null)
    || !Array.isArray(value.fandoms)
    || !value.fandoms.every(isValidFandom)
    || !hasExactIds(value.fandoms, artistIds, (fandom) => isRecord(fandom) && isArtistId(fandom.artistId) ? fandom.artistId : null)
    || !Array.isArray(value.completedMissionIds)
    || !value.completedMissionIds.every((missionId) => typeof missionId === "string" && missionIds.has(missionId))
    || new Set(value.completedMissionIds).size !== value.completedMissionIds.length
    || !isRecord(value.missionVisitCounts)
    || !Object.entries(value.missionVisitCounts).every(([missionId, count]) => missionIds.has(missionId) && Number.isInteger(count) && isNonNegativeFinite(count))
    || !isNonNegativeFinite(value.contributedToday)
    || value.contributedToday > GAME_RULES.dailyCap) return false;

  return value.completedMissionIds.every((missionId) => (value.missionVisitCounts[missionId] ?? 0) > 0);
}

export function loadDemoSession(storage: Pick<Storage, "getItem">): DemoSession {
  try {
    const raw = storage.getItem(DEMO_SESSION_KEY);
    if (!raw) return createInitialDemoSession();
    const parsed: unknown = JSON.parse(raw);
    return isValidDemoSession(parsed) ? parsed : createInitialDemoSession();
  } catch {
    return createInitialDemoSession();
  }
}

export function saveDemoSession(storage: Pick<Storage, "setItem">, state: DemoSession) {
  storage.setItem(DEMO_SESSION_KEY, JSON.stringify(state));
}
