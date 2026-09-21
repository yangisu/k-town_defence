import { GAME_RULES } from "@/features/team-preview/game-rules";
import type { Locale } from "@/features/team-preview/types";

export type GuideTab = "explore" | "journey" | "expedition";

export interface GuideStep {
  id: string;
  /** Tab this step describes. The guide opens it before showing the step, so a
   *  replay started from another page still lands on the control it explains. */
  tab: GuideTab;
  /** Steps about the tactical panel need a territory chosen, or the panel the
   *  step describes is not rendered at all. */
  needsTerritory?: boolean;
  /** A step that waits for the reader to do the thing it describes. The guide
   *  stops advancing on a click and moves on once the deed is done. The
   *  spotlight beckons while it waits. */
  awaits?: "territory" | "expedition";
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
    tab: "explore",
    title: { ko: "K-Defense 시작하기", en: "Getting started with K-Defense" },
    body: {
      ko: "지금부터 팬덤끼리 영토를 뺏고 뺏기는 디펜스 게임에 대한 설명을 드리겠습니다. 언제든지 '내 기록'에서 다시 볼 수 있어요.",
      en: "Here is how fandoms take and hold territories from each other. You can replay this anytime from My Record.",
    },
  },
  {
    // One card, not the whole list: a reader told to tap "a card" on a phone
    // reached for the filter above it instead, and the guide shrank around the
    // open menu. This points at exactly one thing to press.
    id: "select-region",
    tab: "explore",
    awaits: "territory",
    target: "territory-card-first",
    title: { ko: "여행할 지역 선택하기", en: "Choose where to travel" },
    body: {
      ko: "여행할 지역을 골라볼까요. 맨 위 지역 카드를 눌러보세요. 연습이라 점수에는 반영되지 않아요.",
      en: "Pick somewhere to travel. Tap the card at the top of the list — this is practice, so nothing is scored.",
    },
  },
  {
    id: "standings",
    tab: "explore",
    needsTerritory: true,
    target: "tactical-standings",
    title: { ko: "지금 점수 차이", en: "The current gap" },
    body: {
      ko: "이 지역을 두고 팬덤들이 쌓아 온 유효 포인트예요. 맨 윗줄이 지금 이 영토를 가진 팬덤이고, 아래에 우리 팬덤이 몇 점 뒤졌는지가 나옵니다. 시즌이 끝나는 순간 1위인 팬덤이 이 영토를 가져가요.",
      en: "The valid points each fandom has banked here. The top line is whoever holds the territory right now, and below it is how far your fandom has to go. Whoever leads the moment the season ends takes it.",
    },
  },
  {
    id: "stronghold",
    tab: "explore",
    needsTerritory: true,
    target: "stronghold-mark",
    title: { ko: "거점 단계", en: "Stronghold stages" },
    body: {
      ko: `소유한 팬덤의 포인트가 쌓이면 거점이 자라요. ${rules.strongholdTreeAt.toLocaleString()}P에서 씨앗이 나무가 되고, ${rules.strongholdLandmarkAt.toLocaleString()}P에서 랜드마크가 됩니다. 단계가 오를수록 그 영토를 방문할 때 받는 버프가 커져요.`,
      en: `The holder's banked points grow the stronghold: a seed becomes a tree at ${rules.strongholdTreeAt.toLocaleString()}P and a landmark at ${rules.strongholdLandmarkAt.toLocaleString()}P. Each stage widens the buff you get for visiting.`,
    },
  },
  {
    id: "award",
    tab: "explore",
    needsTerritory: true,
    target: "tactical-award",
    title: { ko: "점수 쌓는 법", en: "How points add up" },
    body: {
      ko: `체크인하면 항목별로 붙어요. 체류 ${rules.dwellShortMinutes}분 ${rules.dwell30Minutes}P, ${rules.dwellLongMinutes}분 ${rules.dwell60Minutes}P, 지역 소비 ${rules.localSpend}P, 숙박 ${rules.accommodation}P.`,
      en: `A check-in awards each item: ${rules.dwell30Minutes}P for ${rules.dwellShortMinutes} minutes, ${rules.dwell60Minutes}P for ${rules.dwellLongMinutes}, ${rules.localSpend}P for local spending, ${rules.accommodation}P for a stay.`,
    },
  },
  {
    id: "impact",
    tab: "explore",
    needsTerritory: true,
    target: "tactical-impact",
    title: { ko: "지역 배수", en: "Regional multipliers" },
    body: {
      ko: `인구가 줄어드는 지역일수록 배수가 붙어요. 같은 장소를 반복하면 ${rules.repeatDecay.map((value) => `${Math.round(value * 100)}%`).join(" → ")}로 줄어듭니다.`,
      en: `Regions losing population carry a bonus multiplier. Repeating one place decays ${rules.repeatDecay.map((value) => `${Math.round(value * 100)}%`).join(" → ")}.`,
    },
  },
  {
    // The guide follows the reader onto the route rather than describing it
    // from the map, so pressing this is what carries them to the next chapter.
    id: "start-expedition",
    tab: "explore",
    needsTerritory: true,
    awaits: "expedition",
    target: "start-expedition",
    title: { ko: "원정 시작", en: "Start an expedition" },
    body: {
      ko: "이 버튼을 눌러보세요. 이 영토에서 방문할 장소가 순서대로 열리고, 원정 페이지로 바로 넘어갑니다.",
      en: "Press this. The stops for this territory open in order, and you go straight to the expedition page.",
    },
  },
  {
    id: "expedition-hero",
    tab: "expedition",
    target: "expedition-hero",
    title: { ko: "이번 원정 한눈에", en: "This expedition at a glance" },
    body: {
      ko: "원정 페이지 맨 위에는 이 경로의 요약이 있어요. 예상 소요 시간, 이 지역의 배수, 거점 버프, 그리고 모든 장소를 다 돌았을 때 받을 수 있는 최대 포인트가 적혀 있습니다.",
      en: "The top of the page sums the route up: how long it takes, this region's multiplier, the stronghold buff, and the most you can earn by completing every stop.",
    },
  },
  {
    id: "expedition-stops",
    tab: "expedition",
    target: "expedition-stop-first",
    title: { ko: "방문할 장소들", en: "The stops on the route" },
    body: {
      ko: "방문할 장소가 순서대로 놓여 있어요. 각 장소마다 주소, 머물러야 하는 시간, 그 지역에 남는 혜택, 그리고 받을 수 있는 포인트가 함께 나옵니다. 순서대로 갈 필요는 없고, 편한 곳부터 가도 돼요.",
      en: "Every stop in order, each with its address, how long to stay, what the visit leaves behind locally, and the points it is worth. You need not follow the order — start wherever suits you.",
    },
  },
  {
    id: "check-in",
    tab: "expedition",
    target: "expedition-check-in",
    title: { ko: "현장에서 체크인", en: "Check in on site" },
    body: {
      ko: "장소에 도착하면 이 버튼을 눌러 위치와 사진으로 인증해요. 인증이 끝나면 포인트가 우리 팬덤 점수에 더해지고, 영토 소유와 랭킹에 바로 반영됩니다.",
      en: "Once you are there, this button verifies the visit with your location and a photo. The points then join your fandom's total, and ownership and ranking update at once.",
    },
  },
  {
    id: "expedition-end",
    tab: "expedition",
    target: "expedition-end",
    title: { ko: "원정 마치기", en: "Finishing the expedition" },
    body: {
      ko: "다 돌았거나 오늘은 여기까지라면 원정을 종료하세요. 이미 인증한 체크인은 그대로 남고, 남은 장소는 다음에 다시 이어서 갈 수 있어요. 이제 진짜 첫 원정을 떠나볼까요!",
      en: "End the expedition when you are done, or just done for today. Approved check-ins stay banked and the remaining stops wait for your next trip. Now go and take your first one.",
    },
  },
];

export const GUIDE_STEP_COUNT = GUIDE_STEPS.length;
