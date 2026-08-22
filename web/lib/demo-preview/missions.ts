import type { ArtistId, MissionPlaceId, PreviewExpedition, PreviewMissionPlace, TerritoryId } from "@/features/team-preview/types";

type PlaceSeed = Omit<PreviewMissionPlace, "id" | "territoryId" | "relationship" | "artistConnectionId" | "evidenceClass" | "description" | "transport" | "dwellMinutes" | "visitBase" | "localBenefit">;
type TerritoryStops = { territoryId: TerritoryId; stops: readonly [PlaceSeed, PlaceSeed] };

const nearbyDescription = { ko: "아티스트와의 직접 연관을 주장하지 않는, 지역의 공공 관광 추천지입니다.", en: "A public tourism recommendation in the region that makes no direct artist-connection claim." };
const publicTransport = {
  summary: { ko: "대중교통으로 접근 가능한 공공 관광지", en: "A public attraction reachable by local transit" },
  nearestStation: { ko: "인근 버스·철도 정류장", en: "Nearby bus or rail stop" },
  accessibilityNote: { ko: "방문 전 공식 페이지에서 운영시간과 무장애 동선을 확인하세요.", en: "Check operating hours and accessible routes on the official page before visiting." },
};

const territoryStops: TerritoryStops[] = [
  { territoryId: "busan", stops: [
    { name: { ko: "감천문화마을", en: "Gamcheon Culture Village" }, category: "culture", address: { ko: "부산광역시 사하구 감내1로 200", en: "200 Gamnae 1-ro, Saha-gu, Busan" }, coordinates: { latitude: 35.0977, longitude: 129.0104 }, sourceUrls: ["https://saha.go.kr/portalEn/contents.do?mId=0201000000"] },
    { name: { ko: "자갈치시장", en: "Jagalchi Market" }, category: "local_food", address: { ko: "부산광역시 중구 자갈치해안로 52", en: "52 Jagalchihaean-ro, Jung-gu, Busan" }, coordinates: { latitude: 35.0968, longitude: 129.0303 }, sourceUrls: ["https://www.visitbusan.net/en/index.do?lang_cd=en&menuCd=DOM_000000303011001000&uc_seq=412"] },
  ] },
  { territoryId: "gunpo", stops: [
    { name: { ko: "수리산", en: "Surisan Mountain" }, category: "culture", address: { ko: "경기도 군포시 수리산로", en: "Surisan-ro, Gunpo-si, Gyeonggi-do" }, coordinates: { latitude: 37.3476, longitude: 126.9277 }, sourceUrls: ["https://gunpo.go.kr/tour/contents.do?key=2160"] },
    { name: { ko: "초막골생태공원", en: "Chomakgol Ecological Park" }, category: "culture", address: { ko: "경기도 군포시 초막골길 216", en: "216 Chomakgol-gil, Gunpo-si, Gyeonggi-do" }, coordinates: { latitude: 37.3424, longitude: 126.9265 }, sourceUrls: ["https://www.gunpo.go.kr/chomakgol/contents.do?key=2284"] },
  ] },
  { territoryId: "geoje", stops: [
    { name: { ko: "바람의 언덕", en: "Windy Hill" }, category: "culture", address: { ko: "경상남도 거제시 남부면 갈곶리 산14-47", en: "San 14-47, Galgot-ri, Nambu-myeon, Geoje-si" }, coordinates: { latitude: 34.7127, longitude: 128.6669 }, sourceUrls: ["https://english.visitkorea.or.kr/svc/whereToGo/locIntrdn/rgnContentsView.do?vcontsId=77569"] },
    { name: { ko: "거제도 포로수용소 유적공원", en: "Geoje P.O.W. Camp Historic Park" }, category: "culture", address: { ko: "경상남도 거제시 계룡로 61", en: "61 Gyeryong-ro, Geoje-si, Gyeongsangnam-do" }, coordinates: { latitude: 34.8639, longitude: 128.6239 }, sourceUrls: ["https://www.geoje.go.kr/user/smarttour/view.geoje?basicSid=73&menuCd="] },
  ] },
  { territoryId: "daejeon", stops: [
    { name: { ko: "한밭수목원", en: "Hanbat Arboretum" }, category: "culture", address: { ko: "대전광역시 서구 둔산대로 169", en: "169 Dunsan-daero, Seo-gu, Daejeon" }, coordinates: { latitude: 36.3665, longitude: 127.3871 }, sourceUrls: ["https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=82059"] },
    { name: { ko: "엑스포과학공원", en: "Expo Science Park" }, category: "culture", address: { ko: "대전광역시 유성구 엑스포로 107", en: "107 Expo-ro, Yuseong-gu, Daejeon" }, coordinates: { latitude: 36.3745, longitude: 127.3866 }, sourceUrls: ["https://www.dime.or.kr/kor/page.do?menuIdx=654"] },
  ] },
  { territoryId: "suwon", stops: [
    { name: { ko: "수원화성", en: "Suwon Hwaseong Fortress" }, category: "culture", address: { ko: "경기도 수원시 팔달구 정조로 825", en: "825 Jeongjo-ro, Paldal-gu, Suwon" }, coordinates: { latitude: 37.2821, longitude: 127.0188 }, sourceUrls: ["https://www.suwon.go.kr/web/visitsuwon/hs01/hs01-01/pages.do?seqNo=35"] },
    { name: { ko: "화성행궁", en: "Hwaseong Haenggung Palace" }, category: "culture", address: { ko: "경기도 수원시 팔달구 정조로 825", en: "825 Jeongjo-ro, Paldal-gu, Suwon" }, coordinates: { latitude: 37.2800, longitude: 127.0141 }, sourceUrls: ["https://www.visitsuwon.or.kr/base/contents/view?contentsNo=2&menuLevel=3&menuNo=4"] },
  ] },
  { territoryId: "ulsan", stops: [
    { name: { ko: "장생포고래문화마을", en: "Jangsaengpo Whale Culture Village" }, category: "culture", address: { ko: "울산광역시 남구 장생포고래로 271-1", en: "271-1 Jangsaengpogorae-ro, Nam-gu, Ulsan" }, coordinates: { latitude: 35.5033, longitude: 129.3834 }, sourceUrls: ["https://english.visitkorea.or.kr/svc/contents/contentsView.do?menuSn=351&vcontsId=68966"] },
    { name: { ko: "장생포고래박물관", en: "Jangsaengpo Whale Museum" }, category: "culture", address: { ko: "울산광역시 남구 장생포고래로 244", en: "244 Jangsaengpogorae-ro, Nam-gu, Ulsan" }, coordinates: { latitude: 35.5041, longitude: 129.3838 }, sourceUrls: ["https://www.ulsannamgu.go.kr/eng/contents/visiting/whale_tourism.do"] },
  ] },
  { territoryId: "cheonan", stops: [
    { name: { ko: "독립기념관", en: "The Independence Hall of Korea" }, category: "culture", address: { ko: "충청남도 천안시 동남구 목천읍 독립기념관로 1", en: "1 Dongnipginyeomgwan-ro, Dongnam-gu, Cheonan-si" }, coordinates: { latitude: 36.7809, longitude: 127.2313 }, sourceUrls: ["https://english.visitkorea.or.kr/svc/contents/contentsView.do?menuSn=351&vcontsId=106450"] },
    { name: { ko: "아라리오갤러리 천안", en: "Arario Gallery Cheonan" }, category: "culture", address: { ko: "충청남도 천안시 동남구 만남로 43", en: "43 Mannam-ro, Dongnam-gu, Cheonan-si" }, coordinates: { latitude: 36.8187, longitude: 127.1569 }, sourceUrls: ["https://mng.cheonan.go.kr/prog/tursmCn/tour/sub01_05_03/view.do?cntno=25&pageIndex=4"] },
  ] },
  { territoryId: "wonju", stops: [
    { name: { ko: "소금산 그랜드밸리", en: "Sogeumsan Grand Valley" }, category: "culture", address: { ko: "강원특별자치도 원주시 지정면 소금산로 12", en: "12 Sogeumsan-ro, Jijeong-myeon, Wonju-si" }, coordinates: { latitude: 37.3661, longitude: 127.8307 }, sourceUrls: ["https://www.visitgw2526.kr/theme/pilgrim/img/lang/eb-en.pdf"] },
    { name: { ko: "원주역사박물관", en: "Wonju History Museum" }, category: "culture", address: { ko: "강원특별자치도 원주시 봉산로 134", en: "134 Bongsan-ro, Wonju-si" }, coordinates: { latitude: 37.3596, longitude: 127.9494 }, sourceUrls: ["https://www.wonju.go.kr/tour/viewTnResrceDataT.do?key=5477&resrceNo=4011&tc10="] },
  ] },
  { territoryId: "seoul", stops: [
    { name: { ko: "경복궁", en: "Gyeongbokgung Palace" }, category: "culture", address: { ko: "서울특별시 종로구 사직로 161", en: "161 Sajik-ro, Jongno-gu, Seoul" }, coordinates: { latitude: 37.5796, longitude: 126.9770 }, sourceUrls: ["https://royal.khs.go.kr/ROYAL/contents/R707000000.do?schGroupCode=cdg"] },
    { name: { ko: "서울로7017", en: "Seoullo 7017" }, category: "culture", address: { ko: "서울특별시 중구 청파로 432", en: "432 Cheongpa-ro, Jung-gu, Seoul" }, coordinates: { latitude: 37.5560, longitude: 126.9723 }, sourceUrls: ["https://english.visitseoul.net/area/Seoullo-7017/ENP023496"] },
  ] },
  { territoryId: "chuncheon", stops: [
    { name: { ko: "춘천 애니메이션박물관", en: "Chuncheon Animation Museum" }, category: "culture", address: { ko: "강원특별자치도 춘천시 서면 박사로 854", en: "854 Baksa-ro, Seo-myeon, Chuncheon-si" }, coordinates: { latitude: 37.8937, longitude: 127.6920 }, sourceUrls: ["https://www.chuncheon.go.kr/tour/destination/all-tour/detail/?tourId=218"] },
    { name: { ko: "소양강스카이워크", en: "Soyanggang Skywalk" }, category: "culture", address: { ko: "강원특별자치도 춘천시 영서로 2663", en: "2663 Yeongseo-ro, Chuncheon-si" }, coordinates: { latitude: 37.9002, longitude: 127.7295 }, sourceUrls: ["https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=68510"] },
  ] },
  { territoryId: "namyangju", stops: [
    { name: { ko: "정약용유적지", en: "Dasan Heritage Site" }, category: "culture", address: { ko: "경기도 남양주시 조안면 다산로747번길 11", en: "11 Dasan-ro 747beon-gil, Joan-myeon, Namyangju-si" }, coordinates: { latitude: 37.5251, longitude: 127.3032 }, sourceUrls: ["https://www.nyj.go.kr/eng/contents.do?key=806"] },
    { name: { ko: "다산수변공원", en: "Dasan Waterside Park" }, category: "culture", address: { ko: "경기도 남양주시 다산순환로 149", en: "149 Dasansunhwan-ro, Namyangju-si" }, coordinates: { latitude: 37.6244, longitude: 127.1597 }, sourceUrls: ["https://www.nyj.go.kr/culture/viewTnResrceU.do?key=4506&resrceNo=393"] },
  ] },
];

