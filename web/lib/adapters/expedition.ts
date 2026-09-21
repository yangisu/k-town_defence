import type { PersistedExpedition } from "@/lib/domain";
import type { PreviewMissionPlace, TerritoryId } from "@/features/team-preview/types";

export const territoryRegionCodes: Record<string, string> = {
  seoul: "1", incheon: "2", daejeon: "3", daegu: "4", gwangju: "5", busan: "6", ulsan: "7",
  suwon: "31", gunpo: "31", seongnam: "31", yongin: "31", goyang: "31", siheung: "31",
  uijeongbu: "31", namyangju: "31", chuncheon: "32", wonju: "32", yeongwol: "32",
  cheonan: "34", gyeongju: "35", pohang: "35", geoje: "36", jeju: "39",
};

export function liveMissionPlaces(value: PersistedExpedition, territoryId: TerritoryId): PreviewMissionPlace[] {
  return value.stops.flatMap(({ place, kind, evidence }) => {
    if (place.latitude == null || place.longitude == null) return [];
    return [{
      id: place.id, territoryId, name: { ko: place.nameKo, en: place.nameKo }, category: place.category,
      relationship: kind === "anchor" ? "artist_connection" : "nearby_recommendation", artistConnectionId: null, evidenceClass: null, access: "public",
      description: { ko: place.description, en: place.description }, address: { ko: place.address, en: place.address },
      coordinates: { latitude: place.latitude, longitude: place.longitude },
      transport: { summary: { ko: place.transit, en: place.transit }, nearestStation: { ko: "", en: "" }, accessibilityNote: { ko: "", en: "" } },
      dwellMinutes: place.dwellMinutes, visitBase: place.points,
      localBenefit: {
        ko: evidence?.source === "KTOUR_RELATED_ATTRACTION" ? "방문 데이터 기반" : evidence ? "동선 주변 추천" : place.localBenefit ?? "지역 방문 기여",
        en: evidence?.source === "KTOUR_RELATED_ATTRACTION" ? "Based on visit data" : evidence ? "Recommended near the route" : place.localBenefit ?? "Local visit contribution",
      },
      sourceUrls: place.homepageUrl ? [place.homepageUrl] : ["https://korean.visitkorea.or.kr/"], sources: [],
    }];
  });
}
