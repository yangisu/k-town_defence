import { GAME_RULES } from "@/features/team-preview/game-rules";
import type { Locale } from "@/features/team-preview/types";

export type GuideTab = "explore" | "journey";

export interface GuideStep {
  id: string;
  /** Tab this step describes. The guide opens it before showing the step, so a
   *  replay started from another page still lands on the control it explains. */
  tab: GuideTab;
  /** Steps about the tactical panel need a territory chosen, or the panel the
   *  step describes is not rendered at all. */
  needsTerritory?: boolean;
  /** A step that waits for the reader to do the thing it describes. The guide
   *  stops advancing on a click and moves on once the deed is done. */
  awaits?: "territory";
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
    id: "summary",
    tab: "explore",
    target: "territory-summary",
    title: { ko: "추천 행동", en: "Recommended move" },
    body: {
      ko: "지금 가장 시급한 한 가지를 알려줘요. 누르면 그 영토가 지도에 바로 잡힙니다.",
      en: "The one move that matters most right now. Press it and the map frames that territory.",
    },
  },
  {
    id: "select-region",
    tab: "explore",
    awaits: "territory",
    target: "territory-list",
    title: { ko: "여행할 지역 선택하기", en: "Choose where to travel" },
    body: {
      ko: "이제부터 여행을 할 지역을 선택하세요. 지역 카드를 클릭해서 선택할 수 있어요.",
      en: "Choose the territory you will travel to. Tap one of the territory cards.",
    },
  },
  {
    id: "standings",
    tab: "explore",
    needsTerritory: true,
    target: "tactical-standings",
    title: { ko: "지금 점수 차이", en: "The current gap" },
    body: {
      ko: "팬덤별로 쌓인 유효 포인트예요. 시즌이 끝날 때 1위 팬덤이 이 영토를 가져갑니다.",
      en: "Valid points banked by each fandom. Whoever leads when the season ends takes this territory.",
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
    id: "stronghold",
    tab: "explore",
    title: { ko: "거점 단계", en: "Stronghold stages" },
    body: {
      ko: `쌓인 포인트가 거점을 키워요. ${rules.strongholdTreeAt.toLocaleString()}P에서 나무, ${rules.strongholdLandmarkAt.toLocaleString()}P에서 랜드마크가 되고, 단계가 오를수록 버프가 커집니다.`,
      en: `Banked points grow the stronghold: a tree at ${rules.strongholdTreeAt.toLocaleString()}P, a landmark at ${rules.strongholdLandmarkAt.toLocaleString()}P, each stage widening the buff.`,
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
    id: "start-expedition",
    tab: "explore",
    needsTerritory: true,
    target: "start-expedition",
    title: { ko: "원정 시작", en: "Start an expedition" },
    body: {
      ko: "이 버튼을 누르면 이 영토에서 방문할 장소가 순서대로 열려요.",
      en: "This opens the route for this territory, with its stops in order.",
    },
  },
  {
    id: "check-in",
    tab: "explore",
    title: { ko: "현장에서 체크인", en: "Check in on site" },
    body: {
      ko: "장소에서 위치와 사진으로 인증하면 포인트가 우리 팬덤 점수에 더해지고, 소유와 랭킹에 바로 반영돼요.",
      en: "Verify a visit with your location and a photo, and the points join your fandom's total, ownership and ranking at once.",
    },
  },
];

export const GUIDE_STEP_COUNT = GUIDE_STEPS.length;
