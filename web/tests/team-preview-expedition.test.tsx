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
import { TUTORIAL_SEEN_KEY } from "@/features/team-preview/tutorial-seen";


/** These journeys are not about onboarding, so the visitor has seen the guide. */
function skipGuide() {
  window.localStorage.setItem(TUTORIAL_SEEN_KEY, "seen");
}

beforeEach(() => {
  window.localStorage.clear();
  skipGuide();
});

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
  // Folded until asked for: the hero leads with the route, not the ranking.
  const toggle = within(standings).getByRole("button", { name: "영토 현황" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(within(standings).queryByText("920P")).not.toBeInTheDocument();
  await userEvent.setup().click(toggle);
  // The ranking lists each fandom on its own row now.
  expect(within(standings).getByText("ARMY")).toBeVisible();
  expect(within(standings).getByText("920P")).toBeVisible();
  expect(within(standings).getByText("BLINK")).toBeVisible();
  expect(within(standings).getByText("840P")).toBeVisible();
  // The standings sit beside the expedition title so the route and the
  // territory it contests are read as one unit.
  expect(standings.closest(".expedition-hero")).not.toBeNull();
  expect(standings.closest(".expedition-hero")).toContainElement(screen.getByRole("heading", { level: 1 }));
});

it("places API recommendations before, between, and after the two main stops, drawn as asides", async () => {
  storeReadyBtsSession();
  const routeItems = [
    {
      contentId: "before", nameKo: "사직공원", latitude: 35.19, longitude: 129.05,
      distanceKm: 0.8, addressKo: "부산 동래구", source: "KTOUR_LOCATION_BASED" as const,
      placement: "before_first" as const, reasons: ["첫 번째 장소 주변 추천"],
    },
    {
      contentId: "between", nameKo: "구덕민속예술관", latitude: 35.13, longitude: 129.02,
      distanceKm: 8.2, detourKm: 0.05, addressKo: "부산 서구", source: "KTOUR_ROUTE_DETOUR" as const,
      placement: "between" as const, reasons: ["두 장소 사이 최소 우회 후보"],
    },
    {
      contentId: "after", nameKo: "미술의거리", latitude: 35.10, longitude: 129.02,
      distanceKm: 1.6, addressKo: "부산 중구", source: "KTOUR_LOCATION_BASED" as const,
      placement: "after_second" as const, reasons: ["두 번째 장소 주변 추천"],
    },
  ];
  render(
    <DemoSessionProvider storage={window.localStorage}>
      <PreviewExpeditionView
        expeditionId="bts-busan-artist-linked-expedition"
        checkInService={services.checkIn}
        relatedAttractionService={{
          ...services.tourism,
          getRouteAttractions: vi.fn(async () => routeItems),
        }}
        onBack={() => undefined}
      />
    </DemoSessionProvider>,
  );

  await screen.findByRole("listitem", { name: "구덕민속예술관" });
  const cards = screen.getAllByRole("listitem").filter((item) => item.closest(".stop-list"));
  expect(cards.map((item) => item.getAttribute("aria-label"))).toEqual([
    "사직공원",
    "부산아시아드주경기장",
    "구덕민속예술관",
    "감천문화마을",
    "미술의거리",
  ]);
  for (const name of ["사직공원", "구덕민속예술관", "미술의거리"]) {
    const card = screen.getByRole("listitem", { name });
    expect(card).toHaveClass("recommended-stop");
    // An aside beside the route, not a stop on it: nothing to check in at.
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
    expect(within(card).getByText("관광 OpenAPI 추천")).toBeVisible();
  }
  for (const name of ["부산아시아드주경기장", "감천문화마을"]) {
    const card = screen.getByRole("listitem", { name });
    expect(card).not.toHaveClass("recommended-stop");
    expect(within(card).getByRole("button", { name: `${name} 체크인` })).toBeVisible();
  }
  expect(within(screen.getByRole("listitem", { name: "구덕민속예술관" })).getByText("직선 우회 +0.1km")).toBeVisible();
});

// Gwangju carries a sourced j-hope tie but no route of its own, and the two
// facts stay separate: the story is told where it belongs, and the route the
// reader is offered is Gwangju's own public one, not Busan's.
it.each([
  [
    "ko",
    ["ARMY", "현재 소유", "지역 연결 스토리 · 제이홉"],
    "광주 지역 원정",
    "공식 관광 출처 기반 공공 원정",
  ],
  [
    "en",
    ["ARMY", "Current owner", "Regional connection story · j-hope"],
    "Gwangju regional expedition",
    "Public route from official tourism sources",
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
  // Busan's tie is Busan's, however close the fandom's other territories are.
  expect(screen.queryByRole("heading", { name: locale === "ko" ? "BTS 부산 공식 공연장 원정" : "BTS Busan official concert venue expedition" }))
    .not.toBeInTheDocument();
  expect(screen.queryByText(locale === "ko" ? "아티스트 연관 장소 중심" : "Artist-linked places first")).not.toBeInTheDocument();
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
