import type { ArtistConnection, ArtistProfile } from "@/features/team-preview/types";
import { connectionSource, evidenceClassOf } from "./connection-evidence";

export const artists: ArtistProfile[] = [
  { id: "bts", artistName: { ko: "방탄소년단", en: "BTS" }, fandomName: "ARMY", color: "#7c5ce0", markerLabel: "BTS", representativeTerritoryIds: ["busan", "daegu", "gwangju"] },
  { id: "blackpink", artistName: { ko: "블랙핑크", en: "BLACKPINK" }, fandomName: "BLINK", color: "#f25da5", markerLabel: "BP", representativeTerritoryIds: ["gunpo", "seongnam"] },
  { id: "rescene", artistName: { ko: "리센느", en: "RESCENE" }, fandomName: "REMINE", color: "#d66d55", markerLabel: "RS", representativeTerritoryIds: ["geoje", "suwon", "gyeongju"] },
  { id: "cortis", artistName: { ko: "코르티스", en: "CORTIS" }, fandomName: "COER", color: "#4d7cfe", markerLabel: "CT", representativeTerritoryIds: ["daejeon", "suwon", "seoul"] },
  { id: "btob", artistName: { ko: "비투비", en: "BTOB" }, fandomName: "MELODY", color: "#2e9d78", markerLabel: "BTOB", representativeTerritoryIds: ["yongin", "suwon", "goyang"] },
  { id: "ive", artistName: { ko: "아이브", en: "IVE" }, fandomName: "DIVE", color: "#e0384a", markerLabel: "IVE", representativeTerritoryIds: ["daejeon", "incheon", "jeju"] },
  { id: "kiiikiii", artistName: { ko: "키키", en: "KiiiKiii" }, fandomName: "TiiiKiii", color: "#8b5cf6", markerLabel: "K3", representativeTerritoryIds: ["busan", "seoul"] },
  { id: "riize", artistName: { ko: "라이즈", en: "RIIZE" }, fandomName: "BRIIZE", color: "#f28a45", markerLabel: "RZ", representativeTerritoryIds: ["ulsan", "siheung", "seoul"] },
  { id: "zerobaseone", artistName: { ko: "제로베이스원", en: "ZEROBASEONE" }, fandomName: "ZEROSE", color: "#3a9edb", markerLabel: "ZB1", representativeTerritoryIds: ["cheonan", "pohang", "wonju"] },
  { id: "boynextdoor", artistName: { ko: "보이넥스트도어", en: "BOYNEXTDOOR" }, fandomName: "ONEDOOR", color: "#59a85f", markerLabel: "BND", representativeTerritoryIds: ["wonju", "gwangju", "busan", "suwon"] },
  { id: "le-sserafim", artistName: { ko: "르세라핌", en: "LE SSERAFIM" }, fandomName: "FEARNOT", color: "#a964d7", markerLabel: "LSF", representativeTerritoryIds: ["seoul"] },
  { id: "aespa", artistName: { ko: "에스파", en: "aespa" }, fandomName: "MY", color: "#4c66d6", markerLabel: "æ", representativeTerritoryIds: ["suwon", "busan"] },
  { id: "newjeans", artistName: { ko: "뉴진스", en: "NewJeans" }, fandomName: "Bunnies", color: "#4b9de0", markerLabel: "NJ", representativeTerritoryIds: ["chuncheon", "incheon", "seoul"] },
  { id: "iu", artistName: { ko: "아이유", en: "IU" }, fandomName: "UAENA", color: "#8e2f6f", markerLabel: "IU", representativeTerritoryIds: ["seoul", "uijeongbu"] },
  { id: "seventeen", artistName: { ko: "세븐틴", en: "SEVENTEEN" }, fandomName: "CARAT", color: "#45a9ad", markerLabel: "SVT", representativeTerritoryIds: ["namyangju"] },
];

/**
 * Every region–fandom tie below comes from the team's research document, and
 * each one carries the article that makes the claim. Pairs the document does
 * not cover are absent on purpose: a label's profile page proves the group
 * exists, not that a member belongs to a place, and a tie we cannot show a
 * reader is a tie we do not assert.
 */
interface ConnectionSeed {
  id: string;
  artistId: ArtistConnection["artistId"];
  territoryId: string;
  memberName: { ko: string; en: string };
  relationType: ArtistConnection["relationType"];
  story: { ko: string; en: string };
  sourceUrls: string[];
}

