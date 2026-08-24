import type { ArtistId, ContentSource, MissionPlaceId, PreviewExpedition, PreviewMissionPlace, TerritoryId } from "@/features/team-preview/types";
import { territories } from "./territories";

type PlaceSeed = Omit<PreviewMissionPlace, "id" | "territoryId" | "relationship" | "artistConnectionId" | "evidenceClass" | "access" | "description" | "transport" | "dwellMinutes" | "visitBase" | "localBenefit" | "sources">;
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
  { territoryId: "daegu", stops: [
    { name: { ko: "서문시장", en: "Seomun Market" }, category: "local_food", address: { ko: "대구광역시 중구 큰장로26길 45", en: "45 Keunjang-ro 26-gil, Jung-gu, Daegu" }, coordinates: { latitude: 35.8687, longitude: 128.5807 }, sourceUrls: ["https://tour.daegu.go.kr/index.do?menu_id=00000021"] },
    { name: { ko: "앞산전망대", en: "Apsan Observatory" }, category: "culture", address: { ko: "대구광역시 남구 앞산순환로 454", en: "454 Apsansunhwan-ro, Nam-gu, Daegu" }, coordinates: { latitude: 35.8288, longitude: 128.5878 }, sourceUrls: ["https://tour.daegu.go.kr/index.do?menu_id=00002959"] },
  ] },
  { territoryId: "gwangju", stops: [
    { name: { ko: "국립아시아문화전당", en: "Asia Culture Center" }, category: "culture", address: { ko: "광주광역시 동구 문화전당로 38", en: "38 Munhwajeondang-ro, Dong-gu, Gwangju" }, coordinates: { latitude: 35.1468, longitude: 126.9202 }, sourceUrls: ["https://www.gwangju.go.kr/contentsView.do?pageId=www241"] },
    { name: { ko: "양림역사문화마을", en: "Yangnim History and Culture Village" }, category: "culture", address: { ko: "광주광역시 남구 양림동 일원", en: "Yangnim-dong, Nam-gu, Gwangju" }, coordinates: { latitude: 35.1402, longitude: 126.9150 }, sourceUrls: ["https://tour.gwangju.go.kr/home/board/B0048.cs?act=read&articleId=6990&m=343"] },
  ] },
  { territoryId: "gunpo", stops: [
    { name: { ko: "수리산", en: "Surisan Mountain" }, category: "culture", address: { ko: "경기도 군포시 수리산로", en: "Surisan-ro, Gunpo-si, Gyeonggi-do" }, coordinates: { latitude: 37.3476, longitude: 126.9277 }, sourceUrls: ["https://gunpo.go.kr/tour/contents.do?key=2160"] },
    { name: { ko: "초막골생태공원", en: "Chomakgol Ecological Park" }, category: "culture", address: { ko: "경기도 군포시 초막골길 216", en: "216 Chomakgol-gil, Gunpo-si, Gyeonggi-do" }, coordinates: { latitude: 37.3424, longitude: 126.9265 }, sourceUrls: ["https://www.gunpo.go.kr/chomakgol/contents.do?key=2284"] },
  ] },
  { territoryId: "seongnam", stops: [
    { name: { ko: "율동공원", en: "Yuldong Park" }, category: "culture", address: { ko: "경기도 성남시 분당구 율동 399", en: "399 Yul-dong, Bundang-gu, Seongnam-si" }, coordinates: { latitude: 37.3781, longitude: 127.1463 }, sourceUrls: ["https://www.seongnam.go.kr/tour/content/view.do?idx=16&menuIdx=1002430"] },
    { name: { ko: "분당중앙공원", en: "Bundang Central Park" }, category: "culture", address: { ko: "경기도 성남시 분당구 성남대로 550", en: "550 Seongnam-daero, Bundang-gu, Seongnam-si" }, coordinates: { latitude: 37.3758, longitude: 127.1222 }, sourceUrls: ["https://www.seongnam.go.kr/tour/index"] },
  ] },
  { territoryId: "geoje", stops: [
    { name: { ko: "바람의 언덕", en: "Windy Hill" }, category: "culture", address: { ko: "경상남도 거제시 남부면 갈곶리 산14-47", en: "San 14-47, Galgot-ri, Nambu-myeon, Geoje-si" }, coordinates: { latitude: 34.7127, longitude: 128.6669 }, sourceUrls: ["https://english.visitkorea.or.kr/svc/whereToGo/locIntrdn/rgnContentsView.do?vcontsId=77569"] },
    { name: { ko: "거제도 포로수용소 유적공원", en: "Geoje P.O.W. Camp Historic Park" }, category: "culture", address: { ko: "경상남도 거제시 계룡로 61", en: "61 Gyeryong-ro, Geoje-si, Gyeongsangnam-do" }, coordinates: { latitude: 34.8639, longitude: 128.6239 }, sourceUrls: ["https://www.geoje.go.kr/user/smarttour/view.geoje?basicSid=73&menuCd="] },
  ] },
  { territoryId: "gyeongju", stops: [
    { name: { ko: "첨성대", en: "Cheomseongdae Observatory" }, category: "culture", address: { ko: "경상북도 경주시 인왕동 839-1", en: "839-1 Inwang-dong, Gyeongju-si" }, coordinates: { latitude: 35.8347, longitude: 129.2191 }, sourceUrls: ["https://www.gyeongju.go.kr/tour/page.do?mnu_uid=2880"] },
    { name: { ko: "대릉원", en: "Daereungwon Tomb Complex" }, category: "culture", address: { ko: "경상북도 경주시 황남동 31-1", en: "31-1 Hwangnam-dong, Gyeongju-si" }, coordinates: { latitude: 35.8395, longitude: 129.2107 }, sourceUrls: ["https://www.gyeongju.go.kr/tour/page.do?mnu_uid=2880"] },
  ] },
  { territoryId: "daejeon", stops: [
    { name: { ko: "한밭수목원", en: "Hanbat Arboretum" }, category: "culture", address: { ko: "대전광역시 서구 둔산대로 169", en: "169 Dunsan-daero, Seo-gu, Daejeon" }, coordinates: { latitude: 36.3665, longitude: 127.3871 }, sourceUrls: ["https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=82059"] },
    { name: { ko: "엑스포과학공원", en: "Expo Science Park" }, category: "culture", address: { ko: "대전광역시 유성구 엑스포로 107", en: "107 Expo-ro, Yuseong-gu, Daejeon" }, coordinates: { latitude: 36.3745, longitude: 127.3866 }, sourceUrls: ["https://www.dime.or.kr/kor/page.do?menuIdx=654"] },
  ] },
  { territoryId: "suwon", stops: [
    { name: { ko: "수원화성", en: "Suwon Hwaseong Fortress" }, category: "culture", address: { ko: "경기도 수원시 팔달구 정조로 825", en: "825 Jeongjo-ro, Paldal-gu, Suwon" }, coordinates: { latitude: 37.2821, longitude: 127.0188 }, sourceUrls: ["https://www.suwon.go.kr/web/visitsuwon/hs01/hs01-01/pages.do?seqNo=35"] },
    { name: { ko: "화성행궁", en: "Hwaseong Haenggung Palace" }, category: "culture", address: { ko: "경기도 수원시 팔달구 정조로 825", en: "825 Jeongjo-ro, Paldal-gu, Suwon" }, coordinates: { latitude: 37.2800, longitude: 127.0141 }, sourceUrls: ["https://www.visitsuwon.or.kr/base/contents/view?contentsNo=2&menuLevel=3&menuNo=4"] },
  ] },
  { territoryId: "yongin", stops: [
    { name: { ko: "용인자연휴양림", en: "Yongin Recreational Forest" }, category: "culture", address: { ko: "경기도 용인시 처인구 모현읍 초부로 220", en: "220 Chobu-ro, Mohyeon-eup, Cheoin-gu, Yongin-si" }, coordinates: { latitude: 37.3127, longitude: 127.2762 }, sourceUrls: ["https://www.yongin.go.kr/home/yitour/ytour01/yttour02/yttourmn01_04.jsp"] },
    { name: { ko: "한국민속촌", en: "Korean Folk Village" }, category: "culture", address: { ko: "경기도 용인시 기흥구 민속촌로 90", en: "90 Minsokchon-ro, Giheung-gu, Yongin-si" }, coordinates: { latitude: 37.2586, longitude: 127.1191 }, sourceUrls: ["https://www.yongin.go.kr/home/yitour/ytour02/yttema01/yttemamn01_01.jsp"] },
  ] },
  { territoryId: "goyang", stops: [
    { name: { ko: "일산호수공원", en: "Ilsan Lake Park" }, category: "culture", address: { ko: "경기도 고양시 일산동구 호수로 595", en: "595 Hosu-ro, Ilsandong-gu, Goyang-si" }, coordinates: { latitude: 37.6594, longitude: 126.7680 }, sourceUrls: ["https://www.goyang.go.kr/visitgoyang/www/contents.do?key=69"] },
    { name: { ko: "행주산성", en: "Haengjusanseong Fortress" }, category: "culture", address: { ko: "경기도 고양시 덕양구 행주로15번길 89", en: "89 Haengju-ro 15beon-gil, Deogyang-gu, Goyang-si" }, coordinates: { latitude: 37.5985, longitude: 126.8245 }, sourceUrls: ["https://www.goyang.go.kr/haengju/haengju01/haengju01_2.jsp"] },
  ] },
  { territoryId: "incheon", stops: [
    { name: { ko: "인천 차이나타운", en: "Incheon Chinatown" }, category: "local_food", address: { ko: "인천광역시 제물포구 차이나타운로26번길 12-17", en: "12-17 Chinatown-ro 26beon-gil, Jemulpo-gu, Incheon" }, coordinates: { latitude: 37.4756, longitude: 126.6170 }, sourceUrls: ["https://itour.incheon.go.kr/ssst/ssst/detail.do?cotId=ITD21122811325905008"] },
    { name: { ko: "송월동 동화마을", en: "Songwol-dong Fairy Tale Village" }, category: "culture", address: { ko: "인천광역시 제물포구 동화마을길 38", en: "38 Donghwamaeul-gil, Jemulpo-gu, Incheon" }, coordinates: { latitude: 37.4771, longitude: 126.6202 }, sourceUrls: ["https://www.incheon.go.kr/infohub/HUB040101"] },
  ] },
  { territoryId: "jeju", stops: [
    { name: { ko: "성산일출봉", en: "Seongsan Ilchulbong" }, category: "culture", address: { ko: "제주특별자치도 서귀포시 성산읍 일출로 284-12", en: "284-12 Ilchul-ro, Seongsan-eup, Seogwipo-si, Jeju" }, coordinates: { latitude: 33.4581, longitude: 126.9425 }, sourceUrls: ["https://www.visitjeju.net/kr/detail/view?contentsid=CONT_000000000500349&menuId=DOM_000001703010003000"] },
    { name: { ko: "제주동문시장", en: "Jeju Dongmun Market" }, category: "local_food", address: { ko: "제주특별자치도 제주시 관덕로14길 20", en: "20 Gwandeok-ro 14-gil, Jeju-si, Jeju" }, coordinates: { latitude: 33.5117, longitude: 126.5260 }, sourceUrls: ["https://www.visitjeju.net/kr/detail/view?contentsid=CNTS_200000000011136&menuId=DOM_200000000010740"] },
  ] },
  { territoryId: "ulsan", stops: [
    { name: { ko: "장생포고래문화마을", en: "Jangsaengpo Whale Culture Village" }, category: "culture", address: { ko: "울산광역시 남구 장생포고래로 271-1", en: "271-1 Jangsaengpogorae-ro, Nam-gu, Ulsan" }, coordinates: { latitude: 35.5033, longitude: 129.3834 }, sourceUrls: ["https://english.visitkorea.or.kr/svc/contents/contentsView.do?menuSn=351&vcontsId=68966"] },
    { name: { ko: "장생포고래박물관", en: "Jangsaengpo Whale Museum" }, category: "culture", address: { ko: "울산광역시 남구 장생포고래로 244", en: "244 Jangsaengpogorae-ro, Nam-gu, Ulsan" }, coordinates: { latitude: 35.5041, longitude: 129.3838 }, sourceUrls: ["https://www.ulsannamgu.go.kr/eng/contents/visiting/whale_tourism.do"] },
  ] },
  { territoryId: "siheung", stops: [
    { name: { ko: "시흥오이도박물관", en: "Siheung Oido Museum" }, category: "culture", address: { ko: "경기도 시흥시 오이도로 332", en: "332 Oido-ro, Siheung-si" }, coordinates: { latitude: 37.3427, longitude: 126.6903 }, sourceUrls: ["https://oidomuseum.siheung.go.kr/ruins/introduce.hs"] },
    { name: { ko: "시흥갯골생태공원", en: "Siheung Gaetgol Eco Park" }, category: "culture", address: { ko: "경기도 시흥시 동서로 287", en: "287 Dongseo-ro, Siheung-si" }, coordinates: { latitude: 37.3902, longitude: 126.7804 }, sourceUrls: ["https://access.visitkorea.or.kr/opentour/detail.do?cotId=44219c7f-c556-474b-b92d-92505fa93199"] },
  ] },
  { territoryId: "cheonan", stops: [
    { name: { ko: "독립기념관", en: "The Independence Hall of Korea" }, category: "culture", address: { ko: "충청남도 천안시 동남구 목천읍 독립기념관로 1", en: "1 Dongnipginyeomgwan-ro, Dongnam-gu, Cheonan-si" }, coordinates: { latitude: 36.7809, longitude: 127.2313 }, sourceUrls: ["https://english.visitkorea.or.kr/svc/contents/contentsView.do?menuSn=351&vcontsId=106450"] },
    { name: { ko: "아라리오갤러리 천안", en: "Arario Gallery Cheonan" }, category: "culture", address: { ko: "충청남도 천안시 동남구 만남로 43", en: "43 Mannam-ro, Dongnam-gu, Cheonan-si" }, coordinates: { latitude: 36.8187, longitude: 127.1569 }, sourceUrls: ["https://mng.cheonan.go.kr/prog/tursmCn/tour/sub01_05_03/view.do?cntno=25&pageIndex=4"] },
  ] },
  { territoryId: "pohang", stops: [
    { name: { ko: "포항 스페이스워크", en: "Pohang Space Walk" }, category: "culture", address: { ko: "경상북도 포항시 북구 환호공원길 30", en: "30 Hwanhogongwon-gil, Buk-gu, Pohang-si" }, coordinates: { latitude: 36.0665, longitude: 129.3919 }, sourceUrls: ["https://pohang.go.kr/phtour/wmap/tourInformation/view.do?cate_id=93&hygiene_grade=0&menu_idx=104&recommended_travel=&recommended_travel_yn=&region=&representative_views=&search_type=t&tour_info_idx=747&type=&vaucher_yn=N"] },
    { name: { ko: "호미곶 해맞이광장", en: "Homigot Sunrise Square" }, category: "culture", address: { ko: "경상북도 포항시 남구 호미곶면 해맞이로150번길 20", en: "20 Homigot-ro 150beon-gil, Homigot-myeon, Nam-gu, Pohang-si" }, coordinates: { latitude: 36.0764, longitude: 129.5662 }, sourceUrls: ["https://pohang.go.kr/phtour/wmap/tourInformation/index.do?menu_idx=45&representative_views=true"] },
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
  { territoryId: "uijeongbu", stops: [
    { name: { ko: "의정부음악도서관", en: "Uijeongbu Music Library" }, category: "culture", address: { ko: "경기도 의정부시 장곡로 280", en: "280 Janggok-ro, Uijeongbu-si" }, coordinates: { latitude: 37.7337, longitude: 127.0579 }, sourceUrls: ["https://www.uilib.go.kr/music/index.do"] },
    { name: { ko: "의정부 부대찌개거리", en: "Uijeongbu Budaejjigae Street" }, category: "local_food", address: { ko: "경기도 의정부시 호국로1309번길 일원", en: "Hoguk-ro 1309beon-gil, Uijeongbu-si" }, coordinates: { latitude: 37.7412, longitude: 127.0470 }, sourceUrls: ["https://ui4u.go.kr/portal/bbs/view.do?bIdx=285664&mId=0301020000&ptIdx=1709"] },
  ] },
  { territoryId: "namyangju", stops: [
    { name: { ko: "정약용유적지", en: "Dasan Heritage Site" }, category: "culture", address: { ko: "경기도 남양주시 조안면 다산로747번길 11", en: "11 Dasan-ro 747beon-gil, Joan-myeon, Namyangju-si" }, coordinates: { latitude: 37.5251, longitude: 127.3032 }, sourceUrls: ["https://www.nyj.go.kr/eng/contents.do?key=806"] },
    { name: { ko: "다산수변공원", en: "Dasan Waterside Park" }, category: "culture", address: { ko: "경기도 남양주시 다산순환로 149", en: "149 Dasansunhwan-ro, Namyangju-si" }, coordinates: { latitude: 37.6244, longitude: 127.1597 }, sourceUrls: ["https://www.nyj.go.kr/culture/viewTnResrceU.do?key=4506&resrceNo=393"] },
  ] },
  { territoryId: "yeongwol", stops: [
    { name: { ko: "청령포", en: "Cheongnyeongpo" }, category: "culture", address: { ko: "강원특별자치도 영월군 영월읍 청령포로 133", en: "133 Cheongnyeongpo-ro, Yeongwol-eup, Yeongwol-gun" }, coordinates: { latitude: 37.1773, longitude: 128.4456 }, sourceUrls: ["https://www.yw.go.kr/tour/selectTourCntntsWebView.do?ctgry=15&key=586&tourNo=242"] },
    { name: { ko: "별마로천문대", en: "Byeolmaro Observatory" }, category: "culture", address: { ko: "강원특별자치도 영월군 영월읍 천문대길 397", en: "397 Cheonmundae-gil, Yeongwol-eup, Yeongwol-gun" }, coordinates: { latitude: 37.1995, longitude: 128.4856 }, sourceUrls: ["https://www.yw.go.kr/tour/contents.do?key=573"] },
  ] },
];

function placeId(territoryId: TerritoryId, order: 1 | 2): MissionPlaceId { return `${territoryId}-${order}`; }
function tourismSource(placeIdValue: string, url: string): ContentSource {
  return {
    id: `${placeIdValue}-official-source`,
    url,
    publisher: new URL(url).hostname,
    reliability: "official_tourism",
    claimSpecific: true,
  };
}
function toMissionPlace(territoryId: TerritoryId, order: 1 | 2, seed: PlaceSeed): PreviewMissionPlace {
  const id = placeId(territoryId, order);
  return { ...seed, id, territoryId, relationship: "nearby_recommendation", artistConnectionId: null, evidenceClass: null, access: "public", description: nearbyDescription, transport: publicTransport, dwellMinutes: 45, visitBase: 100, localBenefit: { ko: "지역 문화와 상권을 함께 경험하는 공공 관광 정류장", en: "A public stop that supports local culture and commerce" }, sources: seed.sourceUrls.map((url) => tourismSource(id, url)) };
}

export const places = territoryStops.flatMap(({ territoryId, stops }) => [toMissionPlace(territoryId, 1, stops[0]), toMissionPlace(territoryId, 2, stops[1])]);

function expedition(legacyArtistId: ArtistId, territoryId: TerritoryId): PreviewExpedition {
  const territory = territories.find((candidate) => candidate.id === territoryId)!;
  return { id: `${legacyArtistId}-${territoryId}-expedition`, artistId: null, territoryId, connectionId: null, title: { ko: `${territory.name.ko} 지역 응원 원정`, en: `${territory.name.en} regional support expedition` }, description: { ko: "아티스트 직접 연관을 주장하지 않고, 공식 관광 출처로 확인한 지역 명소 두 곳을 방문하는 원정입니다.", en: "A two-stop route using official tourism sources without claiming a direct artist connection." }, stopIds: [placeId(territoryId, 1), placeId(territoryId, 2)], transitSummary: { ko: "대중교통 기준 약 90분", en: "About 90 minutes by public transit" }, estimatedMinutes: 90 };
}

const artistExpeditions: PreviewExpedition[] = [
  expedition("bts", "busan"),
  expedition("blackpink", "gunpo"),
  expedition("rescene", "geoje"),
  expedition("cortis", "daejeon"),
  expedition("btob", "suwon"),
  expedition("ive", "daejeon"),
  expedition("kiiikiii", "busan"),
  expedition("riize", "ulsan"),
  expedition("zerobaseone", "cheonan"),
  expedition("boynextdoor", "wonju"),
  expedition("le-sserafim", "seoul"),
  expedition("aespa", "suwon"),
  expedition("newjeans", "chuncheon"),
  expedition("iu", "seoul"),
  expedition("seventeen", "namyangju"),
];

const publicTerritoryExpeditions: PreviewExpedition[] = territoryStops.map(({ territoryId }) => {
  const territory = territories.find((candidate) => candidate.id === territoryId)!;
  return {
    id: `${territoryId}-public-expedition`,
    artistId: null,
    territoryId,
    connectionId: null,
    title: { ko: `${territory.name.ko} 지역 응원 원정`, en: `${territory.name.en} regional support expedition` },
    description: {
      ko: "아티스트 직접 연관을 주장하지 않고, 공식 관광 출처로 확인한 지역 명소 두 곳을 방문하는 원정입니다.",
      en: "A two-stop route using official tourism sources without claiming a direct artist connection.",
    },
    stopIds: [placeId(territoryId, 1), placeId(territoryId, 2)],
    transitSummary: { ko: "지역 대중교통 기준 약 90분", en: "About 90 minutes by local transit" },
    estimatedMinutes: 90,
  };
});

export const expeditions: PreviewExpedition[] = [...artistExpeditions, ...publicTerritoryExpeditions];
