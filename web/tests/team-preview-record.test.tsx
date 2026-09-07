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
    growth: "팬덤 성장 단계",
    timeline: "활동 타임라인",
    rewards: "획득 보상",
    seedReward: "씨앗 배지",
    treeReward: "나무 배지",
    landmarkReward: "랜드마크 배지",
    rewardState: "획득",
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
    growth: "Fandom growth track",
    timeline: "Activity timeline",
    rewards: "Rewards earned",
    seedReward: "Seed badge",
    treeReward: "Tree badge",
    landmarkReward: "Landmark badge",
    rewardState: "Unlocked",
    landmark: "Landmark stronghold",
  },
])("renders the populated season dashboard in $locale", ({ locale, seasonSummary, contributionPoints, contributionRank: rankLabel, completed, checkIns, territories, highestStage, growth, timeline, rewards, seedReward, treeReward, landmarkReward, rewardState, landmark }) => {
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
  for (const badge of [seedReward, treeReward, landmarkReward]) {
    const row = within(rewardCollection).getByText(badge).closest("li");
    expect(row).toHaveTextContent(rewardState);
  }
});

it.each([
  { locale: "ko" as const, empty: "아직 원정 기록이 없어요", action: "영토 둘러보기", state: "잠김", seed: "씨앗 배지", tree: "나무 배지", landmark: "랜드마크 배지" },
  { locale: "en" as const, empty: "No expedition record yet", action: "Explore territories", state: "Locked", seed: "Seed badge", tree: "Tree badge", landmark: "Landmark badge" },
])("offers a working empty-state action and keeps every reward locked in $locale", async ({ locale, empty, action, state, seed, tree, landmark }) => {
  const user = userEvent.setup();
  const onExploreTerritories = vi.fn();

  render(<RecordView locale={locale} session={{ ...createInitialDemoSession(), locale }} onExploreTerritories={onExploreTerritories} />);

  expect(screen.getByRole("heading", { name: empty })).toBeVisible();
  await user.click(screen.getByRole("button", { name: action }));
  expect(onExploreTerritories).toHaveBeenCalledOnce();
  for (const badge of [seed, tree, landmark]) {
    expect(screen.getByText(badge).closest("li")).toHaveTextContent(state);
  }
});

it.each([
  [0, 128],
  [49, 128],
  [50, 127],
])("derives contribution rank at %i points", (points, expectedRank) => {
  expect(contributionRank(points)).toBe(expectedRank);
});

it.each([
  ["seed" as const, "씨앗 배지", "나무 배지", "잠김"],
  ["tree" as const, "나무 배지", "랜드마크 배지", "잠김"],
  ["landmark" as const, "랜드마크 배지", "랜드마크 배지", "획득"],
])("unlocks rewards through the %s stronghold transition", (stage, unlocked, other, otherState) => {
  const completed = completedEnglishSession();
  render(<RecordView locale="ko" session={{ ...completed, approvedCheckIns: [{ ...completed.approvedCheckIns[0], strongholdStage: stage }] }} onExploreTerritories={vi.fn()} />);

  const rewards = screen.getByRole("list", { name: "획득 보상" });
  expect(within(rewards).getByText(unlocked).closest("li")).toHaveTextContent("획득");
  expect(within(rewards).getByText(other).closest("li")).toHaveTextContent(otherState);
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

  expect(within(await screen.findByRole("region", { name: "Current objective" })).getByText("ARMY")).toBeVisible();
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

it("tucks the season into the summary card with an explanation toggle", async () => {
  const user = userEvent.setup();
  render(<RecordView locale="ko" session={createInitialDemoSession()} />);

  // The season lives in the summary card's corner, not in a card of its own.
  const summary = screen.getByRole("region", { name: "내 시즌 요약" });
  expect(within(summary).getByText("시즌 01")).toBeVisible();
  expect(within(summary).getByText("D-18")).toBeVisible();

  const info = within(summary).getByRole("button", { name: "시즌 설명 보기" });
  expect(info).toHaveAttribute("aria-expanded", "false");
  expect(document.getElementById("record-season-about")).toBeNull();

  await user.click(info);

  expect(within(summary).getByText(/영토 소유와 거점 단계를 정합니다/)).toBeVisible();
  expect(within(summary).getByText(/데모용 고정값/)).toBeVisible();

  await user.click(info);
  expect(document.getElementById("record-season-about")).toBeNull();
});

function fullyCompletedSession() {
  const first = completedEnglishSession();
  return demoSessionReducer(first, { type: "completeCheckIn", expeditionId: "busan-regional-support-expedition", placeId: "busan-2", award: missionAward });
}

it("lists the completed expeditions behind the summary count", async () => {
  const user = userEvent.setup();
  render(<RecordView locale="ko" session={fullyCompletedSession()} />);

  const count = screen.getByRole("button", { name: "1" });
  expect(count).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("region", { name: "완료한 원정 목록" })).not.toBeInTheDocument();

  await user.click(count);

  const list = screen.getByRole("region", { name: "완료한 원정 목록" });
  expect(within(list).getByText("부산 지역 원정")).toBeVisible();
  // Demo dates stand in for a season the preview does not actually run.
  expect(within(list).getByText("08. 24.", { exact: false })).toBeVisible();

  await user.click(count);
  expect(screen.queryByRole("region", { name: "완료한 원정 목록" })).not.toBeInTheDocument();
});

it("opens a check-in record from the activity timeline", async () => {
  const user = userEvent.setup();
  render(<RecordView locale="ko" session={fullyCompletedSession()} />);

  const timeline = screen.getByRole("list", { name: "활동 타임라인" });
  const first = within(timeline).getAllByRole("listitem")[0];
  // Territory, points, stage and the date travel together under the name.
  expect(first).toHaveTextContent("부산");
  expect(first).toHaveTextContent("08. 2");

  await user.click(within(first).getByRole("button"));

  const detail = await screen.findByRole("dialog");
  expect(within(detail).getByText("체크인 기록")).toBeVisible();
  expect(within(detail).getByRole("img", { name: "현장 사진 (데모 이미지)" })).toBeVisible();
  expect(within(detail).getByText("획득 포인트").closest("div")).toHaveTextContent("260P");
  expect(document.body.style.overflow).toBe("hidden");

  await user.click(within(detail).getByRole("button", { name: "닫기" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe("");
});

it("places the fandom settings directly above the account block", () => {
  render(<RecordView locale="ko" session={fullyCompletedSession()} onSignOut={vi.fn()} onReset={vi.fn()} />);

  const settings = screen.getByRole("region", { name: "내 팬덤 설정" });
  const account = screen.getByRole("region", { name: "계정" });
  expect(settings.nextElementSibling).toBe(account);
});

it("closes the check-in record from an X in its corner", async () => {
  const user = userEvent.setup();
  render(<RecordView locale="ko" session={fullyCompletedSession()} />);

  const timeline = screen.getByRole("list", { name: "활동 타임라인" });
  await user.click(within(within(timeline).getAllByRole("listitem")[0]).getByRole("button"));

  const detail = await screen.findByRole("dialog");
  const close = within(detail).getByRole("button", { name: "닫기" });
  expect(close).toHaveClass("record-detail-close");

  await user.click(close);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