const documentedConnections: ConnectionSeed[] = [
  {
    id: "bts-busan-jimin-jungkook", artistId: "bts", territoryId: "busan",
    memberName: { ko: "지민·정국", en: "Jimin & Jung Kook" }, relationType: "hometown",
    story: {
      ko: "부산 출신인 지민과 정국의 연고를 부산 관광과 엮어 소개한 보도입니다.",
      en: "Reporting that ties Jimin and Jung Kook's Busan roots to touring the city.",
    },
    sourceUrls: ["https://www.yna.co.kr/view/AKR20190613035800051"],
  },
  {
    id: "bts-daegu-suga-v", artistId: "bts", territoryId: "daegu",
    memberName: { ko: "슈가·뷔", en: "SUGA & V" }, relationType: "hometown",
    story: {
      ko: "슈가와 뷔를 대구 출신 BTS 멤버로 언급한 보도입니다.",
      en: "Reporting that names SUGA and V as the Daegu-born members of BTS.",
    },
    sourceUrls: ["https://www.yna.co.kr/view/AKR20260601054651053"],
  },
  {
    id: "bts-gwangju-jhope", artistId: "bts", territoryId: "gwangju",
    memberName: { ko: "제이홉", en: "j-hope" }, relationType: "official_activity",
    story: {
      ko: "광주시가 제이홉의 고향이라는 점을 살려 만든 관광 홍보영상 사례입니다.",
      en: "Gwangju built a city tourism film around j-hope's hometown.",
    },
    sourceUrls: ["https://www.yna.co.kr/amp/view/AKR20211102122700054"],
  },
  {
    id: "bts-seoul-tourism-campaign", artistId: "bts", territoryId: "seoul",
    memberName: { ko: "BTS", en: "BTS" }, relationType: "official_activity",
    story: {
      ko: "서울시와 한국관광공사가 BTS와 함께 진행한 공식 서울 관광 캠페인입니다.",
      en: "Seoul and the Korea Tourism Organization ran their official Seoul tourism campaign with BTS.",
    },
    sourceUrls: [
      "https://english.seoul.go.kr/seoul-runs-a-global-campaign-of-seoul-tourism-with-bts/",
      "https://english.visitseoul.net/hallyu/just-the-way-bts-was-being-in-seoul_/25729",
      "https://english.visitseoul.net/editorspicks/BTS-Tour-eng_/43789",
      "https://www.korea.net/NewsFocus/FoodTravel/view?articleId=220515",
      "https://english.visitkorea.or.kr/svc/contents/contentsView.do?menuSn=219&vcontsId=1580863",
    ],
  },
  {
    id: "blackpink-gunpo-jisoo", artistId: "blackpink", territoryId: "gunpo",
    memberName: { ko: "지수", en: "JISOO" }, relationType: "birthplace",
    story: {
      ko: "지수의 출생지를 경기 군포시로 소개한 매체 자료입니다.",
      en: "A magazine profile giving JISOO's birthplace as Gunpo, Gyeonggi.",
    },
    sourceUrls: ["https://www.lofficielkorea.com/fashion/salomonglobalambassadorjisoo"],
  },
  {
    id: "blackpink-seongnam-jennie", artistId: "blackpink", territoryId: "seongnam",
    memberName: { ko: "제니", en: "JENNIE" }, relationType: "birthplace",
    story: {
      ko: "제니의 출생지를 성남시 분당구로 기재한 인물 프로필 자료입니다.",
      en: "A person profile listing JENNIE's birthplace as Bundang-gu, Seongnam.",
    },
    sourceUrls: ["https://www.sapiens.inc/person/person-122"],
  },
  {
    id: "rescene-geoje-wonyi", artistId: "rescene", territoryId: "geoje",
    memberName: { ko: "원이", en: "WONYI" }, relationType: "hometown",
    story: {
      ko: "원이의 거제 연고와 거제 지역 콘텐츠를 직접 다룬 기사입니다.",
      en: "An article on WONYI's Geoje roots and the city's own content around it.",
    },
    sourceUrls: ["https://www.harpersbazaar.co.kr/article/1904188"],
  },
  {
    id: "rescene-suwon-ambassador", artistId: "rescene", territoryId: "suwon",
    memberName: { ko: "리브", en: "RIIV" }, relationType: "official_activity",
    story: {
      ko: "리브의 수원 연고를 계기로 리센느가 수원시 홍보대사로 위촉되어 수원 방문의 해와 수원화성문화제 홍보에 참여했습니다.",
      en: "RESCENE were named Suwon ambassadors on the strength of RIIV's ties there, promoting the Visit Suwon year and the Hwaseong Festival.",
    },
    sourceUrls: [
      "https://www.suwon.go.kr/web/board/BD_board.view.do?bbsCd=1043&seq=20260624100424916",
      "https://news.suwon.go.kr/_Ext/news/viewPrint.php?reqIdx=202606241007287463",
      "https://www.koreajoongangdaily.com/entertainment/girl-group-rescene-to-frame-suwon-as-destination-city-as-ambassadors/12738541",
      "https://www.newspim.com/news/view/20260906000068",
    ],
  },
  {
    id: "rescene-gyeongju-zena", artistId: "rescene", territoryId: "gyeongju",
    memberName: { ko: "제나", en: "ZENA" }, relationType: "official_activity",
    story: {
      ko: "경주 출신 제나를 포함한 리센느가 경주시 관광홍보대사로 위촉되었습니다.",
      en: "RESCENE, including Gyeongju-born ZENA, were appointed Gyeongju tourism ambassadors.",
    },
    sourceUrls: ["https://www.yna.co.kr/view/AKR20260629067000053"],
  },
  {
    id: "rescene-goyang-may", artistId: "rescene", territoryId: "goyang",
    memberName: { ko: "메이", en: "MAY" }, relationType: "official_activity",
    story: {
      ko: "메이의 고향 고양시가 리센느를 홍보대사로 위촉했습니다.",
      en: "Goyang, MAY's hometown, named RESCENE its honorary ambassadors.",
    },
    sourceUrls: [
      "https://www3.edaily.co.kr/News/Read?mediaCodeNo=257&newsId=02617446645510912",
      "https://www.koreajoongangdaily.com/entertainment/girl-group-rescene-named-honorary-ambassador-of-member-mays-hometown-goyang/12754074",
    ],
  },
  {
    id: "cortis-daejeon-seonghyeon", artistId: "cortis", territoryId: "daejeon",
    memberName: { ko: "성현", en: "SEONGHYEON" }, relationType: "official_activity",
    story: {
      ko: "성현의 고향 대전에서 진행된 지역 스포츠 행사 참여입니다.",
      en: "SEONGHYEON took part in a local sports event in Daejeon, his hometown.",
    },
    sourceUrls: ["https://www.xportsnews.com/article/2190118"],
  },
  {
    id: "cortis-suwon-gunho", artistId: "cortis", territoryId: "suwon",
    memberName: { ko: "건호", en: "GUNHO" }, relationType: "official_activity",
    story: {
      ko: "수원 출신 건호가 수원 KT 위즈파크 홈 개막전 시구에 나섰습니다.",
      en: "Suwon-born GUNHO threw the first pitch at KT Wiz Park's home opener.",
    },
    sourceUrls: ["https://www.yna.co.kr/view/AKR20260401152500007"],
  },
  {
    id: "cortis-seoul-activity", artistId: "cortis", territoryId: "seoul",
    memberName: { ko: "CORTIS", en: "CORTIS" }, relationType: "official_activity",
    story: {
      ko: "서울에서 연 데뷔 쇼케이스와 서울 공간 콘텐츠 등 실제 서울 활동 기록입니다.",
      en: "CORTIS's own Seoul activity: the debut showcase and a Seoul space collaboration.",
    },
    sourceUrls: [
      "https://en.yna.co.kr/view/AEN20250818008200315",
      "https://www.koreajoongangdaily.com/entertainment/cortis-on-its-self-produced-album-and-btss-advice-they-told-us-to-stay-humble/12418459",
      "https://www.mk.co.kr/en/culture/12032454",
    ],
  },
  {
    id: "btob-suwon-changsub", artistId: "btob", territoryId: "suwon",
    memberName: { ko: "이창섭", en: "Lee Changsub" }, relationType: "hometown",
    story: {
      ko: "수원가요제 대상 수상자로 이창섭을 기록한 수원시 인터넷신문 자료입니다.",
      en: "Suwon's city paper records Lee Changsub as a grand-prize winner of the Suwon song festival.",
    },
    sourceUrls: ["https://news.suwon.go.kr/?mode=blog&reqIdx=121237389894085433&viewMode=view"],
  },
  {
    id: "btob-yongin-eunkwang-sungjae", artistId: "btob", territoryId: "yongin",
    memberName: { ko: "서은광·육성재", en: "Seo Eunkwang & Yook Sungjae" }, relationType: "hometown",
    story: {
      ko: "서은광과 육성재를 '용인의 아들들'로 소개하며 진행한 지역 콘텐츠입니다.",
      en: "Local content introducing Seo Eunkwang and Yook Sungjae as sons of Yongin.",
    },
    sourceUrls: ["https://enews.imbc.com/News/RetrieveNewsInfo/499610"],
  },
  {
    id: "ive-daejeon-anyujin", artistId: "ive", territoryId: "daejeon",
    memberName: { ko: "안유진", en: "AN YUJIN" }, relationType: "official_activity",
    story: {
      ko: "안유진과 대전의 지역 연고를 다룬 보도입니다.",
      en: "Reporting on AN YUJIN's connection with Daejeon.",
    },
    sourceUrls: ["https://www.yna.co.kr/view/AKR20241108137300063"],
  },
  {
    id: "ive-incheon-gaeul", artistId: "ive", territoryId: "incheon",
    memberName: { ko: "가을", en: "GAEUL" }, relationType: "hometown",
    story: {
      ko: "가을을 인천 부평구 출신으로 소개하고 인천 청소년 댄스대회 캐스팅 이력을 함께 다룬 기사입니다.",
      en: "An article placing GAEUL in Bupyeong-gu, Incheon, and recounting her casting at an Incheon youth dance contest.",
    },
    sourceUrls: ["https://www.st-news.co.kr/news/articleView.html?idxno=6474"],
  },
  {
    id: "kiiikiii-seoul-ambassador", artistId: "kiiikiii", territoryId: "seoul",
    memberName: { ko: "KiiiKiii", en: "KiiiKiii" }, relationType: "official_activity",
    story: {
      ko: "서울시가 KiiiKiii를 '서울색' 홍보대사로 위촉한 공식 자료입니다.",
      en: "Seoul's own record of appointing KiiiKiii as ambassadors for its city colour campaign.",
    },
    sourceUrls: ["https://culture.seoul.go.kr/culture/bbs/B0000001/view.do?menuNo=200051&nttId=15681"],
  },
  {
    id: "riize-ulsan-wonbin", artistId: "riize", territoryId: "ulsan",
    memberName: { ko: "원빈", en: "WONBIN" }, relationType: "hometown",
    story: {
      ko: "원빈의 울산 연고가 언급된 방송 관련 보도입니다.",
      en: "Broadcast reporting that notes WONBIN's Ulsan roots.",
    },
    sourceUrls: ["https://www.bntnews.co.kr/article/view/bnt202606200086"],
  },
  {
    id: "zerobaseone-pohang-jiwoong", artistId: "zerobaseone", territoryId: "pohang",
    memberName: { ko: "김지웅", en: "KIM JIWOONG" }, relationType: "hometown",
    story: {
      ko: "포항 출신 김지웅이 포항 산불 피해 지원 성금을 기부한 사례입니다.",
      en: "Pohang-born KIM JIWOONG donated to relief for the Pohang wildfires.",
    },
    sourceUrls: ["https://enews.imbc.com/News/ViewAmp/454784"],
  },
  {
    id: "zerobaseone-wonju-jiwoong", artistId: "zerobaseone", territoryId: "wonju",
    memberName: { ko: "김지웅", en: "KIM JIWOONG" }, relationType: "official_activity",
    story: {
      ko: "김지웅이 원주를 찾아 지역 주민과 함께한 프로그램에 참여했습니다.",
      en: "KIM JIWOONG joined a local programme with Wonju residents on a visit home.",
    },
    sourceUrls: ["https://en.fannstar.tf.co.kr/fnnews/read/157928?c=4"],
  },
  {
    id: "boynextdoor-busan-leehan", artistId: "boynextdoor", territoryId: "busan",
    memberName: { ko: "이한", en: "LEEHAN" }, relationType: "hometown",
    story: {
      ko: "이한의 부산 출신 사실을 다룬 방송사 보도자료입니다.",
      en: "A broadcaster's press material on LEEHAN's Busan origins.",
    },
    sourceUrls: ["https://mbcinfo.imbc.com/press/view?code=36623"],
  },
  {
    id: "boynextdoor-wonju-sungho", artistId: "boynextdoor", territoryId: "wonju",
    memberName: { ko: "성호", en: "SUNGHO" }, relationType: "hometown",
    story: {
      ko: "성호가 원주 출신으로 소개된 방송 관련 보도입니다.",
      en: "Broadcast reporting introducing SUNGHO as being from Wonju.",
    },
    sourceUrls: ["https://www.bntnews.co.kr/article/view/bnt202606200086"],
  },
  {
    id: "le-sserafim-seoul-popup", artistId: "le-sserafim", territoryId: "seoul",
    memberName: { ko: "LE SSERAFIM", en: "LE SSERAFIM" }, relationType: "official_activity",
    story: {
      ko: "서울 용산에서 연 공식 팝업 일정입니다.",
      en: "Their official pop-up held in Yongsan, Seoul.",
    },
    sourceUrls: ["https://weverse.io/lesserafim/notice/35772"],
  },
  {
    id: "aespa-busan-winter", artistId: "aespa", territoryId: "busan",
    memberName: { ko: "윈터", en: "WINTER" }, relationType: "official_activity",
    story: {
      ko: "윈터가 2024 부산세계탁구선수권대회 홍보대사와 공식 주제가에 참여한 부산시 공식 자료입니다.",
      en: "Busan's own record of WINTER serving as an ambassador and singing the theme for the 2024 World Table Tennis Championships.",
    },
    sourceUrls: ["https://www.busan.go.kr/nbtnewsBU/1580227"],
  },
  {
    id: "aespa-suwon-karina", artistId: "aespa", territoryId: "suwon",
    memberName: { ko: "카리나", en: "KARINA" }, relationType: "hometown",
    story: {
      ko: "카리나가 수원 출신이라는 점과 지역 연고가 직접 언급된 보도입니다.",
      en: "Reporting that names KARINA as Suwon's own and follows the tie to a first pitch.",
    },
    sourceUrls: [
      "https://sports.khan.co.kr/article/202406130951003",
      "https://www.koreajoongangdaily.com/business/contract-compels-suwons-favorite-daughter-aespas-karina-to-throw-first-pitch-for-lotte-giants/11239394",
    ],
  },
  {
    id: "newjeans-chuncheon-minji", artistId: "newjeans", territoryId: "chuncheon",
    memberName: { ko: "민지", en: "MINJI" }, relationType: "hometown",
    story: {
      ko: "춘천시가 춘천 출신 인물로 민지를 소개하고 지역 홍보에 활용한 공식 소식지입니다.",
      en: "Chuncheon's own city newsletter presents MINJI as a daughter of the city and uses her for city outreach.",
    },
    sourceUrls: ["https://bomnae.chuncheon.go.kr/contentView?contentNo=2672&no=423"],
  },
  {
    id: "newjeans-incheon-activity", artistId: "newjeans", territoryId: "incheon",
    memberName: { ko: "NewJeans", en: "NewJeans" }, relationType: "official_activity",
    story: {
      ko: "인천국제공항에서의 실제 활동 사례로, 출신 연고가 아닌 지역 내 활동입니다.",
      en: "Activity at Incheon International Airport — presence in the region rather than roots in it.",
    },
    sourceUrls: ["https://www.newsen.com/news_view.php?uid=202310091240431310"],
  },
  {
    id: "seventeen-namyangju-hoshi", artistId: "seventeen", territoryId: "namyangju",
    memberName: { ko: "호시", en: "HOSHI" }, relationType: "hometown",
    story: {
      ko: "남양주 출신 호시가 남양주 소외계층을 위해 기부한 사례입니다.",
      en: "Namyangju-born HOSHI donated to support underserved residents of the city.",
    },
    sourceUrls: [
      "https://www.yna.co.kr/view/AKR20210610146000060",
      "https://en.sedaily.com/news/2026/06/15/seventeens-hoshi-100-million-won-donation-builds-new",
    ],
  },
];

const evidenceNotes = {
  official: {
    ko: "해당 지자체·기관 또는 아티스트 측이 직접 남긴 공식 기록입니다.",
    en: "An official record left by the city, institution or artist themselves.",
  },
  verified: {
    ko: "서로 다른 두 곳 이상의 매체 보도로 확인된 연결입니다.",
    en: "Confirmed by reporting from two or more independent publishers.",
  },
  team_data: {
    ko: "단일 매체 또는 프로필 자료에 근거한 연결로, 추가 검증 여지가 있습니다.",
    en: "Based on a single report or profile reference, so it remains open to further verification.",
  },
} as const;

export const connections: ArtistConnection[] = documentedConnections.map((seed) => {
  const sources = seed.sourceUrls.map(connectionSource);
  const evidenceClass = evidenceClassOf(sources);
  return { ...seed, evidenceClass, evidenceNote: evidenceNotes[evidenceClass], sources };
});
