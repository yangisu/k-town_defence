import { previewContent } from "./content";
import { GAME_RULES, stageForPoints, type MissionAward } from "./game-rules";
import type { ArtistId, FandomStanding, Locale, PreviewTerritory, TerritoryId } from "./types";

export const DEMO_SESSION_VERSION = 1;
export const DEMO_SESSION_KEY = "ktown-team-preview-v1";

export interface DemoSession {
  version: typeof DEMO_SESSION_VERSION;
  locale: Locale;
  selectedArtistId: ArtistId;
  selectedTerritoryId: TerritoryId;
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
      strongholds: owned.filter((territory) => territory.strongholdStage !== "seed").length,
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
    locale: "en",
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
  if (!mission || award.cappedPoints <= 0) return state;

  const territories = state.territories.map((territory) => {
    if (territory.id !== mission.territoryId) return territory;
    const existing = territory.standings.find((standing) => standing.artistId === state.selectedArtistId);
    const standings = existing
      ? territory.standings.map((standing) => standing.artistId === state.selectedArtistId
        ? { ...standing, validPoints: standing.validPoints + award.cappedPoints }
        : standing)
      : [...territory.standings, {
        artistId: state.selectedArtistId,
        fandomName: getArtistFandom(state.selectedArtistId),
        validPoints: award.cappedPoints,
      }];
    return recomputeTerritory({ ...territory, standings });
  });

  return {
    ...state,
    territories,
    fandoms: recomputeFandoms(territories),
    completedMissionIds: [...new Set([...state.completedMissionIds, missionId])],
    missionVisitCounts: { ...state.missionVisitCounts, [missionId]: (state.missionVisitCounts[missionId] ?? 0) + 1 },
    contributedToday: Math.min(GAME_RULES.dailyCap, state.contributedToday + award.cappedPoints),
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

export function saveDemoSession(storage: Pick<Storage, "setItem">, state: DemoSession) {
  storage.setItem(DEMO_SESSION_KEY, JSON.stringify(state));
}
