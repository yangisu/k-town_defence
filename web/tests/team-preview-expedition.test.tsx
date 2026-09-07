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

it("opens the verified artist-linked route through the demo application", async () => {
  const user = userEvent.setup();
  storeReadyBtsSession();
  render(<KTownApp mode="demo" mapConfig={null} />);

  await user.click(within(await screen.findByRole("complementary", { name: /(전술 패널|tactical panel)$/ })).getByRole("button", { name: "원정 시작" }));

  expect(await screen.findByRole("heading", { name: "BTS 부산 공식 공연장 원정" })).toBeVisible();
  expect(screen.getByText("아티스트 연관 장소 중심")).toBeVisible();
  expect(screen.queryByText("지역의 공공 관광 코스")).not.toBeInTheDocument();
  expect(screen.queryByText("원정 경로를 불러오고 있어요.")).not.toBeInTheDocument();
});

it("renders a sourced public artist stop followed only by neutral nearby recommendations", async () => {
  const onStartCheckIn = vi.fn();
  storeReadyBtsSession();
  render(
    <DemoSessionProvider storage={window.localStorage}>
      <PreviewExpeditionView
        expeditionId="bts-busan-artist-linked-expedition"
        checkInService={services.checkIn}
        onBack={() => undefined}
        onStartCheckIn={onStartCheckIn}
      />
    </DemoSessionProvider>,
  );

  expect(await screen.findByText("아티스트 연관 장소 중심")).toBeVisible();
  expect(screen.getByText("추천 근거 보기")).toBeVisible();
  expect(screen.getByRole("link", { name: "출처 확인" })).toBeInTheDocument();
  // The transit blurb is gone; the hero states the estimate instead.
  expect(screen.queryByText(/부산도시철도와 시내버스/)).not.toBeInTheDocument();
  expect(screen.getByText(/예상 시간 90분/)).toBeVisible();
  expect(screen.getByText(/지역 배율 1×/)).toBeVisible();
  expect(screen.getByText("예상 총 1,140P")).toBeVisible();

  const linkedStop = screen.getByRole("listitem", { name: "부산아시아드주경기장" });
  // The stop wears the connected member's tag rather than a generic label.
  expect(within(linkedStop).getByText("BTS")).toBeVisible();
  expect(within(linkedStop).getByRole("link", { name: "부산아시아드주경기장 출처" }))
    .toHaveAttribute("href", "https://weverse.io/bts/notice/3595");
  expect(within(linkedStop).getByText(/공식 공연 장소/)).toBeVisible();
  expect(within(linkedStop).getByText("체류 인정 시간 45분")).toBeVisible();
  expect(within(linkedStop).getByText("최대 570P")).toBeVisible();

  const nearbyStop = screen.getByRole("listitem", { name: "감천문화마을" });
  expect(within(nearbyStop).getByText("공공 관광 추천지")).toBeVisible();
  expect(within(nearbyStop).queryByText("BTS")).not.toBeInTheDocument();

  const standings = screen.getByRole("region", { name: "부산 영토 현황" });
  expect(within(standings).getByText(/ARMY.*920P/)).toBeVisible();
  expect(within(standings).getByText(/BLINK.*840P/)).toBeVisible();
  // The standings sit beside the expedition title so the route and the
  // territory it contests are read as one unit.
  expect(standings.closest(".expedition-hero")).not.toBeNull();
  expect(standings.closest(".expedition-hero")).toContainElement(screen.getByRole("heading", { level: 1 }));
});

