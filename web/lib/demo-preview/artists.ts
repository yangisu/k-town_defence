import type { ArtistConnection, ArtistProfile, ContentSource } from "@/features/team-preview/types";

type ConnectionSeed = Pick<ArtistConnection,
  "id" | "artistId" | "territoryId" | "memberName" | "relationType" | "sourceUrls">;

export const artists: ArtistProfile[] = [
  { id: "bts", artistName: { ko: "방탄소년단", en: "BTS" }, fandomName: "ARMY", color: "#7c5ce0", markerLabel: "BTS", representativeTerritoryIds: ["busan", "daegu", "gwangju"] },
  { id: "blackpink", artistName: { ko: "블랙핑크", en: "BLACKPINK" }, fandomName: "BLINK", color: "#f25da5", markerLabel: "BP", representativeTerritoryIds: ["gunpo", "seongnam"] },
  { id: "rescene", artistName: { ko: "리센느", en: "RESCENE" }, fandomName: "REMINE", color: "#d66d55", markerLabel: "RS", representativeTerritoryIds: ["geoje", "suwon", "gyeongju"] },
  { id: "cortis", artistName: { ko: "코르티스", en: "CORTIS" }, fandomName: "COER", color: "#4d7cfe", markerLabel: "CT", representativeTerritoryIds: ["daejeon", "suwon", "seoul"] },
  { id: "btob", artistName: { ko: "비투비", en: "BTOB" }, fandomName: "MELODY", color: "#2e9d78", markerLabel: "BTOB", representativeTerritoryIds: ["yongin", "suwon", "goyang"] },
  { id: "ive", artistName: { ko: "아이브", en: "IVE" }, fandomName: "DIVE", color: "#d2468d", markerLabel: "IVE", representativeTerritoryIds: ["daejeon", "incheon", "jeju"] },
  { id: "kiiikiii", artistName: { ko: "키키", en: "KiiiKiii" }, fandomName: "TiiiKiii", color: "#8b5cf6", markerLabel: "K3", logoPath: "https://kiiikiii.kr/assets/home/0_Menu/Logo_1.png", representativeTerritoryIds: ["busan", "seoul"] },
  { id: "riize", artistName: { ko: "라이즈", en: "RIIZE" }, fandomName: "BRIIZE", color: "#f28a45", markerLabel: "RZ", representativeTerritoryIds: ["ulsan", "siheung", "seoul"] },
  { id: "zerobaseone", artistName: { ko: "제로베이스원", en: "ZEROBASEONE" }, fandomName: "ZEROSE", color: "#3a9edb", markerLabel: "ZB1", representativeTerritoryIds: ["cheonan", "pohang", "wonju"] },
  { id: "boynextdoor", artistName: { ko: "보이넥스트도어", en: "BOYNEXTDOOR" }, fandomName: "ONEDOOR", color: "#59a85f", markerLabel: "BND", representativeTerritoryIds: ["wonju", "gwangju", "busan", "suwon"] },
  { id: "le-sserafim", artistName: { ko: "르세라핌", en: "LE SSERAFIM" }, fandomName: "FEARNOT", color: "#a964d7", markerLabel: "LSF", representativeTerritoryIds: ["seoul"] },
  { id: "aespa", artistName: { ko: "에스파", en: "aespa" }, fandomName: "MY", color: "#4c66d6", markerLabel: "æ", representativeTerritoryIds: ["suwon", "busan"] },
  { id: "newjeans", artistName: { ko: "뉴진스", en: "NewJeans" }, fandomName: "Bunnies", color: "#4b9de0", markerLabel: "NJ", representativeTerritoryIds: ["chuncheon", "incheon", "seoul"] },
  { id: "iu", artistName: { ko: "아이유", en: "IU" }, fandomName: "UAENA", color: "#d960a8", markerLabel: "IU", representativeTerritoryIds: ["seoul", "uijeongbu"] },
  { id: "seventeen", artistName: { ko: "세븐틴", en: "SEVENTEEN" }, fandomName: "CARAT", color: "#45a9ad", markerLabel: "SVT", representativeTerritoryIds: ["namyangju"] },
];

