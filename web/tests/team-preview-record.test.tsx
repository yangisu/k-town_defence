import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { contributionRank, RecordView } from "@/components/team-preview/record-view";
import { appReducer, initialAppState } from "@/features/app-controller";
import {
  DEMO_SESSION_KEY,
  LEGACY_DEMO_SESSION_KEY,
  createInitialDemoSession,
  demoSessionReducer,
} from "@/features/team-preview/demo-session";
import type { MissionAward } from "@/features/team-preview/game-rules";
import { KTownApp } from "@/features/ktown-app";

const missionAward: MissionAward = {
  visit: 100,
  dwell: 60,
  localSpend: 100,
  accommodation: 0,
  strongholdBonus: 0,
  subtotal: 260,
  multiplier: 1,
  validPoints: 260,
  cappedPoints: 260,
};

beforeEach(() => window.localStorage.clear());

function completedEnglishSession() {
  let selected = demoSessionReducer(createInitialDemoSession(), { type: "selectArtist", artistId: "bts" });
  selected = demoSessionReducer(selected, { type: "selectTerritory", territoryId: "busan" });
  selected = demoSessionReducer(selected, { type: "openExpedition", expeditionId: "busan-regional-support-expedition" });
  selected = demoSessionReducer(selected, { type: "setLocale", locale: "en" });
  return demoSessionReducer(selected, { type: "completeCheckIn", expeditionId: "busan-regional-support-expedition", placeId: "busan-1", award: missionAward });
}

it.each([
  {
    locale: "ko" as const,
    seasonSummary: "내 시즌 요약",
    contributionPoints: "기여 포인트",
    contributionRank: "내 기여 순위",
    completed: "완료한 원정",
    checkIns: "승인된 체크인",
    territories: "영향을 준 영토",
    highestStage: "최고 거점 단계",
    growth: "성장 단계",
    timeline: "활동 타임라인",
    rewards: "획득 보상",
    seedReward: "씨앗 배지 · 획득",
    treeReward: "나무 배지 · 획득",
    landmarkReward: "랜드마크 배지 · 획득",
    landmark: "랜드마크 거점",
  },
  {
    locale: "en" as const,
    seasonSummary: "My season summary",
    contributionPoints: "Contribution points",
    contributionRank: "Contribution rank",
    completed: "Completed expeditions",
    checkIns: "Approved check-ins",
    territories: "Territories influenced",
    highestStage: "Highest stronghold stage",
    growth: "Growth track",
    timeline: "Activity timeline",
    rewards: "Rewards earned",
    seedReward: "Seed badge · Unlocked",
    treeReward: "Tree badge · Unlocked",
    landmarkReward: "Landmark badge · Unlocked",
    landmark: "Landmark stronghold",
  },
])("renders the populated season dashboard in $locale", ({ locale, seasonSummary, contributionPoints, contributionRank: rankLabel, completed, checkIns, territories, highestStage, growth, timeline, rewards, seedReward, treeReward, landmarkReward, landmark }) => {
  let selected = demoSessionReducer(createInitialDemoSession(), { type: "selectArtist", artistId: "bts" });
  selected = demoSessionReducer(selected, { type: "selectTerritory", territoryId: "busan" });
  selected = demoSessionReducer(selected, { type: "openExpedition", expeditionId: "busan-regional-support-expedition" });
  const first = demoSessionReducer(selected, { type: "completeCheckIn", expeditionId: "busan-regional-support-expedition", placeId: "busan-1", award: missionAward });
  const second = demoSessionReducer(first, { type: "completeCheckIn", expeditionId: "busan-regional-support-expedition", placeId: "busan-2", award: missionAward });
  const landmarkRecord = { ...second.approvedCheckIns[1], strongholdStage: "landmark" as const };
  const session = {
    ...second,
    locale,
    approvedCheckIns: [{ ...second.approvedCheckIns[0], strongholdStage: "seed" as const }, { ...second.approvedCheckIns[1], strongholdStage: "tree" as const }, landmarkRecord],
  };

  render(<RecordView locale={locale} session={session} onExploreTerritories={vi.fn()} />);

  expect(screen.getByRole("region", { name: seasonSummary })).toHaveTextContent(`${contributionPoints}780P`);
  expect(screen.getByRole("region", { name: seasonSummary })).toHaveTextContent(`${rankLabel} #113`);
  const metrics = screen.getByRole("region", { name: seasonSummary });
  expect(within(metrics).getByText(completed).parentElement).toHaveTextContent("1");
  expect(within(metrics).getByText(checkIns).parentElement).toHaveTextContent("3");
  expect(within(metrics).getByText(territories).parentElement).toHaveTextContent("1");
  expect(within(metrics).getByText(highestStage).parentElement).toHaveTextContent(landmark);
  expect(within(screen.getByRole("list", { name: growth })).getAllByRole("listitem")).toHaveLength(3);
  const activity = within(screen.getByRole("list", { name: timeline })).getAllByRole("listitem");
  expect(activity).toHaveLength(3);
  expect(activity[0]).toHaveTextContent(landmark);
  expect(activity[2]).toHaveTextContent(locale === "ko" ? "씨앗 거점" : "Seed stronghold");
  const rewardCollection = screen.getByRole("list", { name: rewards });
  expect(within(rewardCollection).getByText(seedReward)).toBeVisible();
  expect(within(rewardCollection).getByText(treeReward)).toBeVisible();
  expect(within(rewardCollection).getByText(landmarkReward)).toBeVisible();
});

