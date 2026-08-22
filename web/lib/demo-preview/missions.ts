import type { ArtistId, MissionPlaceId, PreviewExpedition, PreviewMissionPlace, TerritoryId } from "@/features/team-preview/types";

const tourismSource = "https://korean.visitkorea.or.kr/";

type PlaceSeed = {
  territoryId: TerritoryId;
  connectionId: string;
  names: readonly [string, string, string, string];
  latitude: number;
  longitude: number;
};

const placeSeeds: PlaceSeed[] = [
  { territoryId: "busan", connectionId: "bts-busan-jimin", names: ["감천문화마을", "Gamcheon Culture Village", "자갈치시장", "Jagalchi Market"], latitude: 35.0978, longitude: 129.0105 },
  { territoryId: "daegu", connectionId: "bts-busan-jimin", names: ["서문시장", "Seomun Market", "앞산공원", "Apsan Park"], latitude: 35.8699, longitude: 128.5806 },
  { territoryId: "gwangju", connectionId: "boynextdoor-wonju-origin", names: ["국립아시아문화전당", "Asia Culture Center", "양림동 역사문화마을", "Yangnim-dong History Village"], latitude: 35.1461, longitude: 126.9193 },
  { territoryId: "gunpo", connectionId: "blackpink-gunpo-jisoo", names: ["수리산도립공원", "Surisan Provincial Park", "초막골생태공원", "Chomakgol Ecological Park"], latitude: 37.3580, longitude: 126.9174 },
  { territoryId: "seongnam", connectionId: "blackpink-gunpo-jisoo", names: ["판교박물관", "Pangyo Museum", "탄천 산책로", "Tancheon Riverside Walk"], latitude: 37.4016, longitude: 127.1079 },
  { territoryId: "geoje", connectionId: "rescene-geoje-origin", names: ["바람의 언덕", "Windy Hill", "거제포로수용소유적공원", "Geoje POW Camp Historic Park"], latitude: 34.7120, longitude: 128.6686 },
  { territoryId: "suwon", connectionId: "btob-suwon-changsub", names: ["수원화성", "Suwon Hwaseong Fortress", "행궁동", "Haenggung-dong"], latitude: 37.2803, longitude: 127.0157 },
  { territoryId: "gyeongju", connectionId: "rescene-geoje-origin", names: ["대릉원", "Daereungwon Tomb Complex", "동궁과 월지", "Donggung and Wolji"], latitude: 35.8395, longitude: 129.2129 },
  { territoryId: "daejeon", connectionId: "ive-daejeon-origin", names: ["한밭수목원", "Hanbat Arboretum", "엑스포과학공원", "Expo Science Park"], latitude: 36.3673, longitude: 127.3861 },
  { territoryId: "seoul", connectionId: "iu-seoul-origin", names: ["경복궁", "Gyeongbokgung Palace", "서울로7017", "Seoullo 7017"], latitude: 37.5796, longitude: 126.9770 },
  { territoryId: "yongin", connectionId: "btob-suwon-changsub", names: ["백남준아트센터", "Nam June Paik Art Center", "용인중앙공원", "Yongin Central Park"], latitude: 37.2673, longitude: 127.1073 },
  { territoryId: "goyang", connectionId: "btob-suwon-changsub", names: ["일산호수공원", "Ilsan Lake Park", "고양아람누리", "Goyang Aram Nuri"], latitude: 37.6580, longitude: 126.7682 },
  { territoryId: "incheon", connectionId: "ive-daejeon-origin", names: ["송도센트럴파크", "Songdo Central Park", "개항장 문화지구", "Open Port Cultural District"], latitude: 37.3922, longitude: 126.6393 },
  { territoryId: "jeju", connectionId: "ive-daejeon-origin", names: ["한라산국립공원", "Hallasan National Park", "동문시장", "Dongmun Market"], latitude: 33.3617, longitude: 126.5292 },
  { territoryId: "ulsan", connectionId: "riize-ulsan-wonbin", names: ["장생포고래문화마을", "Jangsaengpo Whale Culture Village", "태화강국가정원", "Taehwagang National Garden"], latitude: 35.5046, longitude: 129.3845 },
  { territoryId: "siheung", connectionId: "riize-ulsan-wonbin", names: ["시흥갯골생태공원", "Siheung Gaetgol Eco Park", "오이도", "Oido"], latitude: 37.3890, longitude: 126.7834 },
  { territoryId: "cheonan", connectionId: "zerobaseone-cheonan-origin", names: ["독립기념관", "Independence Hall of Korea", "아라리오갤러리 천안", "Arario Gallery Cheonan"], latitude: 36.7817, longitude: 127.2302 },
  { territoryId: "pohang", connectionId: "zerobaseone-cheonan-origin", names: ["스페이스워크", "Space Walk", "호미곶 해맞이광장", "Homigot Sunrise Plaza"], latitude: 36.0570, longitude: 129.3804 },
  { territoryId: "wonju", connectionId: "boynextdoor-wonju-origin", names: ["소금산그랜드밸리", "Sogeumsan Grand Valley", "원주역사박물관", "Wonju History Museum"], latitude: 37.3640, longitude: 127.8394 },
  { territoryId: "chuncheon", connectionId: "newjeans-chuncheon-minji", names: ["춘천애니메이션박물관", "Chuncheon Animation Museum", "소양강스카이워크", "Soyanggang Skywalk"], latitude: 37.8913, longitude: 127.7181 },
  { territoryId: "uijeongbu", connectionId: "iu-seoul-origin", names: ["의정부미술도서관", "Uijeongbu Art Library", "직동근린공원", "Jikdong Neighborhood Park"], latitude: 37.7454, longitude: 127.0472 },
  { territoryId: "namyangju", connectionId: "seventeen-namyangju-hoshi", names: ["다산유적지", "Dasan Historic Site", "물의정원", "Mul-ui Garden"], latitude: 37.5827, longitude: 127.3160 },
];

