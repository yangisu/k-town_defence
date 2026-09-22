import type { PersistedExpedition } from "@/lib/domain";
import type { PreviewMissionPlace, TerritoryId } from "@/features/team-preview/types";
import { englishPlaceName } from "@/features/team-preview/korean-name";

export const territoryRegionCodes: Record<string, string> = {
  seoul: "1", incheon: "2", daejeon: "3", daegu: "4", gwangju: "5", busan: "6", ulsan: "7",
  suwon: "31", gunpo: "31", seongnam: "31", yongin: "31", goyang: "31", siheung: "31",
  uijeongbu: "31", namyangju: "31", chuncheon: "32", wonju: "32", yeongwol: "32",
  cheonan: "34", gyeongju: "35", pohang: "35", geoje: "36", jeju: "39",
};

// The live KTOUR catalog is only synced for Busan today (see
// `sync_ktour --area-code 6` in the README), so any other region's
// recommended-expedition call is guaranteed to 404 with "no expedition
// candidates". Callers use this to fall back to the local preview route
// instead of making a call the backend cannot answer.
export const LIVE_EXPEDITION_REGION_CODE = "6";

export function hasLiveExpeditionData(territoryId: string): boolean {
  return territoryRegionCodes[territoryId] === LIVE_EXPEDITION_REGION_CODE;
}

export function liveMissionPlaces(value: PersistedExpedition, territoryId: TerritoryId): PreviewMissionPlace[] {
  return value.stops.flatMap(({ place }) => {
    if (place.latitude == null || place.longitude == null) return [];
    return [{
      id: place.id, territoryId, name: { ko: place.nameKo, en: englishPlaceName(place.nameKo) }, category: place.category,
      relationship: "nearby_recommendation", artistConnectionId: null, evidenceClass: null, access: "public",
      description: { ko: place.description, en: place.description }, address: { ko: place.address, en: place.address },
      coordinates: { latitude: place.latitude, longitude: place.longitude },
      transport: { summary: { ko: place.transit, en: place.transit }, nearestStation: { ko: "", en: "" }, accessibilityNote: { ko: "", en: "" } },
      dwellMinutes: place.dwellMinutes, visitBase: place.points,
      localBenefit: { ko: place.localBenefit ?? "지역 방문 기여", en: place.localBenefit ?? "Local visit contribution" },
      sourceUrls: place.homepageUrl ? [place.homepageUrl] : ["https://korean.visitkorea.or.kr/"], sources: [],
    }];
  });
}
