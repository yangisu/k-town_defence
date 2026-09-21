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
   *  stops advancing on a click and moves on once the deed is done, and the
   *  spotlight beckons while it waits. Session deeds are named; anything else
   *  is recognised by what it puts on the page (see `advanceWhen`). */
  awaits?: "territory" | "expedition" | "dom";
  /** CSS selector whose appearance means an `awaits: "dom"` step is done — the
   *  dialog that opened, the button that replaced the one just pressed. A
   *  leading "!" waits for the opposite: the dialog that closed again. */
  advanceWhen?: string;
  /** Clicked when the step is entered and `advanceWhen` already matches, to
   *  put the page back the way the step needs it — closing the dialog the
   *  reader is stepping back out of. */
  undoWith?: string;
  /** A step past a point of no return: the back arrow greys out. */
  noBack?: boolean;
  /** A step with nothing to read: the dialog it points into has already said
   *  it, so the guide shows only the ring around the button to press. */
  cardless?: boolean;
  /** Where in the viewport the target should come to rest, 0 (top) to 1
   *  (bottom). Dead centre leaves the card fighting for the same space on a
   *  phone, so most steps sit their target a little high and let the card have
   *  the room below it. */
  anchor?: number;
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
    anchor: 0.38,
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
    anchor: 0.36,
    title: { ko: "지역 점수 현황", en: "This region's standings" },
    body: {
      ko: "이 지역을 현재 어떤 팬덤이 소유하고 있는지, 이 지역을 소유하려면 얼마나 점수를 쌓아야 하는지 표시됩니다.",
      en: "Which fandom holds this region right now, and how many points it would take to hold it yourself.",
    },
  },
  {
    id: "stronghold",
    tab: "explore",
    needsTerritory: true,
    target: "stronghold-mark",
    anchor: 0.36,
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
    anchor: 0.64,
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
    anchor: 0.36,
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
    anchor: 0.42,
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
    anchor: 0.36,
    title: { ko: "이번 원정 한눈에", en: "This expedition at a glance" },
    body: {
      ko: "원정 페이지 맨 위에는 이 경로의 요약이 있어요. 예상 소요 시간, 이 지역의 배수, 거점 버프, 그리고 모든 장소를 다 돌았을 때 받을 수 있는 최대 포인트가 적혀 있습니다.",
      en: "The top of the page sums the route up: how long it takes, this region's multiplier, the stronghold buff, and the most you can earn by completing every stop.",
    },
  },
  // From here the guide stops describing and starts doing: the reader walks a
  // whole check-in, button by button. Nothing they earn on the way is kept —
  // the session is put back exactly as they left it when the guide closes.
  {
    id: "check-in",
    tab: "expedition",
    awaits: "dom",
    advanceWhen: ".checkin-dialog",
    undoWith: '[data-guide-close="checkin"]',
    target: "expedition-check-in",
    anchor: 0.4,
    title: { ko: "방문 장소에서 체크인", en: "Check in at a stop" },
    body: {
      ko: "방문 장소에 도착하면 이 버튼을 눌러 위치와 사진으로 인증해요.",
      en: "Once you reach a stop, this button verifies the visit with your location and a photo.",
    },
  },
  {
    id: "check-in-verify",
    tab: "expedition",
    awaits: "dom",
    advanceWhen: '[data-guide="checkin-submit"]',
    target: "checkin-run-demo",
    anchor: 0.5,
    title: { ko: "인증 진행하기", en: "Run the verification" },
    body: {
      ko: "실제로는 현장에서 위치를 세 번 확인하고 사진을 올려요. 지금은 연습이니 이 버튼 하나로 그 과정을 대신합니다. 눌러보세요.",
      en: "In the field this is three location fixes and a photo. For practice, this one button stands in for all of it. Give it a press.",
    },
  },
  {
    id: "check-in-submit",
    tab: "expedition",
    awaits: "dom",
    advanceWhen: '[data-guide="checkin-result"]',
    noBack: true,
    target: "checkin-submit",
    anchor: 0.5,
    title: { ko: "체크인 제출하기", en: "Submit the check-in" },
    body: {
      ko: "인증이 완료됐어요. 제출하면 검토를 거쳐 포인트가 확정됩니다.",
      en: "Every piece of evidence is in. Submitting sends it for review and settles the points.",
    },
  },
  {
    id: "check-in-result",
    tab: "expedition",
    awaits: "dom",
    advanceWhen: "!.checkin-dialog",
    noBack: true,
    target: "checkin-continue",
    anchor: 0.5,
    title: { ko: "이렇게 점수가 쌓여요", en: "This is how points land" },
    body: {
      ko: "방금 얻은 포인트가 항목별로 나오고, 그 아래에 우리 팬덤의 지역 점유율·거점 단계·순위가 어떻게 달라지는지 보여요. 연습이라 이 점수는 실제로 반영되지 않습니다. 계속하려면 눌러주세요.",
      en: "The points you just earned, item by item, and beneath them how your fandom's share, stronghold and rank move. This was practice, so none of it is kept. Press to carry on.",
    },
  },
  {
    id: "expedition-end",
    tab: "expedition",
    awaits: "dom",
    advanceWhen: ".expedition-end-dialog",
    undoWith: '[data-guide-close="expedition-end"]',
    noBack: true,
    target: "expedition-end",
    anchor: 0.42,
    title: { ko: "원정 마치기", en: "Finishing the expedition" },
    body: {
      ko: "다 돌았거나 오늘은 여기까지라면 원정을 종료해요. 눌러볼까요.",
      en: "End the expedition when you are done, or just done for today. Give it a press.",
    },
  },
  {
    id: "expedition-end-confirm",
    tab: "expedition",
    awaits: "dom",
    advanceWhen: "!.expedition-end-dialog",
    noBack: true,
    target: "expedition-end-confirm",
    cardless: true,
    anchor: 0.5,
    title: { ko: "한 번 더 확인해요", en: "One last confirmation" },
    body: {
      ko: "이미 인증한 체크인과 거기서 얻은 포인트는 그대로 남고, 남은 장소만 정리됩니다. 종료를 눌러 마무리해 주세요.",
      en: "Approved check-ins keep the points they earned; only the unvisited stops are cleared. Press to finish.",
    },
  },
  {
    id: "finish",
    tab: "expedition",
    title: { ko: "이제 K-Defense를 즐겨주세요", en: "Now go and play" },
    body: {
      ko: "여기까지가 한 번의 원정이에요. 연습으로 얻은 점수는 모두 되돌려 두었으니, 이제 우리 팬덤의 영토를 진짜로 넓혀볼 차례입니다.",
      en: "That is one expedition, start to finish. Everything you earned in practice has been put back — now go and win some ground for your fandom.",
    },
  },
];

export const GUIDE_STEP_COUNT = GUIDE_STEPS.length;