function placeId(territoryId: TerritoryId, order: 1 | 2): MissionPlaceId { return `${territoryId}-${order}`; }
function toMissionPlace(territoryId: TerritoryId, order: 1 | 2, seed: PlaceSeed): PreviewMissionPlace {
  return { ...seed, id: placeId(territoryId, order), territoryId, relationship: "nearby_recommendation", artistConnectionId: null, evidenceClass: null, description: nearbyDescription, transport: publicTransport, dwellMinutes: 45, visitBase: 100, localBenefit: { ko: "지역 문화와 상권을 함께 경험하는 공공 관광 정류장", en: "A public stop that supports local culture and commerce" } };
}

export const places = territoryStops.flatMap(({ territoryId, stops }) => [toMissionPlace(territoryId, 1, stops[0]), toMissionPlace(territoryId, 2, stops[1])]);

function expedition(artistId: ArtistId, territoryId: TerritoryId, connectionId: string, ko: string, en: string): PreviewExpedition {
  return { id: `${artistId}-${territoryId}-expedition`, artistId, territoryId, connectionId, title: { ko, en }, description: { ko: "검증된 지역 연결을 읽고 공공 관광지 두 곳을 차례로 방문하는 데모 원정입니다.", en: "A demo expedition that reads the verified regional connection, then visits two public attractions in order." }, stopIds: [placeId(territoryId, 1), placeId(territoryId, 2)], transitSummary: { ko: "대중교통 기준 약 90분", en: "About 90 minutes by public transit" }, estimatedMinutes: 90 };
}