const sourceUrls = {
  bts: "https://world.kbs.co.kr/service/news_view.htm?Seq_Code=202130&id=Cu&lang=e",
  blackpink: "https://music.apple.com/us/artist/jisoo/1548008317",
  rescene: "https://www.melon.com/artist/timeline.htm?artistId=3469137",
  cortis: "https://ibighit.com/cortis/eng/",
  btob: "https://btobofficial.jp/profiles",
  ive: "https://www.starship-ent.com/profile/artists/ive.php",
  kiiikiii: "https://kiiikiii.kr/",
  riize: "https://riizeofficial.com/",
  zerobaseone: "https://zerobaseone.jp/",
  boynextdoor: "https://boynextdoor-official.jp/profile/",
  leSserafim: "https://www.le-sserafim.jp/profile",
  aespa: "https://www.smtown.com/artist/musician/10029",
  newjeans: "https://newjeans.kr/",
  iu: "https://music.apple.com/us/artist/iu/409076743",
  seventeen: "https://www.seventeen-17.jp/pages/profile",
} as const;

const primaryConnections: ConnectionSeed[] = [
  {
    id: "bts-busan-jimin", artistId: "bts", territoryId: "busan", memberName: { ko: "지민", en: "Jimin" }, relationType: "hometown", sourceUrls: [sourceUrls.bts],
  },
  {
    id: "blackpink-gunpo-jisoo", artistId: "blackpink", territoryId: "gunpo", memberName: { ko: "지수", en: "JISOO" }, relationType: "birthplace", sourceUrls: [sourceUrls.blackpink],
  },
  {
    id: "rescene-geoje-origin", artistId: "rescene", territoryId: "geoje", memberName: { ko: "RESCENE", en: "RESCENE" }, relationType: "official_activity", sourceUrls: [sourceUrls.rescene],
  },
  {
    id: "cortis-daejeon-origin", artistId: "cortis", territoryId: "daejeon", memberName: { ko: "CORTIS", en: "CORTIS" }, relationType: "official_activity", sourceUrls: [sourceUrls.cortis],
  },
  {
    id: "btob-suwon-changsub", artistId: "btob", territoryId: "suwon", memberName: { ko: "이창섭", en: "Lee Changsub" }, relationType: "birthplace", sourceUrls: [sourceUrls.btob],
  },
  {
    id: "ive-daejeon-origin", artistId: "ive", territoryId: "daejeon", memberName: { ko: "IVE", en: "IVE" }, relationType: "official_activity", sourceUrls: [sourceUrls.ive],
  },
  {
    id: "kiiikiii-busan-origin", artistId: "kiiikiii", territoryId: "busan", memberName: { ko: "KiiiKiii", en: "KiiiKiii" }, relationType: "official_activity", sourceUrls: [sourceUrls.kiiikiii],
  },
  {
    id: "riize-ulsan-wonbin", artistId: "riize", territoryId: "ulsan", memberName: { ko: "원빈", en: "WONBIN" }, relationType: "hometown", sourceUrls: [sourceUrls.riize],
  },
  {
    id: "zerobaseone-cheonan-origin", artistId: "zerobaseone", territoryId: "cheonan", memberName: { ko: "성한빈", en: "SUNG HANBIN" }, relationType: "hometown", sourceUrls: [sourceUrls.zerobaseone],
  },
  {
    id: "boynextdoor-wonju-origin", artistId: "boynextdoor", territoryId: "wonju", memberName: { ko: "BOYNEXTDOOR", en: "BOYNEXTDOOR" }, relationType: "official_activity", sourceUrls: [sourceUrls.boynextdoor],
  },
  {
    id: "le-sserafim-seoul-eunchae", artistId: "le-sserafim", territoryId: "seoul", memberName: { ko: "홍은채", en: "HONG EUNCHAE" }, relationType: "birthplace", sourceUrls: [sourceUrls.leSserafim],
  },
  {
    id: "aespa-suwon-karina", artistId: "aespa", territoryId: "suwon", memberName: { ko: "카리나", en: "KARINA" }, relationType: "birthplace", sourceUrls: [sourceUrls.aespa],
  },
  {
    id: "newjeans-chuncheon-minji", artistId: "newjeans", territoryId: "chuncheon", memberName: { ko: "민지", en: "MINJI" }, relationType: "birthplace", sourceUrls: [sourceUrls.newjeans],
  },
  {
    id: "iu-seoul-origin", artistId: "iu", territoryId: "seoul", memberName: { ko: "아이유", en: "IU" }, relationType: "birthplace", sourceUrls: [sourceUrls.iu],
  },
  {
    id: "seventeen-namyangju-hoshi", artistId: "seventeen", territoryId: "namyangju", memberName: { ko: "호시", en: "HOSHI" }, relationType: "hometown", sourceUrls: [sourceUrls.seventeen],
  },
];

