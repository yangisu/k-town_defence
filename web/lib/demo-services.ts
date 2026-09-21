import type { AppServices, CheckInResult, CheckInSession, MembershipService } from "./domain";
import { battles, expeditions, journey, leaderboard, places, regions } from "./demo-data";
import { previewContent } from "@/features/team-preview/content";

const clone = <T,>(value: T): T => structuredClone(value);
let restoredSession: CheckInSession | null = null;
const demoFandoms = [
  { id: "10000000-0000-4000-8000-000000000001", name: "ARMY", artistName: "방탄소년단" },
  { id: "10000000-0000-4000-8000-000000000002", name: "BLINK", artistName: "BLACKPINK" },
  { id: "10000000-0000-4000-8000-000000000003", name: "CARAT", artistName: "SEVENTEEN" },
];
function createDemoMembership(): MembershipService {
  let current: Awaited<ReturnType<MembershipService["getCurrent"]>> = null;
  return {
    async listFandoms() { return clone(demoFandoms); },
    async getCurrent() { return clone(current); },
    async selectFandom(fandomId) {
      current ??= { userId: "30000000-0000-4000-8000-000000000001", seasonId: "20000000-0000-4000-8000-000000000001", fandomId, lockedAt: new Date().toISOString() };
      return clone(current);
    },
  };
}

export const services: AppServices = {
  territories: {
    async list() {
      return clone(previewContent.territories.map((territory) => ({
        id: territory.id,
        nameKo: territory.name.ko,
        nameEn: territory.name.en,
        latitude: territory.centroid.latitude,
        longitude: territory.centroid.longitude,
        populationDecline: territory.populationDecline,
        balanceMultiplier: territory.balanceMultiplier,
        balanceReasonKo: territory.balanceReason.ko,
        balanceReasonEn: territory.balanceReason.en,
        ownerFandomId: demoFandoms.find((fandom) => fandom.name === previewContent.artists.find((artist) => artist.id === territory.ownerArtistId)?.fandomName)?.id ?? demoFandoms[0].id,
        strongholdStage: territory.strongholdStage,
        standings: territory.standings.map((standing) => ({
          fandomId: demoFandoms.find((fandom) => fandom.name === standing.fandomName)?.id ?? standing.artistId,
          fandomName: standing.fandomName,
          artistName: previewContent.artists.find((artist) => artist.id === standing.artistId)?.artistName.ko ?? null,
          validPoints: standing.validPoints,
        })),
      })));
    },
  },
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
    async getPlace(placeId) {
      const place = places.find((item) => item.id === placeId);
      if (!place) throw new Error("PLACE_NOT_FOUND");
      return clone(place);
    },
    async getRecommendedExpedition(filter) {
      const stops = places.filter((place) => place.regionId === "busan").slice(0, filter.limit);
      return clone({
        id: "demo-busan-expedition", title: "부산 로컬 원정", regionCode: filter.regionCode,
        keyword: filter.keyword, travelDate: filter.travelDate, dataUpdatedAt: new Date().toISOString(),
        stops: stops.map((place, index) => ({
          order: index + 1, distanceKm: index * 0.8,
          reasons: [index === 0 && filter.keyword ? "키워드 일치" : "다른 유형의 지역 명소"], place,
        })),
      });
    },
    async getOpenDataStatus() {
      return { label: "관광 OpenAPI", lastSuccessfulSyncAt: new Date().toISOString(), activePlaceCount: places.length, operations: [] };
    },
  },
  expeditions: {
    async listByRegion(regionId) { return clone(expeditions.filter((item) => item.regionId === regionId)); },
    async get(expeditionId) {
      const expedition = expeditions.find((item) => item.id === expeditionId);
      if (!expedition) throw new Error("EXPEDITION_NOT_FOUND");
      return clone(expedition);
    },
    async start(recommendationId, filter) {
      const recommendation = await services.tourism.getRecommendedExpedition(filter);
      return clone({
        ...recommendation,
        id: `persisted-${recommendationId}`,
        recommendationId,
        territoryId: "busan",
        status: "active" as const,
        createdAt: new Date().toISOString(),
      });
    },
    async current() { return null; },
    async abandon(expeditionId) {
      throw new Error(`EXPEDITION_NOT_FOUND:${expeditionId}`);
    },
    async complete(expeditionId) {
      throw new Error(`EXPEDITION_NOT_FOUND:${expeditionId}`);
    },
  },
  checkIn: {
    async create(placeId) {
      restoredSession = { id: `demo-${placeId}`, placeId, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
      return clone(restoredSession);
    },
    async restore() { return clone(restoredSession); },
    async recordGps() {},
    async recordPhoto() {},
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
  membership: createDemoMembership(),
};

export function createDemoServices(): AppServices {
  return { ...services, membership: createDemoMembership() };
}