export const expeditions: PreviewExpedition[] = [
  expedition("bts", "busan", "bts-busan-jimin", "BTS 부산 바다 원정", "BTS Busan coast expedition"),
  expedition("blackpink", "gunpo", "blackpink-gunpo-jisoo", "BLACKPINK 군포 숲길 원정", "BLACKPINK Gunpo greenway expedition"),
  expedition("rescene", "geoje", "rescene-geoje-origin", "RESCENE 거제 해안 원정", "RESCENE Geoje coast expedition"),
  expedition("cortis", "daejeon", "cortis-daejeon-origin", "CORTIS 대전 과학 원정", "CORTIS Daejeon science expedition"),
  expedition("btob", "suwon", "btob-suwon-changsub", "BTOB 수원 성곽 원정", "BTOB Suwon fortress expedition"),
  expedition("ive", "daejeon", "ive-daejeon-origin", "IVE 대전 정원 원정", "IVE Daejeon garden expedition"),
  expedition("kiiikiii", "busan", "kiiikiii-busan-origin", "KiiiKiii 부산 골목 원정", "KiiiKiii Busan neighborhood expedition"),
  expedition("riize", "ulsan", "riize-ulsan-wonbin", "RIIZE 울산 강변 원정", "RIIZE Ulsan riverside expedition"),
  expedition("zerobaseone", "cheonan", "zerobaseone-cheonan-origin", "ZEROBASEONE 천안 역사 원정", "ZEROBASEONE Cheonan history expedition"),
  expedition("boynextdoor", "wonju", "boynextdoor-wonju-origin", "BOYNEXTDOOR 원주 계곡 원정", "BOYNEXTDOOR Wonju valley expedition"),
  expedition("le-sserafim", "seoul", "le-sserafim-seoul-eunchae", "LE SSERAFIM 서울 문화 원정", "LE SSERAFIM Seoul culture expedition"),
  expedition("aespa", "suwon", "aespa-suwon-karina", "aespa 수원 성곽 원정", "aespa Suwon fortress expedition"),
  expedition("newjeans", "chuncheon", "newjeans-chuncheon-minji", "NewJeans 춘천 호수 원정", "NewJeans Chuncheon lake expedition"),
  expedition("iu", "seoul", "iu-seoul-origin", "IU 서울 산책 원정", "IU Seoul walking expedition"),
  expedition("seventeen", "namyangju", "seventeen-namyangju-hoshi", "SEVENTEEN 남양주 정원 원정", "SEVENTEEN Namyangju garden expedition"),
];
