import type {
  BattleSnapshot,
  Expedition,
  JourneySummary,
  LeaderboardEntry,
  Place,
  Region,
} from "./domain";

export const regions: Region[] = [
  {
    id: "seoul",
    nameKo: "서울",
    shortCopy: "도시 전체가 무대가 되는 K-POP 중심지",
    description: "연습실 골목과 전시, 한강 야경을 연결해 서울의 여러 얼굴을 만나요.",
    expeditionCount: 12,
    ownerFandom: "ARMY",
    ownerArtist: "BTS",
    ownershipPercent: 58,
    position: { x: 46, y: 22 },
    accent: "purple",
    highlights: ["서울숲", "한강", "성수 레코드숍"],
  },
  {
    id: "gangneung",
    nameKo: "강릉",
    shortCopy: "바다와 음악이 만나는 동해 원정",
    description: "안목 바다와 로컬 카페, 촬영지를 천천히 잇는 해안 여행이에요.",
    expeditionCount: 5,
    ownerFandom: "CARAT",
    ownerArtist: "SEVENTEEN",
    ownershipPercent: 51,
    position: { x: 70, y: 29 },
    accent: "blue",
    highlights: ["안목해변", "초당동", "경포호"],
  },
  {
    id: "jeonju",
    nameKo: "전주",
    shortCopy: "한옥과 로컬 사운드를 잇는 하루",
    description: "한옥마을 너머 독립서점과 시장까지 이어지는 느린 원정이에요.",
    expeditionCount: 6,
    ownerFandom: "BLINK",
    ownerArtist: "BLACKPINK",
    ownershipPercent: 42,
    position: { x: 38, y: 56 },
    accent: "orange",
    highlights: ["한옥마을", "남부시장", "객리단길"],
  },
  {
    id: "gyeongju",
    nameKo: "경주",
    shortCopy: "천년 도시를 걷는 밤의 플레이리스트",
    description: "대릉원과 황리단길, 야간 유산을 한 편의 뮤직비디오처럼 걸어요.",
    expeditionCount: 4,
    ownerFandom: "ONCE",
    ownerArtist: "TWICE",
    ownershipPercent: 54,
    position: { x: 65, y: 63 },
    accent: "green",
    highlights: ["대릉원", "황리단길", "동궁과 월지"],
  },
  {
    id: "busan",
    nameKo: "부산",
    shortCopy: "바다를 따라 이어지는 팬덤 방어전",
    description: "K-POP의 기억과 영도 로컬 풍경, 남포의 오래된 상점을 하루에 연결해요.",
    expeditionCount: 7,
    ownerFandom: "ARMY",
    ownerArtist: "BTS",
    ownershipPercent: 58,
    position: { x: 70, y: 80 },
    accent: "blue",
    highlights: ["감천문화마을", "흰여울길", "남포동"],
  },
];