function regionalConnection(
  id: string,
  artistId: ArtistConnection["artistId"],
  territoryId: string,
  memberKo: string,
  memberEn: string,
  relationType: ArtistConnection["relationType"],
  sourceUrl: string,
): ConnectionSeed {
  return {
    id,
    artistId,
    territoryId,
    memberName: { ko: memberKo, en: memberEn },
    relationType,
    sourceUrls: [sourceUrl],
  };
}

const representativeConnections: ConnectionSeed[] = [
  regionalConnection("bts-daegu-suga", "bts", "daegu", "슈가", "SUGA", "hometown", sourceUrls.bts),
  regionalConnection("bts-gwangju-jhope", "bts", "gwangju", "제이홉", "j-hope", "hometown", sourceUrls.bts),
  regionalConnection("blackpink-seongnam-jennie", "blackpink", "seongnam", "제니", "JENNIE", "hometown", sourceUrls.blackpink),
  regionalConnection("rescene-suwon-riiv", "rescene", "suwon", "리브", "RIIV", "birthplace", sourceUrls.rescene),
  regionalConnection("rescene-gyeongju-zena", "rescene", "gyeongju", "제나", "ZENA", "hometown", sourceUrls.rescene),
  regionalConnection("cortis-seoul-martin", "cortis", "seoul", "마틴", "MARTIN", "birthplace", sourceUrls.cortis),
  regionalConnection("cortis-suwon-gunho", "cortis", "suwon", "건호", "GUNHO", "hometown", sourceUrls.cortis),
  regionalConnection("btob-yongin-eunkwang", "btob", "yongin", "서은광", "SEO EUNKWANG", "hometown", sourceUrls.btob),
  regionalConnection("btob-goyang-hyunsik", "btob", "goyang", "임현식", "LIM HYUNSIK", "hometown", sourceUrls.btob),
  regionalConnection("ive-incheon-gaeul", "ive", "incheon", "가을", "GAEUL", "hometown", sourceUrls.ive),
  regionalConnection("ive-jeju-liz", "ive", "jeju", "리즈", "LIZ", "hometown", sourceUrls.ive),
  regionalConnection("kiiikiii-seoul-leesol", "kiiikiii", "seoul", "리솔", "LEESOL", "hometown", sourceUrls.kiiikiii),
  regionalConnection("riize-siheung-sohee", "riize", "siheung", "소희", "SOHEE", "hometown", sourceUrls.riize),
  regionalConnection("riize-seoul-eunseok", "riize", "seoul", "은석", "EUNSEOK", "birthplace", sourceUrls.riize),
  regionalConnection("zerobaseone-pohang-jiwoong", "zerobaseone", "pohang", "김지웅", "KIM JIWOONG", "birthplace", sourceUrls.zerobaseone),
  regionalConnection("zerobaseone-wonju-jiwoong", "zerobaseone", "wonju", "김지웅", "KIM JIWOONG", "hometown", sourceUrls.zerobaseone),
  regionalConnection("boynextdoor-gwangju-taesan", "boynextdoor", "gwangju", "태산", "TAESAN", "hometown", sourceUrls.boynextdoor),
  regionalConnection("boynextdoor-busan-leehan", "boynextdoor", "busan", "이한", "LEEHAN", "hometown", sourceUrls.boynextdoor),
  regionalConnection("boynextdoor-suwon-woonhak", "boynextdoor", "suwon", "운학", "WOONHAK", "hometown", sourceUrls.boynextdoor),
  regionalConnection("aespa-busan-winter", "aespa", "busan", "윈터", "WINTER", "hometown", sourceUrls.aespa),
  regionalConnection("newjeans-incheon-hyein", "newjeans", "incheon", "혜인", "HYEIN", "hometown", sourceUrls.newjeans),
  regionalConnection("newjeans-seoul-haerin", "newjeans", "seoul", "해린", "HAERIN", "birthplace", sourceUrls.newjeans),
  regionalConnection("iu-uijeongbu-upbringing", "iu", "uijeongbu", "아이유", "IU", "hometown", sourceUrls.iu),
];

