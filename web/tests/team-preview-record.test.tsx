import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { RecordView } from "@/components/team-preview/record-view";
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
  subtotal: 260,
  multiplier: 1,
  validPoints: 260,
  cappedPoints: 260,
};

beforeEach(() => window.localStorage.clear());

function completedEnglishSession() {
  let selected = demoSessionReducer(createInitialDemoSession(), { type: "selectArtist", artistId: "bts" });
  selected = demoSessionReducer(selected, { type: "openExpedition", expeditionId: "busan-regional-support-expedition" });
  selected = demoSessionReducer(selected, { type: "setLocale", locale: "en" });
  return demoSessionReducer(selected, { type: "completeCheckIn", expeditionId: "busan-regional-support-expedition", placeId: "busan-1", award: missionAward });
}

it("shows completed check-in impact, territory influence, contribution rank, and reward progress", () => {
  render(<RecordView locale="ko" session={{ ...completedEnglishSession(), locale: "ko" }} />);

  expect(screen.getByRole("heading", { name: "내 기록" })).toBeVisible();
  expect(screen.getByText("완료한 원정").parentElement).toHaveTextContent("완료한 원정0");
  expect(screen.getByText("유효 포인트").parentElement).toHaveTextContent("유효 포인트260P");
  expect(screen.getByText("내 기여 순위").parentElement).toHaveTextContent("내 기여 순위#123");
  expect(screen.getByText("영향을 준 영토").parentElement).toHaveTextContent("영향을 준 영토1");

  const history = within(screen.getByRole("list", { name: "승인된 체크인" })).getByRole("listitem");
  expect(history).toHaveTextContent("감천문화마을");
  expect(history).toHaveTextContent("부산");
  expect(history).toHaveTextContent("260P");
  expect(history).toHaveTextContent("나무 거점");

  const rewards = screen.getByRole("list", { name: "획득 보상" });
  expect(within(rewards).getByText("씨앗 배지 · 획득")).toBeVisible();
  expect(within(rewards).getByText("나무 배지 · 획득")).toBeVisible();
  expect(within(rewards).getByText("랜드마크 배지 · 잠김")).toBeVisible();
  expect(screen.getByRole("button", { name: "캐릭터 꾸미기 · 추후 제공" })).toBeDisabled();
});

it("keeps two approved stops in history but counts their route as one completed expedition", () => {
  let selected = demoSessionReducer(createInitialDemoSession(), { type: "selectArtist", artistId: "bts" });
  selected = demoSessionReducer(selected, { type: "openExpedition", expeditionId: "busan-regional-support-expedition" });
  const first = demoSessionReducer(selected, { type: "completeCheckIn", expeditionId: "busan-regional-support-expedition", placeId: "busan-1", award: missionAward });
  const second = demoSessionReducer(first, { type: "completeCheckIn", expeditionId: "busan-regional-support-expedition", placeId: "busan-2", award: missionAward });

  render(<RecordView locale="ko" session={second} />);

  expect(screen.getByText("완료한 원정").parentElement).toHaveTextContent("완료한 원정1");
  expect(within(screen.getByRole("list", { name: "승인된 체크인" })).getAllByRole("listitem")).toHaveLength(2);
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

it("confirms replay, removes only the demo session, keeps locale, and restores the three-step start", async () => {
  const user = userEvent.setup();
  const clear = vi.spyOn(Storage.prototype, "clear");
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(completedEnglishSession()));
  window.localStorage.setItem(LEGACY_DEMO_SESSION_KEY, JSON.stringify({ version: 1 }));
  window.localStorage.setItem("ktown-locale-neighbor", "preserve-me");
  render(<KTownApp mode="demo" mapConfig={null} />);

  expect(await screen.findByText("ARMY · #1")).toBeVisible();
  await waitFor(() => expect(window.localStorage.getItem(LEGACY_DEMO_SESSION_KEY)).toBeNull());
  await user.click(screen.getAllByRole("button", { name: "My Record" })[0]);
  expect(screen.getByRole("heading", { name: "My Record" })).toBeVisible();
  expect(screen.getByText("Gamcheon Culture Village")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Reset demo" }));
  const dialog = screen.getByRole("dialog", { name: "Reset demo?" });
  expect(dialog).toBeVisible();
  expect(window.localStorage.getItem(DEMO_SESSION_KEY)).not.toBeNull();
  await user.click(within(dialog).getByRole("button", { name: "Reset" }));

  expect(await screen.findByRole("heading", { name: "Territory Map" })).toBeVisible();
  expect(screen.getByText("1. Choose an artist")).toBeVisible();
  expect(screen.getByText("2. Review a territory")).toBeVisible();
  expect(screen.getByText("3. Start the first expedition")).toBeVisible();
  expect(screen.queryByText("ARMY · #1")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
  expect(window.localStorage.getItem("ktown-locale-neighbor")).toBe("preserve-me");
  expect(clear).not.toHaveBeenCalled();
  await waitFor(() => expect(window.localStorage.getItem(DEMO_SESSION_KEY)).toBeNull());
});