export const places: Place[] = [
  { id: "busan-gamcheon", regionId: "busan", nameKo: "감천문화마을", category: "culture", categoryLabel: "문화", description: "산복도로 위 색채와 골목 이야기를 만나는 부산 대표 문화 마을", address: "부산 사하구 감내2로 203", transit: "토성역에서 마을버스 12분", dwellMinutes: 40, points: 100, completed: true },
  { id: "busan-white-cliff", regionId: "busan", nameKo: "영도 흰여울길", category: "culture", categoryLabel: "지역 명소", description: "절벽 아래 바다와 오래된 집들이 이어지는 영도의 느린 산책길", address: "부산 영도구 영선동4가", transit: "감천문화마을에서 버스 28분", dwellMinutes: 35, points: 120 },
  { id: "busan-record", regionId: "busan", nameKo: "남포 로컬 레코드숍", category: "kpop", categoryLabel: "K-POP", description: "세대를 건너온 음반과 부산 팬들의 기록을 만나는 작은 가게", address: "부산 중구 광복로", transit: "흰여울길에서 버스 18분", dwellMinutes: 25, points: 180, localBenefit: "팬 인증 시 엽서 증정" },
  { id: "busan-market", regionId: "busan", nameKo: "부평깡통시장", category: "local_food", categoryLabel: "먹거리", description: "부산의 밤을 채우는 로컬 먹거리와 오래된 시장 골목", address: "부산 중구 부평1길 48", transit: "레코드숍에서 도보 12분", dwellMinutes: 45, points: 100, localBenefit: "원정 스탬프 제휴" },
  { id: "busan-cinema", regionId: "busan", nameKo: "영화의전당 야외광장", category: "event", categoryLabel: "행사", description: "빛나는 지붕 아래 공연과 영화가 교차하는 부산의 문화 무대", address: "부산 해운대구 수영강변대로 120", transit: "시장에서 지하철 34분", dwellMinutes: 50, points: 100 },
  { id: "seoul-seongsu", regionId: "seoul", nameKo: "성수 팬 아카이브", category: "kpop", categoryLabel: "K-POP", description: "팬 전시와 로컬 브랜드가 공존하는 성수의 작은 기록실", address: "서울 성동구 연무장길", transit: "성수역 도보 8분", dwellMinutes: 30, points: 100 },
  { id: "jeonju-market", regionId: "jeonju", nameKo: "전주 남부시장", category: "local_food", categoryLabel: "먹거리", description: "청년몰과 전주 음식을 함께 즐기는 지역 시장", address: "전북 전주시 완산구 풍남문1길", transit: "한옥마을 도보 10분", dwellMinutes: 45, points: 100 },
];

export const expeditions: Expedition[] = [
  { id: "busan-coast-defense", regionId: "busan", title: "바다를 따라 부산 방어전", kicker: "REGIONAL EXPEDITION 07", description: "K-POP의 기억과 영도 로컬 스폿을 잇는 부산 하루 코스", duration: "약 5시간", transitMode: "버스 + 도보", stopIds: ["busan-gamcheon", "busan-white-cliff", "busan-record", "busan-market", "busan-cinema"], completedStops: 2, totalPoints: 600, weekendBonus: 20 },
  { id: "seoul-night-stage", regionId: "seoul", title: "서울 나이트 스테이지", kicker: "CAPITAL EXPEDITION 03", description: "성수에서 한강까지 이어지는 저녁 원정", duration: "약 4시간", transitMode: "지하철 + 도보", stopIds: ["seoul-seongsu"], completedStops: 0, totalPoints: 400, weekendBonus: 10 },
];

export const battles: Record<string, BattleSnapshot> = Object.fromEntries(
  regions.map((region) => [region.id, { regionId: region.id, ownerFandom: region.ownerFandom, challengerFandom: region.id === "busan" ? "BLINK" : "CARAT", ownerPercent: region.ownershipPercent, challengerPercent: 100 - region.ownershipPercent, pointsToCapture: region.id === "busan" ? 420 : 540, recentChange: `${region.nameKo} 지역 점유율이 오늘 3% 변했어요` }]),
);

export const leaderboard: LeaderboardEntry[] = [
  { rank: 1, fandomName: "ARMY", artistName: "BTS", strongholds: 14, points: 28400, trend: "same" },
  { rank: 2, fandomName: "BLINK", artistName: "BLACKPINK", strongholds: 11, points: 26120, trend: "up" },
  { rank: 3, fandomName: "CARAT", artistName: "SEVENTEEN", strongholds: 9, points: 24880, trend: "down" },
  { rank: 4, fandomName: "ONCE", artistName: "TWICE", strongholds: 8, points: 22340, trend: "same" },
];

export const journey: JourneySummary = {
  visitedRegions: 4,
  completedExpeditions: 3,
  totalPoints: 2840,
  fandomContributionPercent: 8.4,
  reviewCount: 1,
  stamps: ["서울", "전주", "강릉", "부산"],
  visits: [
    { regionName: "부산", placeName: "감천문화마을", status: "approved", date: "오늘" },
    { regionName: "전주", placeName: "남부시장", status: "review_required", date: "8월 10일" },
    { regionName: "강릉", placeName: "안목해변", status: "approved", date: "7월 28일" },
  ],
};