it.each([
  { locale: "ko" as const, empty: "아직 원정 기록이 없어요", action: "영토 둘러보기", seed: "씨앗 배지 · 잠김", tree: "나무 배지 · 잠김", landmark: "랜드마크 배지 · 잠김" },
  { locale: "en" as const, empty: "No expedition record yet", action: "Explore territories", seed: "Seed badge · Locked", tree: "Tree badge · Locked", landmark: "Landmark badge · Locked" },
])("offers a working empty-state action and keeps every reward locked in $locale", async ({ locale, empty, action, seed, tree, landmark }) => {
  const user = userEvent.setup();
  const onExploreTerritories = vi.fn();

  render(<RecordView locale={locale} session={{ ...createInitialDemoSession(), locale }} onExploreTerritories={onExploreTerritories} />);

  expect(screen.getByRole("heading", { name: empty })).toBeVisible();
  await user.click(screen.getByRole("button", { name: action }));
  expect(onExploreTerritories).toHaveBeenCalledOnce();
  expect(screen.getByText(seed)).toBeVisible();
  expect(screen.getByText(tree)).toBeVisible();
  expect(screen.getByText(landmark)).toBeVisible();
});

it.each([
  [0, 128],
  [49, 128],
  [50, 127],
])("derives contribution rank at %i points", (points, expectedRank) => {
  expect(contributionRank(points)).toBe(expectedRank);
});

it.each([
  ["seed" as const, "씨앗 배지 · 획득", "나무 배지 · 잠김"],
  ["tree" as const, "나무 배지 · 획득", "랜드마크 배지 · 잠김"],
  ["landmark" as const, "랜드마크 배지 · 획득", "랜드마크 배지 · 획득"],
])("unlocks rewards through the %s stronghold transition", (stage, unlocked, lockedOrUnlocked) => {
  const completed = completedEnglishSession();
  render(<RecordView locale="ko" session={{ ...completed, approvedCheckIns: [{ ...completed.approvedCheckIns[0], strongholdStage: stage }] }} onExploreTerritories={vi.fn()} />);

  expect(screen.getByText(unlocked)).toBeVisible();
  expect(screen.getByText(lockedOrUnlocked)).toBeVisible();
});

it("resets controller selections in one transition", () => {
  const active = {
    ...initialAppState,
    activeTab: "journey" as const,
    selectedRegionId: "busan",
    selectedPlaceId: "busan-1",
    selectedExpeditionId: "busan-regional-support-expedition",
    checkInPlaceId: "busan-1",
  };

  expect(appReducer(active, { type: "reset" })).toEqual(initialAppState);
});

it("clears preview selection and history without changing the selected locale", () => {
  const reset = demoSessionReducer(completedEnglishSession(), { type: "reset" });

  expect(reset.locale).toBe("en");
  expect(reset.artistConfirmed).toBe(false);
  expect(reset.selectedArtistId).toBeNull();
  expect(reset.selectedTerritoryId).toBeNull();
  expect(reset.completedExpeditionIds).toEqual([]);
  expect(reset.approvedCheckIns).toEqual([]);
  expect(reset.contributedToday).toBe(0);
});

it("moves artist changes from the global header into My Record", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({
    ...createInitialDemoSession(),
    artistConfirmed: true,
    selectedArtistId: "bts",
    activeTab: "journey",
  }));
  render(<KTownApp mode="demo" mapConfig={null} />);

  expect(await screen.findByRole("heading", { name: "내 기록" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "내 팬덤 · ARMY" })).not.toBeInTheDocument();
  const settings = screen.getByRole("region", { name: "내 팬덤 설정" });
  expect(settings).toHaveTextContent("방탄소년단 · ARMY");
  await user.click(within(settings).getByRole("button", { name: "아티스트 변경" }));
  expect(screen.getByRole("dialog", { name: "아티스트 선택" })).toBeVisible();
});

it("confirms replay, removes only the demo session, keeps locale, and restores the three-step start", async () => {
  const user = userEvent.setup();
  const clear = vi.spyOn(Storage.prototype, "clear");
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(completedEnglishSession()));
  window.localStorage.setItem(LEGACY_DEMO_SESSION_KEY, JSON.stringify({ version: 1 }));
  window.localStorage.setItem("ktown-locale-neighbor", "preserve-me");
  render(<KTownApp mode="demo" mapConfig={null} />);

  expect(await screen.findByLabelText("My fandom · ARMY")).toBeVisible();
  await waitFor(() => expect(window.localStorage.getItem(LEGACY_DEMO_SESSION_KEY)).toBeNull());
  await user.click(screen.getAllByRole("button", { name: "My Record" })[0]);
  expect(screen.getByRole("heading", { name: "My Record" })).toBeVisible();
  expect(screen.getByText("Gamcheon Culture Village")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Reset demo" }));
  const dialog = screen.getByRole("dialog", { name: "Reset demo?" });
  expect(dialog).toBeVisible();
  expect(window.localStorage.getItem(DEMO_SESSION_KEY)).not.toBeNull();
  await user.click(within(dialog).getByRole("button", { name: "Reset" }));

  expect(await screen.findByRole("heading", { name: "Choose an artist to support" })).toBeVisible();
  expect(screen.queryByText("ARMY · #1")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
  expect(window.localStorage.getItem("ktown-locale-neighbor")).toBe("preserve-me");
  expect(clear).not.toHaveBeenCalled();
  await waitFor(() => expect(window.localStorage.getItem(DEMO_SESSION_KEY)).toBeNull());
});
