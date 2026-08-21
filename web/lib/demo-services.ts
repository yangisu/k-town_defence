import type { AppServices, CheckInResult, CheckInSession } from "./domain";
import { battles, expeditions, journey, leaderboard, places, regions } from "./demo-data";

const clone = <T,>(value: T): T => structuredClone(value);
let restoredSession: CheckInSession | null = null;

export const services: AppServices = {
  tourism: {
    async listRegions() { return clone(regions); },
    async getRegion(regionId) {
      const region = regions.find((item) => item.id === regionId);
      if (!region) throw new Error("REGION_NOT_FOUND");
      return clone(region);
    },
    async listPlaces(filter) {
      return clone(places.filter((place) => (!filter.regionId || place.regionId === filter.regionId) && (!filter.category || place.category === filter.category)));
    },
  },
  expeditions: {
    async listByRegion(regionId) { return clone(expeditions.filter((item) => item.regionId === regionId)); },
    async get(expeditionId) {
      const expedition = expeditions.find((item) => item.id === expeditionId);
      if (!expedition) throw new Error("EXPEDITION_NOT_FOUND");
      return clone(expedition);
    },
  },
  checkIn: {
    async create(placeId) {
      restoredSession = { id: `demo-${placeId}`, placeId, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
      return clone(restoredSession);
    },
    async restore() { return clone(restoredSession); },
    async submit(): Promise<CheckInResult> {
      return { decision: "approved", awardedPoints: 120, pointsToCapture: 300, message: "부산 여행에 120P를 보탰어요" };
    },
  },
  battle: {
    async getRegion(regionId) {
      const battle = battles[regionId];
      if (!battle) throw new Error("BATTLE_NOT_FOUND");
      return clone(battle);
    },
    async getLeaderboard() { return clone(leaderboard); },
    async getJourney() { return clone(journey); },
  },
};