const genericProfileHosts = new Set([
  "www.melon.com",
  "ibighit.com",
  "www.starship-ent.com",
  "kiiikiii.kr",
  "riizeofficial.com",
  "zerobaseone.jp",
  "boynextdoor-official.jp",
  "www.le-sserafim.jp",
  "www.smtown.com",
  "newjeans.kr",
  "www.seventeen-17.jp",
]);

function connectionSource(url: string): ContentSource {
  const hostname = new URL(url).hostname;
  const claimSpecific = hostname === "world.kbs.co.kr" || hostname === "music.apple.com";
  return {
    id: `artist-source-${hostname.replaceAll(".", "-")}`,
    url,
    publisher: hostname,
    reliability: genericProfileHosts.has(hostname) ? "authoritative" : "reliable_public",
    claimSpecific,
  };
}

const territoryNames = new Map<string, { ko: string; en: string }>([
  ["busan", { ko: "부산", en: "Busan" }], ["daegu", { ko: "대구", en: "Daegu" }],
  ["gwangju", { ko: "광주", en: "Gwangju" }], ["gunpo", { ko: "군포", en: "Gunpo" }],
  ["seongnam", { ko: "성남", en: "Seongnam" }], ["geoje", { ko: "거제", en: "Geoje" }],
  ["suwon", { ko: "수원", en: "Suwon" }], ["gyeongju", { ko: "경주", en: "Gyeongju" }],
  ["daejeon", { ko: "대전", en: "Daejeon" }], ["seoul", { ko: "서울", en: "Seoul" }],
  ["yongin", { ko: "용인", en: "Yongin" }], ["goyang", { ko: "고양", en: "Goyang" }],
  ["incheon", { ko: "인천", en: "Incheon" }], ["jeju", { ko: "제주", en: "Jeju" }],
  ["ulsan", { ko: "울산", en: "Ulsan" }], ["siheung", { ko: "시흥", en: "Siheung" }],
  ["cheonan", { ko: "천안", en: "Cheonan" }], ["pohang", { ko: "포항", en: "Pohang" }],
  ["wonju", { ko: "원주", en: "Wonju" }], ["chuncheon", { ko: "춘천", en: "Chuncheon" }],
  ["uijeongbu", { ko: "의정부", en: "Uijeongbu" }], ["namyangju", { ko: "남양주", en: "Namyangju" }],
]);

function honestTeamDataConnection(seed: ConnectionSeed): ArtistConnection {
  const territoryName = territoryNames.get(seed.territoryId) ?? { ko: seed.territoryId, en: seed.territoryId };
  const sources = seed.sourceUrls.map(connectionSource);
  return {
    ...seed,
    evidenceClass: "team_data",
    evidenceNote: {
      ko: "팀 입력자료의 검토 후보이며, 독립적인 출처 검증이 완료되지 않았습니다.",
      en: "This is a team-data research lead and has not completed independent source verification.",
    },
    story: {
      ko: `${seed.memberName.ko}와 ${territoryName.ko}의 지역 연결 스토리를 참고해, 누구나 방문할 수 있는 공공 관광 코스를 추천합니다.`,
      en: `This recommendation uses the regional story connecting ${seed.memberName.en} and ${territoryName.en}, and includes public attractions that anyone can visit.`,
    },
    sources,
  };
}

export const connections: ArtistConnection[] = [...primaryConnections, ...representativeConnections]
  .map(honestTeamDataConnection);
