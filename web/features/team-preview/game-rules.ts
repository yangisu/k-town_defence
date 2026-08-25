import type { FandomStanding, StrongholdStage } from "./types";

export const GAME_RULES = {
  dwell30Minutes: 30,
  dwell60Minutes: 60,
  localSpend: 100,
  accommodation: 300,
  dailyCap: 1200,
  repeatDecay: [1, 0.5, 0.25, 0] as const,
  strongholdTreeAt: 1000,
  strongholdLandmarkAt: 3000,
  strongholdVisitBonus: 10,
  strongholdDwellBonus: 20,
  strongholdSpendBonus: 30,
} as const;

export interface MissionAwardInput {
  visitBase: number;
  dwellMinutes: number;
  localSpendVerified: boolean;
  accommodationVerified: boolean;
  balanceMultiplier: number;
  fandomSizeMultiplier: number;
  repeatCount: number;
  contributedToday: number;
  ownerStrongholdStage?: StrongholdStage | null;
}

export interface MissionAward {
  visit: number;
  dwell: number;
  localSpend: number;
  accommodation: number;
  strongholdBonus: number;
  subtotal: number;
  multiplier: number;
  validPoints: number;
  cappedPoints: number;
}

export type RankedFandom = FandomStanding & { rank: number };

function repeatMultiplier(repeatCount: number) {
  return GAME_RULES.repeatDecay[Math.min(Math.max(repeatCount, 0), GAME_RULES.repeatDecay.length - 1)] ?? 0;
}

export function calculateMissionAward(input: MissionAwardInput): MissionAward {
  const visit = input.visitBase;
  const dwell = input.dwellMinutes >= 40
    ? GAME_RULES.dwell60Minutes
    : input.dwellMinutes >= 20
      ? GAME_RULES.dwell30Minutes
      : 0;
  const localSpend = input.localSpendVerified ? GAME_RULES.localSpend : 0;
  const accommodation = input.accommodationVerified ? GAME_RULES.accommodation : 0;
  const strongholdBonus = input.ownerStrongholdStage
    ? GAME_RULES.strongholdVisitBonus
      + (input.ownerStrongholdStage !== "seed" && dwell > 0 ? GAME_RULES.strongholdDwellBonus : 0)
      + (input.ownerStrongholdStage === "landmark" && input.localSpendVerified ? GAME_RULES.strongholdSpendBonus : 0)
    : 0;
  const subtotal = visit + dwell + localSpend + accommodation + strongholdBonus;
  const multiplier = input.balanceMultiplier * input.fandomSizeMultiplier * repeatMultiplier(input.repeatCount);
  const validPoints = Math.round(subtotal * multiplier);
  const cappedPoints = Math.max(0, Math.min(validPoints, GAME_RULES.dailyCap - input.contributedToday));

  return { visit, dwell, localSpend, accommodation, strongholdBonus, subtotal, multiplier, validPoints, cappedPoints };
}

export function stageForPoints(points: number): StrongholdStage {
  if (points >= GAME_RULES.strongholdLandmarkAt) return "landmark";
  if (points >= GAME_RULES.strongholdTreeAt) return "tree";
  return "seed";
}

export function rankFandoms(rows: FandomStanding[]): RankedFandom[] {
  return [...rows]
    .sort((a, b) => b.strongholds - a.strongholds || b.validPoints - a.validPoints)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
