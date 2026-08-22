import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { PreviewExpeditionView } from "@/components/team-preview/expedition-view";
import {
  DEMO_SESSION_KEY,
  createInitialDemoSession,
} from "@/features/team-preview/demo-session";
import { DemoSessionProvider } from "@/features/team-preview/demo-session-context";
import { KTownApp } from "@/features/ktown-app";
import { services } from "@/lib/demo-services";

beforeEach(() => window.localStorage.clear());

function storeReadyBtsSession() {
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({
    ...createInitialDemoSession(),
    artistConfirmed: true,
    selectedArtistId: "bts",
    selectedTerritoryId: "busan",
  }));
}

it("resolves the Task 5 preview expedition ID through the demo application route", async () => {
  const user = userEvent.setup();
  storeReadyBtsSession();
  render(<KTownApp mode="demo" mapConfig={null} />);

  await user.click(await screen.findByRole("button", { name: "원정 시작" }));

  expect(await screen.findByRole("heading", { name: "BTS 부산 바다 원정" })).toBeVisible();
  expect(screen.queryByText("원정 경로를 불러오고 있어요.")).not.toBeInTheDocument();
});

it("renders sourced connection context and honest nearby route stops", async () => {
  const onStartCheckIn = vi.fn();
  storeReadyBtsSession();
  render(
    <DemoSessionProvider storage={window.localStorage}>
      <PreviewExpeditionView
        expeditionId="bts-busan-expedition"
        checkInService={services.checkIn}
        onBack={() => undefined}
        onStartCheckIn={onStartCheckIn}
      />
    </DemoSessionProvider>,
  );

  expect(await screen.findByText(/검토 후보로 제안/)).toBeVisible();
  expect(screen.getByText("팀 데이터 · 미검증 제안")).toBeVisible();
  expect(screen.queryByText(/지민과 정국의 고향/)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "아티스트 연결 출처" }))
    .toHaveAttribute("href", expect.stringMatching(/^https:\/\//));
  expect(screen.getByText(/대중교통 기준 약 90분/)).toBeVisible();
  expect(screen.getByText(/지역 배율 1×/)).toBeVisible();
  expect(screen.getByText("예상 총 1,120P")).toBeVisible();

  const stop = screen.getByRole("listitem", { name: "감천문화마을" });
  expect(within(stop).getByText("인근 추천")).toBeVisible();
  expect(within(stop).queryByText("아티스트 연관 장소")).not.toBeInTheDocument();
  expect(within(stop).getByRole("link", { name: "감천문화마을 출처" }))
    .toHaveAttribute("href", expect.stringMatching(/^https:\/\//));
  expect(within(stop).getByText("대중교통으로 접근 가능한 공공 관광지")).toBeVisible();
  expect(within(stop).getByText("체류 45분")).toBeVisible();
  expect(within(stop).getByText("지역 문화와 상권을 함께 경험하는 공공 관광 정류장")).toBeVisible();
  expect(within(stop).getByText("최대 560P")).toBeVisible();

  const standings = screen.getByRole("region", { name: "부산 영토 현황" });
  expect(within(standings).getByText(/ARMY.*920P/)).toBeVisible();
  expect(within(standings).getByText(/BLINK.*840P/)).toBeVisible();
});

it("rejects an expedition that belongs to a different selected artist", async () => {
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({
    ...createInitialDemoSession(),
    artistConfirmed: true,
    selectedArtistId: "aespa",
    selectedTerritoryId: "suwon",
  }));
  render(
    <DemoSessionProvider storage={window.localStorage}>
      <PreviewExpeditionView
        expeditionId="bts-busan-expedition"
        checkInService={services.checkIn}
        onBack={() => undefined}
      />
    </DemoSessionProvider>,
  );

  expect(await screen.findByText("선택한 원정을 찾지 못했어요.")).toBeVisible();
  expect(screen.queryByRole("heading", { name: "BTS 부산 바다 원정" })).not.toBeInTheDocument();
});
