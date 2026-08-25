import type { ArtistId, PreviewTerritory, StrongholdStage } from "@/features/team-preview/types";
import { artists } from "./artists";

const koreaTourismSource = "https://korean.visitkorea.or.kr/";
const populationDeclineSource = "https://www.mois.go.kr/frt/sub/a06/b06/populationDecline/screen.do";
const ownerPointsByStage: Record<StrongholdStage, number> = {
  seed: 920,
  tree: 1800,
  landmark: 3600,
};

function fandomName(artistId: ArtistId) {
  return artists.find((artist) => artist.id === artistId)!.fandomName;
}

function territory(
  id: string,
  ko: string,
  en: string,
  latitude: number,
  longitude: number,
  ownerArtistId: ArtistId,
  strongholdStage: StrongholdStage,
  populationDecline = false,
): PreviewTerritory {
  const challengerArtistId: ArtistId = ownerArtistId === "bts" ? "blackpink" : "bts";
  return {
    id,
    name: { ko, en },
    centroid: { latitude, longitude },
    populationDecline,
    balanceMultiplier: populationDecline ? 1.8 : 1,
    balanceReason: populationDecline
      ? { ko: "행정안전부 인구감소지역 지정에 따른 지역균형 보너스", en: "Regional-balance bonus for a Ministry of the Interior and Safety population-decline designation" }
      : { ko: "기본 지역균형 배율", en: "Standard regional-balance multiplier" },
    sourceUrls: populationDecline ? [populationDeclineSource, koreaTourismSource] : [koreaTourismSource],
    ownerArtistId,
    strongholdStage,
    standings: [
      { artistId: ownerArtistId, fandomName: fandomName(ownerArtistId), validPoints: ownerPointsByStage[strongholdStage] },
      { artistId: challengerArtistId, fandomName: fandomName(challengerArtistId), validPoints: 840 },
    ],
  };
}

export const territories: PreviewTerritory[] = [
  territory("busan", "부산", "Busan", 35.1796, 129.0756, "bts", "seed"),
  territory("daegu", "대구", "Daegu", 35.8714, 128.6014, "bts", "tree"),
  territory("gwangju", "광주", "Gwangju", 35.1595, 126.8526, "boynextdoor", "landmark"),
  territory("gunpo", "군포", "Gunpo", 37.3617, 126.9352, "blackpink", "seed"),
  territory("seongnam", "성남", "Seongnam", 37.4200, 127.1267, "blackpink", "tree"),
  territory("geoje", "거제", "Geoje", 34.8806, 128.6211, "rescene", "tree"),
  territory("suwon", "수원", "Suwon", 37.2636, 127.0286, "aespa", "landmark"),
  territory("gyeongju", "경주", "Gyeongju", 35.8562, 129.2247, "rescene", "landmark"),
  territory("daejeon", "대전", "Daejeon", 36.3504, 127.3845, "ive", "seed"),
  territory("seoul", "서울", "Seoul", 37.5665, 126.9780, "iu", "landmark"),
  territory("yongin", "용인", "Yongin", 37.2411, 127.1776, "btob", "seed"),
  territory("goyang", "고양", "Goyang", 37.6584, 126.8320, "btob", "tree"),
  territory("incheon", "인천", "Incheon", 37.4563, 126.7052, "ive", "tree"),
  territory("jeju", "제주", "Jeju", 33.4996, 126.5312, "ive", "landmark"),
  territory("ulsan", "울산", "Ulsan", 35.5384, 129.3114, "riize", "seed"),
  territory("siheung", "시흥", "Siheung", 37.3800, 126.8029, "riize", "tree"),
  territory("cheonan", "천안", "Cheonan", 36.8151, 127.1139, "zerobaseone", "seed"),
  territory("pohang", "포항", "Pohang", 36.0190, 129.3435, "zerobaseone", "tree"),
  territory("wonju", "원주", "Wonju", 37.3422, 127.9202, "boynextdoor", "seed"),
  territory("chuncheon", "춘천", "Chuncheon", 37.8813, 127.7300, "newjeans", "seed"),
  territory("uijeongbu", "의정부", "Uijeongbu", 37.7381, 127.0337, "iu", "tree"),
  territory("namyangju", "남양주", "Namyangju", 37.6360, 127.2165, "seventeen", "landmark"),
  territory("yeongwol", "영월", "Yeongwol", 37.1836, 128.4618, "bts", "landmark", true),
];
