import { GAME_RULES } from "@/features/team-preview/game-rules";
import type { Locale } from "@/features/team-preview/types";

export interface GuideStep {
  id: string;
  /** Element to spotlight, matched with [data-guide="…"]. A step with no
   *  target explains a rule rather than a control, and centres its card. */
  target?: string;
  title: Record<Locale, string>;
  body: Record<Locale, string>;
}

const rules = GAME_RULES;

export const GUIDE_STEPS: readonly GuideStep[] = [
  {
    id: "overview",
    title: { ko: "영토 지도부터 볼게요", en: "Start with the territory map" },
    body: {
      ko: "여기는 팬덤끼리 전국의 영토를 두고 겨루는 화면이에요. 지금부터 각 버튼이 무엇을 하는지, 점수는 어떻게 쌓이고 어디에 반영되는지 하나씩 짚어 드릴게요. 언제든 건너뛸 수 있고, 내 기록에서 다시 볼 수 있어요.",
      en: "This is where fandoms compete for territories across the country. We will walk through what each control does and how points are earned and counted. You can skip anytime and replay it from My Record.",
    },
  },
  {
    id: "summary",
    target: "territory-summary",
    title: { ko: "요약 카드는 바로가기예요", en: "The summary cards are shortcuts" },
    body: {
      ko: "내 팬덤이 가진 영토 수, 가장 강한 영토, 가까운 접전지, 추천 행동을 보여줘요. 카드를 누르면 지도 필터가 그에 맞게 바뀌고 해당 영토가 선택돼요. 특히 마지막 추천 카드를 누르면 지금 가장 시급한 영토로 바로 이동합니다.",
      en: "They show how many territories your fandom holds, your strongest one, the nearest contested one and the recommended move. Tapping a card switches the map filter and selects that territory. The last card jumps straight to the most urgent one.",
    },
  },
  {
    id: "filters",
    target: "map-filters",
    title: { ko: "필터로 지도에 보이는 영토를 고르세요", en: "Filter what the map shows" },
    body: {
      ko: "'내 팬덤'은 우리가 소유한 영토만, '접전 지역'은 점수 차가 적어 뒤집기 쉬운 곳만, '아티스트 연결'은 멤버의 고향·출생지 등 연고가 있는 곳만 보여줘요. '전체'로 두면 모든 영토가 보입니다.",
      en: "\"My fandom\" shows only territories you own, \"Contested\" only those with a small score gap, and \"Artist connection\" only places tied to a member's hometown or birthplace. \"All\" shows everything.",
    },
  },
  {
    id: "map",
    target: "territory-map",
    title: { ko: "지도 위 버튼 세 개", en: "Three buttons on the map" },
    body: {
      ko: "지도 오른쪽 위 버튼은 왼쪽부터 현재 위치, 전국 보기, 전체화면이에요. 현재 위치를 누르면 위치 권한을 물어본 뒤 내 자리를 지도에 표시하고, 전국 보기는 확대한 지도를 처음 상태로 되돌려요. 전체화면을 누르면 지도만 화면 가득 펼쳐지고, 같은 자리의 버튼을 다시 누르면 닫힙니다.",
      en: "Top right, left to right: my location, national view and full screen. My location asks for permission and marks where you are, national view returns the zoomed map to its starting frame, and full screen expands the map alone until you press the same spot again.",
    },
  },
  {
    id: "list",
    target: "territory-list",
    title: { ko: "영토 카드를 누르면 지도와 연결돼요", en: "Territory cards drive the map" },
    body: {
      ko: "각 카드는 영토 이름, 현재 소유 팬덤, 거점 단계, 그리고 '방어 우위' 또는 '탈환까지' 점수를 보여줘요. 카드를 누르면 지도가 그 영토로 이동하면서 아래에 전술 패널이 열리고, 같은 카드를 한 번 더 누르면 선택이 풀립니다.",
      en: "Each card shows the territory, the fandom that owns it, its stronghold stage and either the defence lead or the points needed to capture it. Tapping one moves the map there and opens the tactical panel; tapping it again clears the selection.",
    },
  },
  {
    id: "pager",
    target: "tactical-pager",
    title: { ko: "전술 패널은 좌우로 넘길 수 있어요", en: "Page through the tactical panel" },
    body: {
      ko: "화살표나 점을 누르면 필터에 걸린 영토들을 차례로 넘겨볼 수 있어요. 휴대폰에서는 카드를 좌우로 밀어도 넘어갑니다. 넘길 때마다 지도 표시도 함께 바뀌지만, 화면은 그대로 있어서 카드를 계속 볼 수 있어요.",
      en: "The arrows and dots step through the territories your filter shows, and on a phone you can swipe the card sideways. The map follows each change while the page stays where it is, so the card stays in front of you.",
    },
  },
  {
    id: "standings",
    target: "tactical-standings",
    title: { ko: "지금 점수 차이를 확인하세요", en: "Check the current gap" },
    body: {
      ko: "이 영토에서 팬덤별로 쌓인 유효 포인트 순위예요. 시즌이 끝날 때 가장 높은 팬덤이 그 영토를 가져갑니다. 우리가 2위라면 1위와의 차이만큼만 더 쌓으면 탈환할 수 있다는 뜻이에요.",
      en: "This ranks the valid points each fandom has banked in this territory. The highest total at the end of the season takes it, so if you are second, the gap is exactly what you need to make up.",
    },
  },
  {
    id: "connection",
    target: "tactical-connection",
    title: { ko: "왜 이 지역인지 근거를 밝혀요", en: "Why this place is linked" },
    body: {
      ko: "멤버의 고향, 출생지, 공식 활동처럼 이 지역과 아티스트를 잇는 연결고리와 그 출처 링크를 보여줘요. 출처를 눌러 원문을 직접 확인할 수 있고, 아직 검증이 끝나지 않은 자료는 그렇게 표시됩니다.",
      en: "It names the tie between the artist and the region — a member's hometown, birthplace or official activity — with a source link you can open. Leads that have not finished verification say so.",
    },
  },
  {
    id: "award",
    target: "tactical-award",
    title: { ko: "점수는 이렇게 쌓여요", en: "How points add up" },
    body: {
      ko: `장소에 체크인하면 항목별로 점수가 붙어요. 방문은 장소마다 정해진 기본 점수, 체류는 ${rules.dwellShortMinutes}분 이상 머물면 ${rules.dwell30Minutes}P·${rules.dwellLongMinutes}분 이상이면 ${rules.dwell60Minutes}P, 지역 소비 인증은 ${rules.localSpend}P, 숙박 인증은 ${rules.accommodation}P예요. 우리가 이미 가진 영토라면 거점 버프가 더 붙습니다.`,
      en: `Checking in at a place awards points per item: a base score for the visit, ${rules.dwell30Minutes}P for staying ${rules.dwellShortMinutes} minutes and ${rules.dwell60Minutes}P for ${rules.dwellLongMinutes}, ${rules.localSpend}P for verified local spending and ${rules.accommodation}P for a verified overnight stay. Territories you already hold add a stronghold buff on top.`,
    },
  },
  {
    id: "stronghold",
    title: { ko: "거점 단계가 오르면 버프가 커져요", en: "Stronghold stages widen the buff" },
    body: {
      ko: `영토에 쌓인 유효 포인트가 그 영토의 거점 단계를 정해요. 씨앗에서 시작해 ${rules.strongholdTreeAt.toLocaleString()}P에서 나무, ${rules.strongholdLandmarkAt.toLocaleString()}P에서 랜드마크가 됩니다. 씨앗이면 방문에 +${rules.strongholdVisitBonus}P, 나무부터는 체류에 +${rules.strongholdDwellBonus}P, 랜드마크는 지역 소비에 +${rules.strongholdSpendBonus}P까지 더해져요. 오래 지킨 영토일수록 지키기 쉬워지는 구조예요.`,
      en: `Valid points banked in a territory set its stronghold stage: a seed to start, a tree at ${rules.strongholdTreeAt.toLocaleString()}P and a landmark at ${rules.strongholdLandmarkAt.toLocaleString()}P. A seed adds +${rules.strongholdVisitBonus}P to visits, a tree adds +${rules.strongholdDwellBonus}P to dwell time, and a landmark adds +${rules.strongholdSpendBonus}P to local spending. The longer you hold a territory, the easier it is to keep.`,
    },
  },
  {
    id: "impact",
    target: "tactical-impact",
    title: { ko: "배수와 상한이 최종 점수를 정해요", en: "Multipliers and caps decide the final score" },
    body: {
      ko: `항목 점수를 더한 뒤 배수를 곱해 유효 포인트가 정해져요. 인구가 줄어드는 지역에는 지역균형 보너스 배수가 붙어 같은 활동도 더 크게 반영되고, 팬덤 규모에 따른 보정도 들어갑니다. 같은 장소를 반복하면 ${rules.repeatDecay.map((value) => `${Math.round(value * 100)}%`).join(" → ")}로 줄고, 하루에 반영되는 상한은 ${rules.dailyCap.toLocaleString()}P예요.`,
      en: `The item scores are summed and then multiplied into valid points. Regions losing population carry a balance bonus so the same activity counts for more, and fandom size adjusts it too. Repeating one place decays ${rules.repeatDecay.map((value) => `${Math.round(value * 100)}%`).join(" → ")}, and a day contributes at most ${rules.dailyCap.toLocaleString()}P.`,
    },
  },
  {
    id: "start-expedition",
    target: "start-expedition",
    title: { ko: "원정을 시작해 볼까요", en: "Start an expedition" },
    body: {
      ko: "이 버튼을 누르면 원정 탭으로 옮겨가면서, 이 영토에서 방문할 장소들이 순서대로 정리된 코스가 열려요. 장소마다 예상 점수와 최대 점수를 미리 확인할 수 있습니다.",
      en: "This button moves you to the Expeditions tab and opens the route for this territory, listing the places to visit in order with the points each one can award.",
    },
  },
  {
    id: "check-in",
    title: { ko: "현장에서 체크인하면 반영돼요", en: "Check in on site to bank it" },
    body: {
      ko: "원정 화면에서 장소마다 체크인 버튼이 있어요. 누르면 위치와 현장 사진으로 방문을 인증하고, 인증이 끝나면 그만큼의 유효 포인트가 그 영토의 우리 팬덤 점수에 더해집니다. 점수가 쌓이면 소유 팬덤과 거점 단계가 바뀌고, 랭킹과 내 기록에도 곧바로 반영돼요.",
      en: "Each stop on the expedition screen has a check-in button. It verifies your visit with your location and an on-site photo, and the valid points then join your fandom's total in that territory — which can change who owns it, raise its stronghold stage, and show up in the ranking and My Record.",
    },
  },
];

export const GUIDE_STEP_COUNT = GUIDE_STEPS.length;