function placeId(territoryId: TerritoryId, order: 1 | 2): MissionPlaceId {
  return `${territoryId}-${order}`;
}

function placesFor(seed: PlaceSeed): PreviewMissionPlace[] {
  const [firstKo, firstEn, secondKo, secondEn] = seed.names;
  return [
    {
      id: placeId(seed.territoryId, 1), territoryId: seed.territoryId, name: { ko: firstKo, en: firstEn }, category: "culture", relationship: "artist_connection", artistConnectionId: seed.connectionId, evidenceClass: "verified",
      description: { ko: "아티스트의 검증된 지역 연결을 설명하는 공공 관광 정류장입니다.", en: "A public tourism stop that explains the artist's verified regional connection." },
      address: { ko: `${seed.territoryId} 공공 관광 권역`, en: `${seed.territoryId} public tourism area` }, coordinates: { latitude: seed.latitude, longitude: seed.longitude },
      transport: { summary: { ko: "대중교통으로 접근 가능한 공공 관광지", en: "Public attraction reachable by local transit" }, nearestStation: { ko: "인근 버스·철도 정류장", en: "Nearby bus or rail stop" }, accessibilityNote: { ko: "방문 전 운영시간과 무장애 동선을 확인하세요.", en: "Check opening hours and accessible routes before visiting." } },
      dwellMinutes: 45, visitBase: 100, localBenefit: { ko: "지역 문화·상권 방문으로 이어지는 정류장", en: "A stop that supports local culture and commerce" }, sourceUrls: [tourismSource],
    },
    {
      id: placeId(seed.territoryId, 2), territoryId: seed.territoryId, name: { ko: secondKo, en: secondEn }, category: "local_food", relationship: "nearby_recommendation", artistConnectionId: null, evidenceClass: null,
      description: { ko: "아티스트와의 직접 연관을 주장하지 않는 인근 공공 관광 추천지입니다.", en: "A nearby public-tourism recommendation that makes no direct artist-connection claim." },
      address: { ko: `${seed.territoryId} 관광 권역`, en: `${seed.territoryId} tourism district` }, coordinates: { latitude: seed.latitude + 0.003, longitude: seed.longitude + 0.003 },
      transport: { summary: { ko: "첫 정류장에서 도보 또는 시내버스로 이동", en: "Walk or take a local bus from the first stop" }, nearestStation: { ko: "인근 버스 정류장", en: "Nearby bus stop" }, accessibilityNote: { ko: "지역별 운영 정보는 공식 관광 페이지에서 확인하세요.", en: "Confirm local operating information on the official tourism page." } },
      dwellMinutes: 30, visitBase: 100, localBenefit: { ko: "지역 상점과 식음 공간을 둘러보는 선택지", en: "An option to explore local shops and food venues" }, sourceUrls: [tourismSource],
    },
  ];
}

export const places = placeSeeds.flatMap(placesFor);

function expedition(artistId: ArtistId, territoryId: TerritoryId, connectionId: string, ko: string, en: string): PreviewExpedition {
  return {
    id: `${artistId}-${territoryId}-expedition`, artistId, territoryId, connectionId,
    title: { ko, en },
    description: { ko: "검증된 지역 연결을 읽고 공공 관광지 두 곳을 차례로 방문하는 데모 원정입니다.", en: "A demo expedition that reads the verified regional connection, then visits two public attractions in order." },
    stopIds: [placeId(territoryId, 1), placeId(territoryId, 2)],
    transitSummary: { ko: "대중교통 기준 약 90분", en: "About 90 minutes by public transit" }, estimatedMinutes: 90,
  };
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
