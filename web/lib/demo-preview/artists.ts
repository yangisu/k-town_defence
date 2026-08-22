import type { ArtistConnection, ArtistProfile } from "@/features/team-preview/types";

export const artists: ArtistProfile[] = [
  { id: "bts", artistName: { ko: "방탄소년단", en: "BTS" }, fandomName: "ARMY", color: "#7c5ce0", representativeTerritoryIds: ["busan", "daegu", "gwangju"] },
  { id: "blackpink", artistName: { ko: "블랙핑크", en: "BLACKPINK" }, fandomName: "BLINK", color: "#f25da5", representativeTerritoryIds: ["gunpo", "seongnam"] },
  { id: "rescene", artistName: { ko: "리센느", en: "RESCENE" }, fandomName: "REMINE", color: "#d66d55", representativeTerritoryIds: ["geoje", "suwon", "gyeongju"] },
  { id: "cortis", artistName: { ko: "코르티스", en: "CORTIS" }, fandomName: "COER", color: "#4d7cfe", representativeTerritoryIds: ["daejeon", "suwon", "seoul"] },
  { id: "btob", artistName: { ko: "비투비", en: "BTOB" }, fandomName: "MELODY", color: "#2e9d78", representativeTerritoryIds: ["yongin", "suwon", "goyang"] },
  { id: "ive", artistName: { ko: "아이브", en: "IVE" }, fandomName: "DIVE", color: "#d2468d", representativeTerritoryIds: ["daejeon", "incheon", "jeju"] },
  { id: "kiiikiii", artistName: { ko: "키키", en: "KiiiKiii" }, fandomName: "TiiiKiii", color: "#8b5cf6", representativeTerritoryIds: ["busan", "seoul"] },
  { id: "riize", artistName: { ko: "라이즈", en: "RIIZE" }, fandomName: "BRIIZE", color: "#f28a45", representativeTerritoryIds: ["ulsan", "siheung", "seoul"] },
  { id: "zerobaseone", artistName: { ko: "제로베이스원", en: "ZEROBASEONE" }, fandomName: "ZEROSE", color: "#3a9edb", representativeTerritoryIds: ["cheonan", "pohang", "wonju"] },
  { id: "boynextdoor", artistName: { ko: "보이넥스트도어", en: "BOYNEXTDOOR" }, fandomName: "ONEDOOR", color: "#59a85f", representativeTerritoryIds: ["wonju", "gwangju", "busan", "suwon"] },
  { id: "le-sserafim", artistName: { ko: "르세라핌", en: "LE SSERAFIM" }, fandomName: "FEARNOT", color: "#a964d7", representativeTerritoryIds: ["seoul"] },
  { id: "aespa", artistName: { ko: "에스파", en: "aespa" }, fandomName: "MY", color: "#4c66d6", representativeTerritoryIds: ["suwon", "busan"] },
  { id: "newjeans", artistName: { ko: "뉴진스", en: "NewJeans" }, fandomName: "Bunnies", color: "#4b9de0", representativeTerritoryIds: ["chuncheon", "incheon", "seoul"] },
  { id: "iu", artistName: { ko: "아이유", en: "IU" }, fandomName: "UAENA", color: "#d960a8", representativeTerritoryIds: ["seoul", "uijeongbu"] },
  { id: "seventeen", artistName: { ko: "세븐틴", en: "SEVENTEEN" }, fandomName: "CARAT", color: "#45a9ad", representativeTerritoryIds: ["namyangju"] },
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

export const connections: ArtistConnection[] = [
  {
    id: "bts-busan-jimin", artistId: "bts", territoryId: "busan", memberName: { ko: "지민", en: "Jimin" }, relationType: "hometown", evidenceClass: "verified",
    story: { ko: "KBS World가 지민과 정국의 고향으로 확인한 부산을, 공공 관광지에서 시작하는 BTS 원정의 지역 앵커로 삼습니다.", en: "Busan, identified by KBS World as Jimin and Jungkook's hometown, anchors this BTS route through public attractions." }, sourceUrls: [sourceUrls.bts],
  },
  {
    id: "blackpink-gunpo-jisoo", artistId: "blackpink", territoryId: "gunpo", memberName: { ko: "지수", en: "JISOO" }, relationType: "birthplace", evidenceClass: "verified",
    story: { ko: "음악 유통사의 아티스트 전기는 지수의 출생지를 군포로 기록합니다. 원정은 사적인 주소가 아닌 공공 관광지로 안내합니다.", en: "The distributor artist biography records JISOO's birthplace as Gunpo; the route directs visitors only to public attractions." }, sourceUrls: [sourceUrls.blackpink],
  },
  {
    id: "rescene-geoje-origin", artistId: "rescene", territoryId: "geoje", memberName: { ko: "RESCENE", en: "RESCENE" }, relationType: "official_activity", evidenceClass: "verified",
    story: { ko: "공개된 아티스트 이력으로 검토한 RESCENE의 거제 지역 연결을, 해안 공공 관광지 원정의 출발점으로 사용합니다.", en: "RESCENE's reviewed public artist record supplies the Geoje regional anchor for this public-coast itinerary." }, sourceUrls: [sourceUrls.rescene],
  },
  {
    id: "cortis-daejeon-origin", artistId: "cortis", territoryId: "daejeon", memberName: { ko: "CORTIS", en: "CORTIS" }, relationType: "official_activity", evidenceClass: "official",
    story: { ko: "공식 CORTIS 채널의 공개 활동 이력을 바탕으로 대전을 대표 지역 앵커로 제시하며, 장소는 공공 명소만 사용합니다.", en: "The official CORTIS channel supports Daejeon as the representative regional anchor; this route uses public landmarks only." }, sourceUrls: [sourceUrls.cortis],
  },
  {
    id: "btob-suwon-changsub", artistId: "btob", territoryId: "suwon", memberName: { ko: "이창섭", en: "Lee Changsub" }, relationType: "birthplace", evidenceClass: "verified",
    story: { ko: "공개된 BTOB 멤버 이력으로 검토한 창섭의 수원 연결을 수원화성 일대 공공 관광 원정의 지역 맥락으로 제공합니다.", en: "Changsub's Suwon connection is reviewed against the public BTOB member record and frames a public Hwaseong-area route." }, sourceUrls: [sourceUrls.btob],
  },
  {
    id: "ive-daejeon-origin", artistId: "ive", territoryId: "daejeon", memberName: { ko: "IVE", en: "IVE" }, relationType: "official_activity", evidenceClass: "official",
    story: { ko: "공식 IVE 아티스트 프로필을 기준으로 검토한 대전 지역 앵커이며, 팬 방문은 공공 수목원과 과학 명소로 한정합니다.", en: "This Daejeon anchor is reviewed with IVE's official artist profile, while fan visits remain limited to public gardens and science sites." }, sourceUrls: [sourceUrls.ive],
  },
  {
    id: "kiiikiii-busan-origin", artistId: "kiiikiii", territoryId: "busan", memberName: { ko: "KiiiKiii", en: "KiiiKiii" }, relationType: "official_activity", evidenceClass: "official",
    story: { ko: "KiiiKiii 공식 채널을 통해 검토한 부산 대표 지역 연결입니다. 개인 장소를 주장하지 않고 공공 해안 명소를 추천합니다.", en: "KiiiKiii's official channel supports this Busan representative connection; the itinerary makes no claim about private locations." }, sourceUrls: [sourceUrls.kiiikiii],
  },
  {
    id: "riize-ulsan-wonbin", artistId: "riize", territoryId: "ulsan", memberName: { ko: "원빈", en: "WONBIN" }, relationType: "hometown", evidenceClass: "verified",
    story: { ko: "공개 RIIZE 프로필로 검토한 원빈의 울산 고향 연결을 장생포 공공 관광 원정의 맥락으로 제공합니다.", en: "Wonbin's Ulsan hometown connection is reviewed against RIIZE's public profile and frames a public Jangsaengpo itinerary." }, sourceUrls: [sourceUrls.riize],
  },
  {
    id: "zerobaseone-cheonan-origin", artistId: "zerobaseone", territoryId: "cheonan", memberName: { ko: "성한빈", en: "SUNG HANBIN" }, relationType: "hometown", evidenceClass: "verified",
    story: { ko: "공개 ZEROBASEONE 멤버 이력으로 검토한 천안 연결입니다. 원정은 공공 독립기념관과 지역 문화공간을 방문합니다.", en: "This Cheonan connection is reviewed through ZEROBASEONE's public member record; the route visits public heritage and culture sites." }, sourceUrls: [sourceUrls.zerobaseone],
  },
  {
    id: "boynextdoor-wonju-origin", artistId: "boynextdoor", territoryId: "wonju", memberName: { ko: "BOYNEXTDOOR", en: "BOYNEXTDOOR" }, relationType: "official_activity", evidenceClass: "official",
    story: { ko: "BOYNEXTDOOR 공식 프로필로 검토한 원주 지역 앵커이며, 공공 박물관과 강변 공간을 연결한 원정입니다.", en: "BOYNEXTDOOR's official profile supports this Wonju regional anchor for a route of public museums and riverside spaces." }, sourceUrls: [sourceUrls.boynextdoor],
  },
  {
    id: "le-sserafim-seoul-eunchae", artistId: "le-sserafim", territoryId: "seoul", memberName: { ko: "홍은채", en: "HONG EUNCHAE" }, relationType: "birthplace", evidenceClass: "verified",
    story: { ko: "공개 멤버 프로필로 검토한 은채의 서울 연결을, 도시의 공공 문화 명소를 잇는 르세라핌 원정으로 소개합니다.", en: "Eunchae's Seoul connection is reviewed through the public member profile and introduces a LE SSERAFIM route of civic cultural venues." }, sourceUrls: [sourceUrls.leSserafim],
  },
  {
    id: "aespa-suwon-karina", artistId: "aespa", territoryId: "suwon", memberName: { ko: "카리나", en: "KARINA" }, relationType: "birthplace", evidenceClass: "verified",
    story: { ko: "공개 aespa 프로필로 검토한 카리나의 수원 연결입니다. 수원화성과 행궁동의 공공 관광 콘텐츠만 안내합니다.", en: "Karina's Suwon connection is reviewed with aespa's public profile; the route lists only public Hwaseong and Haenggung-dong attractions." }, sourceUrls: [sourceUrls.aespa],
  },
  {
    id: "newjeans-chuncheon-minji", artistId: "newjeans", territoryId: "chuncheon", memberName: { ko: "민지", en: "MINJI" }, relationType: "birthplace", evidenceClass: "verified",
    story: { ko: "공개 NewJeans 프로필로 검토한 민지의 춘천 연결을, 호수와 문화예술 공공 관광지로 이어지는 원정의 출발점으로 사용합니다.", en: "Minji's Chuncheon connection is reviewed through the public NewJeans profile and starts a lake-and-culture public itinerary." }, sourceUrls: [sourceUrls.newjeans],
  },
  {
    id: "iu-seoul-origin", artistId: "iu", territoryId: "seoul", memberName: { ko: "아이유", en: "IU" }, relationType: "birthplace", evidenceClass: "verified",
    story: { ko: "음악 유통사의 IU 전기는 서울 출생을 기록합니다. 원정은 사적인 거주지와 무관한 공공 문화 장소를 추천합니다.", en: "The distributor's IU biography records a Seoul birth; this route recommends public cultural venues, not private residences." }, sourceUrls: [sourceUrls.iu],
  },
  {
    id: "seventeen-namyangju-hoshi", artistId: "seventeen", territoryId: "namyangju", memberName: { ko: "호시", en: "HOSHI" }, relationType: "hometown", evidenceClass: "official",
    story: { ko: "SEVENTEEN 공식 프로필에 수록된 호시를 기준으로 남양주를 CARAT 대표 지역으로 정하고, 공공 정원과 역사 공간을 연결합니다.", en: "Using HOSHI in SEVENTEEN's official profile, Namyangju is selected as CARAT's representative region with public garden and history stops." }, sourceUrls: [sourceUrls.seventeen],
  },
];