it.each([
  [
    "ko",
    ["ARMY", "현재 소유 · ONEDOOR", "도전자 · ARMY", "지역 연결 스토리 · 제이홉"],
    "BTS 부산 공식 공연장 원정",
    "아티스트 연관 장소 중심",
  ],
  [
    "en",
    ["ARMY", "Current owner · ONEDOOR", "Challenger · ARMY", "Regional connection story · j-hope"],
    "BTS Busan official concert venue expedition",
    "Artist-linked places first",
  ],
] as const)("separates %s identity, ownership, story, and fallback evidence roles", async (locale, roles, title, disclosure) => {
  const user = userEvent.setup();
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({
    ...createInitialDemoSession(),
    locale,
    artistConfirmed: true,
    selectedArtistId: "bts",
    selectedTerritoryId: "gwangju",
  }));
  render(<KTownApp mode="demo" mapConfig={null} />);

  for (const role of roles) {
    const matches = await screen.findAllByText(role);
    expect(matches[0]).toBeVisible();
  }
  await user.click(within(screen.getByRole("complementary", { name: /(전술 패널|tactical panel)$/ })).getByRole("button", { name: locale === "ko" ? "원정 시작" : "Start expedition" }));

  expect(await screen.findByRole("heading", { name: title })).toBeVisible();
  expect(screen.getByText(disclosure)).toBeVisible();
  expect(screen.queryByText(locale === "ko" ? "BTS 광주 원정" : "BTS Gwangju expedition")).not.toBeInTheDocument();
  expect(screen.queryByText(locale === "ko" ? "지역의 공공 관광 코스" : "Public tourism route in this region")).not.toBeInTheDocument();
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
        expeditionId="bts-busan-artist-linked-expedition"
        checkInService={services.checkIn}
        onBack={() => undefined}
      />
    </DemoSessionProvider>,
  );

  expect(await screen.findByText("선택한 원정을 찾지 못했어요.")).toBeVisible();
  expect(screen.queryByRole("heading", { name: "BTS 부산 바다 원정" })).not.toBeInTheDocument();
});

it("ends a running expedition and reopens the territory for a new one", async () => {
  const user = userEvent.setup();
  storeReadyBtsSession();
  render(<KTownApp mode="demo" mapConfig={null} />);

  const panel = await screen.findByRole("complementary", { name: /(전술 패널|tactical panel)$/ });
  await user.click(within(panel).getByRole("button", { name: "원정 시작" }));
  await screen.findByRole("heading", { name: "BTS 부산 공식 공연장 원정" });

  await user.click(screen.getByRole("button", { name: "원정 종료" }));

  // The confirmation spells out what survives before anything changes.
  const confirm = await screen.findByRole("dialog", { name: "원정을 종료할까요?" });
  expect(within(confirm).getByText(/체크인한 코스와 거기서 얻은 포인트는 그대로 남습니다/)).toBeVisible();
  await user.click(within(confirm).getByRole("button", { name: "취소" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "BTS 부산 공식 공연장 원정" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "원정 종료" }));
  await user.click(within(await screen.findByRole("dialog", { name: "원정을 종료할까요?" }))
    .getByRole("button", { name: "원정 종료" }));

  expect(await screen.findByRole("heading", { name: "진행 중인 원정이 없어요" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "영토 지도로" }));

  // The territory offers its route again rather than staying in progress.
  const reopened = await screen.findByRole("complementary", { name: /(전술 패널|tactical panel)$/ });
  expect(within(reopened).getByRole("button", { name: "원정 시작" })).toBeEnabled();
});

it("turns the closing action into a completion once every stop is checked in", async () => {
  const user = userEvent.setup();
  storeReadyBtsSession();
  render(<KTownApp mode="demo" mapConfig={null} />);
  await user.click(within(await screen.findByRole("complementary", { name: /(전술 패널|tactical panel)$/ })).getByRole("button", { name: "원정 시작" }));

  expect(screen.getByRole("button", { name: "원정 종료" })).toBeVisible();

  for (const stop of ["부산아시아드주경기장", "감천문화마을"]) {
    await user.click(screen.getByRole("button", { name: `${stop} 체크인` }));
    await user.click(screen.getByRole("button", { name: "데모 인증 진행" }));
    await user.click(screen.getByRole("button", { name: "체크인 제출" }));
    await screen.findByRole("heading", { name: "체크인 승인 완료" });
    await user.click(screen.getByRole("button", { name: "여행 계속하기" }));
  }

  const finish = screen.getByRole("button", { name: "원정 완료" });
  expect(finish).toHaveClass("expedition-end--complete");
  expect(screen.queryByRole("button", { name: "원정 종료" })).not.toBeInTheDocument();

  await user.click(finish);
  expect(await screen.findByRole("dialog", { name: "원정을 완료할까요?" })).toBeVisible();
}, 20_000);
