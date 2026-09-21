import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { TerritoryView } from "@/components/team-preview/territory-view";
import { TerritoryList } from "@/components/team-preview/territory-list";
import {
  TERRITORY_FILTERS,
  filterAndOrderTerritories,
} from "@/components/team-preview/map-filters";
import {
  DEMO_SESSION_KEY,
  createInitialDemoSession,
  demoSessionReducer,
  type DemoSession,
} from "@/features/team-preview/demo-session";
import { GAME_RULES, type MissionAward } from "@/features/team-preview/game-rules";
import { DemoSessionProvider } from "@/features/team-preview/demo-session-context";
import type { AppServices, LiveExpedition, PersistedExpedition } from "@/lib/domain";

beforeEach(() => window.localStorage.clear());

function confirmedSession(overrides: Partial<DemoSession> = {}): DemoSession {
  return {
    ...createInitialDemoSession(),
    artistConfirmed: true,
    selectedArtistId: "bts",
    selectedTerritoryId: "busan",
    // These read the page as a fandom looking at its own ground. The app now
    // opens on the whole board, so the slice under test is stated here.
    territoryFilter: "my_fandom",
    ...overrides,
  };
}

function renderPreviewWithArtist(overrides: Partial<DemoSession> = {}) {
  const state = confirmedSession(overrides);
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(state));
  render(
    <DemoSessionProvider storage={window.localStorage}>
      <TerritoryView
        mapConfig={null}
      />
    </DemoSessionProvider>,
  );

}

const liveRecommendation: LiveExpedition = {
  id: "recommendation-1",
  title: "부산 실시간 원정",
  regionCode: "6",
  keyword: "방탄소년단",
  travelDate: "2026-09-21",
  routeKey: "bts-busan",
  routeVersion: "bts-busan-v1:snapshot:RELATED_NONE",
  stops: [],
};

const persistedExpedition: PersistedExpedition = {
  ...liveRecommendation,
  id: "expedition-1",
  recommendationId: liveRecommendation.id,
  status: "active",
  createdAt: "2026-09-21T00:00:00Z",
};

function integratedServices({ recommendation = vi.fn().mockResolvedValue(liveRecommendation), start = vi.fn().mockResolvedValue(persistedExpedition) } = {}) {
  return {
    services: {
      tourism: { getRecommendedExpedition: recommendation },
      expeditions: { start },
    } as unknown as AppServices,
    recommendation,
    start,
  };
}

const award = (points: number): MissionAward => ({
  visit: points,
  dwell: 0,
  localSpend: 0,
  accommodation: 0,
  strongholdBonus: 0,
  subtotal: points,
  multiplier: 1,
  validPoints: points,
  cappedPoints: points,
});

it("turns artist choice into a visible tactical recommendation", async () => {
  renderPreviewWithArtist();

  const panel = await screen.findByRole("complementary", { name: "부산 전술 패널" });
  expect(within(panel).getByText("지역 연결 스토리 · 지민·정국", { selector: "strong" })).toBeVisible();
  expect(within(panel).queryByText("팀 데이터 · 미검증 제안")).not.toBeInTheDocument();
  expect(within(panel).getByRole("heading", { name: "부산" })).toBeVisible();
  expect(within(panel).getByText(/^방어 우위$/)).toBeVisible();
  expect(within(panel).getByText(/지역균형 보너스/)).toBeVisible();
  expect(within(panel).getByText("방문 기본")).toBeVisible();
  expect(within(panel).getByText("체류 보너스")).toBeVisible();
  expect(within(panel).getByText("로컬 소비")).toBeVisible();
  expect(within(panel).getByText("숙박")).toBeVisible();
  expect(within(panel).getByText(/영토 영향/)).toBeVisible();
  expect(within(panel).getByText(/팬덤 순위 영향/)).toBeVisible();
  expect(within(panel).getByRole("link", { name: "출처 확인" })).toHaveAttribute("href", expect.stringMatching(/^https:\/\//));
  expect(within(panel).getByRole("button", { name: /원정 시작/ })).toBeEnabled();
  expect(within(panel).getByRole("img", { name: /거점/ })).toHaveStyle({ "--owner-color": "#7c5ce0" });
});

it("starts an integrated expedition through the backend before opening the demo route", async () => {
  const user = userEvent.setup();
  const { services, recommendation, start } = integratedServices();
  const onLiveExpedition = vi.fn();
  const state = confirmedSession();
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(state));
  render(
    <DemoSessionProvider storage={window.localStorage}>
      <TerritoryView
        mapConfig={null}
        services={services}
        integrated
        expeditionRecoveryStatus="ready"
        onLiveExpedition={onLiveExpedition}
      />
    </DemoSessionProvider>,
  );

  await user.click(within(await screen.findByRole("complementary", { name: "부산 전술 패널" }))
    .getByRole("button", { name: "원정 시작" }));

  await waitFor(() => expect(recommendation).toHaveBeenCalledWith(expect.objectContaining({ regionCode: "6", limit: 5 })));
  expect(screen.getByText("현재는 선택 추천지가 없습니다")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "선택한 코스로 원정 시작" }));
  expect(start).toHaveBeenCalledWith(
    "recommendation-1",
    expect.objectContaining({ regionCode: "6", limit: 5, routeKey: "bts-busan" }),
    [],
    "bts-busan-v1:snapshot:RELATED_NONE",
  );
  expect(onLiveExpedition).toHaveBeenCalledWith(persistedExpedition);
});

it("shows an integrated start failure and lets the visitor try again", async () => {
  const user = userEvent.setup();
  const { services } = integratedServices({
    recommendation: vi.fn().mockRejectedValue(new Error("Tour API unavailable")),
  });
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(confirmedSession()));
  render(
    <DemoSessionProvider storage={window.localStorage}>
      <TerritoryView mapConfig={null} services={services} integrated expeditionRecoveryStatus="ready" />
    </DemoSessionProvider>,
  );

  const startButton = within(await screen.findByRole("complementary", { name: "부산 전술 패널" }))
    .getByRole("button", { name: "원정 시작" });
  await user.click(startButton);

  expect(await screen.findByRole("alert")).toHaveTextContent("원정을 시작하지 못했어요");
  expect(startButton).toBeEnabled();
});

it("blocks a new expedition when current-expedition recovery failed", async () => {
  const retry = vi.fn();
  const { services } = integratedServices();
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(confirmedSession()));
  render(
    <DemoSessionProvider storage={window.localStorage}>
      <TerritoryView
        mapConfig={null}
        services={services}
        integrated
        expeditionRecoveryStatus="error"
        onRetryExpeditionRecovery={retry}
      />
    </DemoSessionProvider>,
  );

  expect(await screen.findByRole("alert")).toHaveTextContent("새 원정 시작을 잠시 막았어요");
  expect(within(screen.getByRole("complementary", { name: "부산 전술 패널" }))
    .getByRole("button", { name: "원정 시작" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(retry).toHaveBeenCalledOnce();
});

it("changes results when the user filters to contested territory", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist();

  await screen.findByRole("complementary", { name: "부산 전술 패널" });
  await user.click(screen.getByRole("button", { name: "접전 지역" }));

  expect(screen.getByRole("list", { name: "지도와 같은 영토 목록" }))
    .toHaveTextContent("탈환까지");
  // The sort note explained an ordering the list itself shows, so it is gone.
  expect(screen.queryByText(/^정렬:/)).not.toBeInTheDocument();
});

it("shows the resolved fandom owner after a mission captures a territory", () => {
  let ready = demoSessionReducer(createInitialDemoSession(), { type: "selectArtist", artistId: "bts" });
  ready = demoSessionReducer(ready, { type: "openExpedition", expeditionId: "bts-busan-artist-linked-expedition" });
  const tied = demoSessionReducer(ready, {
    type: "completeCheckIn", expeditionId: "bts-busan-artist-linked-expedition", placeId: "busan-1", award: award(80),
  });
  let challenger = demoSessionReducer(tied, { type: "selectArtist", artistId: "blackpink" });
  challenger = demoSessionReducer(challenger, { type: "selectTerritory", territoryId: "busan" });
  challenger = demoSessionReducer(challenger, { type: "openExpedition", expeditionId: "busan-regional-support-expedition" });
  const captured = demoSessionReducer(challenger, {
    type: "completeCheckIn",
    expeditionId: "busan-regional-support-expedition",
    placeId: "busan-2",
    award: award(161),
  });
  const busan = captured.territories.find((territory) => territory.id === "busan")!;

  expect(busan.ownerArtistId).toBe("blackpink");
  expect(busan.standings[0]?.fandomName).toBe("ARMY");
  render(
    <TerritoryList
      territories={[busan]}
      locale="ko"
      selectedArtistId="blackpink"
      selectedTerritoryId="busan"
      onSelectTerritory={vi.fn()}
    />,
  );

  const row = screen.getByRole("button", { name: /^부산/ });
  expect(row).toHaveTextContent("BLINK");
  expect(row).not.toHaveTextContent("ARMY");
});

it("keeps personalized filter IDs and fandom filtering", () => {
  const state = confirmedSession();

  expect(TERRITORY_FILTERS.map((filter) => filter.id)).toEqual([
    "my_fandom",
    "contested",
    "artist_connection",
    "all",
  ]);
  expect(filterAndOrderTerritories(state.territories, "my_fandom", "bts")
    .map((territory) => territory.id))
    .toEqual(["busan", "daegu", "yeongwol"]);
});

// Yeongwol is ARMY-held but carries no researched BTS tie, and the panel used
// to answer that by shipping the reader off to Busan. A region with no tie
// keeps its own public route and says so.
it("keeps a region with no tie on its own public route", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist({ selectedTerritoryId: "yeongwol" });

  const panel = await screen.findByRole("complementary", { name: "영월 전술 패널" });
  expect(within(panel).getByText("지역의 공공 관광 코스")).toBeVisible();
  expect(within(panel).queryByText(/지역 연결 스토리/)).not.toBeInTheDocument();
  expect(within(panel).queryByLabelText("연결 근거 등급")).not.toBeInTheDocument();
  expect(within(panel).getByRole("link", { name: "출처 확인" })).toHaveAttribute("href", expect.stringMatching(/^https:\/\//));

  const action = within(panel).getByRole("button", { name: "원정 시작" });
  expect(action).toBeEnabled();
  await user.click(action);

  await waitFor(() => {
    const saved = JSON.parse(window.localStorage.getItem(DEMO_SESSION_KEY)!) as DemoSession;
    expect(saved.selectedTerritoryId).toBe("yeongwol");
    expect(saved.selectedExpeditionId).toBe("yeongwol-regional-support-expedition");
  });
});

it.each([
  ["gwangju", "광주", "지역균형 보너스 1×", "기본 지역균형 배율"],
  ["yeongwol", "영월", "지역균형 보너스 1.8×", "인구감소지역"],
] as const)("keeps %s battle context on its own recommended route", async (territoryId, territoryName, bonus, reason) => {
  const user = userEvent.setup();
  renderPreviewWithArtist({ selectedTerritoryId: territoryId });

  const panel = await screen.findByRole("complementary", { name: `${territoryName} 전술 패널` });
  expect(within(panel).getByRole("heading", { name: territoryName })).toBeVisible();
  const action = within(panel).getByRole("button", { name: "원정 시작" });
  expect(action).toBeEnabled();

  const projection = within(panel).getByRole("region", { name: `${territoryName} 추천 원정 영향` });
  // The projection is the selected region's own now, so its multiplier is too.
  expect(projection).toHaveTextContent(bonus);
  expect(projection).toHaveTextContent(reason);
  expect(projection).toHaveTextContent(/영토 영향/);
  expect(projection).toHaveTextContent(/팬덤 순위 영향.*#1.*현재 순위 유지/);

  await user.click(action);
  await waitFor(() => {
    const saved = JSON.parse(window.localStorage.getItem(DEMO_SESSION_KEY)!) as DemoSession;
    expect(saved.selectedTerritoryId).toBe(territoryId);
    expect(saved.selectedExpeditionId).toBe(`${territoryId}-regional-support-expedition`);
  });
});


it("names the region's own public route in English when there is no tie", async () => {
  renderPreviewWithArtist({ locale: "en", selectedTerritoryId: "yeongwol" });

  const panel = await screen.findByRole("complementary", { name: "Yeongwol tactical panel" });
  expect(within(panel).getByText("Public tourism route in this region")).toBeVisible();
  expect(within(panel).queryByText(/Regional connection story/)).not.toBeInTheDocument();
  expect(within(panel).queryByText(/in Busan is recommended/i)).not.toBeInTheDocument();
});

it.each([
  [
    "ko",
    ["소유 영토", "접전 지역", "아티스트 연결", "전체"],
    "현재 소유",
    "전국 보기",
    "내 팬덤 관리",
  ],
  [
    "en",
    ["Owned territories", "Contested", "Artist connection", "All"],
    "Current owner",
    "National view",
    "Manage my fandoms",
  ],
] as const)("keeps every personalized value and filter order available in %s", async (locale, filterLabels, owner, nationalView, changeArtist) => {
  const user = userEvent.setup();
  renderPreviewWithArtist({ locale: locale as "ko" | "en", selectedArtistId: "boynextdoor", selectedTerritoryId: "gwangju" });

  await screen.findByRole("button", { name: filterLabels[0] });
  // The phone listbox repeats the current filter's label, so read the tag row.
  const filters = screen.getAllByRole("button")
    .filter((button) => !button.closest(".filter-select"))
    .filter((button) => filterLabels.includes(button.textContent as typeof filterLabels[number]));
  expect(filters.map((button) => button.textContent)).toEqual(filterLabels);
  expect(filters[0]).toHaveAttribute("aria-pressed", "true");
  const territoryListLabel = locale === "ko" ? "지도와 같은 영토 목록" : "Map-equivalent territory list";
  // The card names the fandom; "current owner" was a label saying what the
  // position of the name already says.
  expect(screen.getByRole("list", { name: territoryListLabel })).toHaveTextContent("ONEDOOR");
  expect(screen.getByRole("list", { name: territoryListLabel })).not.toHaveTextContent(owner);
  expect(screen.queryByRole("button", { name: nationalView })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: changeArtist })).not.toBeInTheDocument();

  const territoryNames = locale === "ko"
    ? {
        busan: "부산", daegu: "대구", gwangju: "광주", gunpo: "군포", seongnam: "성남", geoje: "거제", suwon: "수원", gyeongju: "경주", daejeon: "대전", seoul: "서울", yongin: "용인", goyang: "고양", incheon: "인천", jeju: "제주", ulsan: "울산", siheung: "시흥", cheonan: "천안", pohang: "포항", wonju: "원주", chuncheon: "춘천", uijeongbu: "의정부", namyangju: "남양주", yeongwol: "영월",
      }
    : {
        busan: "Busan", daegu: "Daegu", gwangju: "Gwangju", gunpo: "Gunpo", seongnam: "Seongnam", geoje: "Geoje", suwon: "Suwon", gyeongju: "Gyeongju", daejeon: "Daejeon", seoul: "Seoul", yongin: "Yongin", goyang: "Goyang", incheon: "Incheon", jeju: "Jeju", ulsan: "Ulsan", siheung: "Siheung", cheonan: "Cheonan", pohang: "Pohang", wonju: "Wonju", chuncheon: "Chuncheon", uijeongbu: "Uijeongbu", namyangju: "Namyangju", yeongwol: "Yeongwol",
      };
  // Gwangju is the selected territory, so it joins the end of any filter that
  // does not already list it — picking on the map no longer widens the filter.
  const expectedTerritoryIds = [
    ["wonju", "gwangju"],
    ["wonju", "chuncheon", "yongin", "gunpo", "cheonan", "daejeon", "busan", "ulsan", "gwangju"],
    // ONEDOOR's researched ties are LEEHAN's Busan and SUNGHO's Wonju. The
    // Gwangju and Suwon entries had no article behind them and are gone.
    ["busan", "wonju", "gwangju"],
    // Gwangju and Suwon fall back into plain order now that ONEDOOR has no
    // researched tie to either.
    ["busan", "wonju", "gunpo", "daejeon", "yongin", "ulsan", "cheonan", "chuncheon", "yeongwol", "geoje", "gyeongju", "goyang", "gwangju", "namyangju", "daegu", "seoul", "seongnam", "suwon", "siheung", "uijeongbu", "incheon", "jeju", "pohang"],
  ] as const;
  const list = screen.getByRole("list", { name: locale === "ko" ? "지도와 같은 영토 목록" : "Map-equivalent territory list" });
  for (const [index, filter] of filterLabels.entries()) {
    await user.click(screen.getByRole("button", { name: filter }));
    const actualTerritoryIds = within(list).getAllByRole("button").map((button) => {
      const name = button.querySelector("strong")?.textContent;
      return Object.entries(territoryNames).find(([, territoryName]) => territoryName === name)?.[0];
    });
    expect(actualTerritoryIds).toEqual(expectedTerritoryIds[index]);
  }
});

it("explains the point breakdown from the award box help toggle", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist();

  const award = await screen.findByRole("region", { name: "추천 원정 예상 포인트" });
  expect(within(award).queryByText("방문 기본", { selector: "strong" })).not.toBeInTheDocument();

  const help = within(award).getByRole("button", { name: "포인트 계산 방식 보기" });
  expect(help).toHaveAttribute("aria-expanded", "false");
  await user.click(help);

  expect(help).toHaveAttribute("aria-expanded", "true");
  const note = document.getElementById("tactical-award-help")!;
  expect(award).toContainElement(note);
  // The thresholds and values come from GAME_RULES, so the copy cannot drift.
  expect(note).toHaveTextContent(`${GAME_RULES.dwellLongMinutes}분 이상 머물면 ${GAME_RULES.dwell60Minutes}P`);
  expect(note).toHaveTextContent(`지역 가게에서 쓴 내역을 인증하면 ${GAME_RULES.localSpend}P`);
  expect(note).toHaveTextContent(`숙박을 인증하면 ${GAME_RULES.accommodation}P`);
  expect(note).toHaveTextContent(`씨앗 +${GAME_RULES.strongholdVisitBonus}P`);

  await user.click(help);
  expect(help).toHaveAttribute("aria-expanded", "false");
  expect(document.getElementById("tactical-award-help")).toBeNull();
});

it("explains the impact figures from their own help toggle", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist();

  const impact = await screen.findByRole("region", { name: "부산 추천 원정 영향" });
  const help = within(impact).getByRole("button", { name: "영향 지표 설명 보기" });
  expect(help).toHaveAttribute("aria-expanded", "false");

  await user.click(help);

  const note = document.getElementById("tactical-impact-help")!;
  expect(impact).toContainElement(note);
  // Each term repeats a label rendered in the same box.
  expect(within(note).getByText("지역균형 보너스")).toBeVisible();
  expect(within(note).getByText("영토 영향")).toBeVisible();
  expect(within(note).getByText("팬덤 순위 영향")).toBeVisible();
  expect(note).toHaveTextContent("소유자를 넘어서면 점령 예상");
  expect(note).toHaveTextContent("거점 수를 먼저 보고, 같으면 유효 포인트로 갈립니다");

  // The two help toggles are independent.
  expect(within(impact).getByRole("button", { name: "영향 지표 설명 보기" })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "포인트 계산 방식 보기" })).toHaveAttribute("aria-expanded", "false");

  await user.click(help);
  expect(document.getElementById("tactical-impact-help")).toBeNull();
});

it("reports a started route as in progress on the tactical panel", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist({ selectedArtistId: "blackpink", selectedTerritoryId: "gunpo" });

  await user.click(within(await screen.findByRole("complementary", { name: "군포 전술 패널" }))
    .getByRole("button", { name: "원정 시작" }));

  expect(within(screen.getByRole("complementary", { name: "군포 전술 패널" }))
    .getByRole("button", { name: "원정 중" })).toBeVisible();
});

it("pages the tactical panel through the listed territories", async () => {
  const user = userEvent.setup();
  // BLINK owns exactly two territories, so the pager holds two pages.
  renderPreviewWithArtist({ selectedArtistId: "blackpink", selectedTerritoryId: "gunpo" });

  const panel = await screen.findByRole("complementary", { name: "군포 전술 패널" });
  expect(within(panel).getAllByRole("button", { name: /번째 영토 보기$/ })).toHaveLength(2);
  expect(within(panel).getAllByRole("button", { name: /번째 영토 보기$/ })[0]).toHaveAttribute("aria-current", "true");
  expect(within(panel).getByRole("button", { name: "이전 영토" })).toBeDisabled();

  await user.click(within(panel).getByRole("button", { name: "다음 영토" }));

  const next = await screen.findByRole("complementary", { name: "성남 전술 패널" });
  expect(within(next).getByRole("heading", { name: "성남" })).toBeVisible();
  expect(within(next).getAllByRole("button", { name: /번째 영토 보기$/ })[1]).toHaveAttribute("aria-current", "true");
  expect(within(next).getByRole("button", { name: "다음 영토" })).toBeDisabled();

  // A dot jumps straight back to its territory.
  await user.click(within(next).getAllByRole("button", { name: /번째 영토 보기$/ })[0]);
  expect(await screen.findByRole("complementary", { name: "군포 전술 패널" })).toBeVisible();
});

it("hides the pager while a single territory is listed", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist({ selectedArtistId: "seventeen", selectedTerritoryId: "namyangju" });

  const panel = await screen.findByRole("complementary", { name: "남양주 전술 패널" });
  expect(within(panel).queryByRole("button", { name: "다음 영토" })).not.toBeInTheDocument();
  expect(within(panel).queryByRole("button", { name: /번째 영토 보기$/ })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "전체" }));

  // A long filter keeps the dots and shows a window around where the reader
  // is, rather than swapping to a bare count.
  const widened = await screen.findByRole("complementary", { name: "남양주 전술 패널" });
  expect(within(widened).getByRole("button", { name: "다음 영토" })).toBeInTheDocument();
  const dots = within(widened).getAllByRole("button", { name: /번째 영토 보기$/ });
  expect(dots).toHaveLength(9);
  expect(dots.filter((dot) => dot.getAttribute("aria-current") === "true")).toHaveLength(1);
});

it("pages the panel with a horizontal swipe but leaves vertical drags alone", async () => {
  renderPreviewWithArtist({ selectedArtistId: "blackpink", selectedTerritoryId: "gunpo" });

  const panel = await screen.findByRole("complementary", { name: "군포 전술 패널" });
  fireEvent.touchStart(panel, { touches: [{ clientX: 200, clientY: 100 }] });
  fireEvent.touchEnd(panel, { changedTouches: [{ clientX: 176, clientY: 300 }] });
  expect(screen.getByRole("complementary", { name: "군포 전술 패널" })).toBeVisible();

  const beforeSwipe = screen.getByRole("complementary", { name: "군포 전술 패널" });
  fireEvent.touchStart(beforeSwipe, { touches: [{ clientX: 240, clientY: 120 }] });
  fireEvent.touchEnd(beforeSwipe, { changedTouches: [{ clientX: 120, clientY: 132 }] });
  expect(await screen.findByRole("complementary", { name: "성남 전술 패널" })).toBeVisible();

  // Swiping past the last territory stays put.
  const last = screen.getByRole("complementary", { name: "성남 전술 패널" });
  fireEvent.touchStart(last, { touches: [{ clientX: 240, clientY: 120 }] });
  fireEvent.touchEnd(last, { changedTouches: [{ clientX: 120, clientY: 120 }] });
  expect(screen.getByRole("complementary", { name: "성남 전술 패널" })).toBeVisible();
});

// A route running elsewhere used to lock this button, leaving the reader to
// work out where they had to go to unlock it. They can start here; the question
// only makes sure they meant to leave the other one behind.
it("asks before moving a running expedition to another territory", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist({ selectedArtistId: "blackpink", selectedTerritoryId: "gunpo" });

  await user.click(within(await screen.findByRole("complementary", { name: "군포 전술 패널" }))
    .getByRole("button", { name: "원정 시작" }));
  await user.click(within(screen.getByRole("complementary", { name: "군포 전술 패널" }))
    .getByRole("button", { name: "다음 영토" }));

  const seongnam = await screen.findByRole("complementary", { name: "성남 전술 패널" });
  const start = within(seongnam).getByRole("button", { name: "다른 원정 진행 중" });
  expect(start).toBeEnabled();

  await user.click(start);
  const dialog = await screen.findByRole("dialog", { name: "진행 중인 원정을 두고 옮길까요?" });
  expect(dialog).toHaveTextContent("군포 원정이 진행 중이에요");

  await user.click(within(dialog).getByRole("button", { name: "여기서 시작" }));
  await waitFor(() => {
    const saved = JSON.parse(window.localStorage.getItem(DEMO_SESSION_KEY)!) as DemoSession;
    expect(saved.selectedTerritoryId).toBe("seongnam");
    expect(saved.activeExpeditionId).toBe("seongnam-regional-support-expedition");
  });
});

it("keeps the filters in the map action row and the camera reset out of it without a map", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist();

  const filters = await screen.findByRole("group", { name: "영토 필터" });
  const actions = filters.closest(".preview-map-actions");
  expect(actions).not.toBeNull();
  // The filter group sits with the map controls rather than above the map.
  expect(document.querySelector(".preview-page-title ~ .map-filters")).toBeNull();
  // The camera reset lives on the map corner, never in the row above the cards.
  expect(within(actions!).queryByRole("button", { name: "전국 보기" })).not.toBeInTheDocument();
  expect(document.querySelector(".preview-map-reset")).toBeNull();

  // Filtering still drives the list under it.
  await user.click(within(filters).getByRole("button", { name: "전체" }));
  const list = screen.getByRole("list", { name: "지도와 같은 영토 목록" });
  expect(within(list).getAllByRole("button")).toHaveLength(23);
});


it("puts the territory list behind a toggle once it runs long", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist();

  await user.click(await screen.findByRole("button", { name: "전체" }));

  const list = screen.getByRole("list", { name: "지도와 같은 영토 목록" });
  const toggle = screen.getByRole("button", { name: "지역 더 보기" });
  // The collapse is a phone affordance, so every row stays in the document.
  expect(list).toHaveClass("collapsed");
  expect(toggle).toHaveAttribute("aria-controls", list.id);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  // It sits between the filter row and the list it controls.
  expect(toggle.previousElementSibling).toHaveClass("preview-map-actions");
  expect(toggle.nextElementSibling).toBe(list);

  // The control is an arrow; its purpose lives in the label.
  expect(toggle).toHaveTextContent("");

  const scrollBy = vi.fn();
  vi.stubGlobal("scrollBy", scrollBy);
  await user.click(toggle);

  expect(list).not.toHaveClass("collapsed");
  expect(scrollBy).toHaveBeenCalledWith({ top: 210, behavior: "smooth" });

  // Collapsing leaves the page where it is.
  scrollBy.mockClear();
  await user.click(screen.getByRole("button", { name: "지역 접기" }));
  expect(scrollBy).not.toHaveBeenCalled();
});

it("offers the filters as a select as well as the tag row", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist();

  const filters = await screen.findByRole("group", { name: "영토 필터" });
  // The listbox is the phone control; the tag row stays for wider screens.
  const trigger = within(filters).getByRole("button", { name: "영토 필터: 소유 영토" });
  expect(within(filters).getByRole("button", { name: "전체", hidden: false })).toBeInTheDocument();

  await user.click(trigger);
  await user.click(within(screen.getByRole("listbox", { name: "영토 필터" })).getByRole("option", { name: "전체" }));

  expect(within(filters).getByRole("button", { name: "영토 필터: 전체" })).toBeInTheDocument();
  expect(within(screen.getByRole("list", { name: "지도와 같은 영토 목록" })).getAllByRole("button")).toHaveLength(23);
});


it("tells the fandom's own tie to the region it is a tie to", async () => {
  // BLINK has no artist-linked route anywhere, but Gunpo is JISOO's birthplace
  // and the research names it, so the story belongs on Gunpo's panel — with the
  // route still honestly labelled as the region's public one.
  renderPreviewWithArtist({ selectedArtistId: "blackpink", selectedTerritoryId: "gunpo" });

  const panel = await screen.findByRole("complementary", { name: "군포 전술 패널" });
  expect(within(panel).getByText(/지역 연결 스토리 · 지수/)).toBeVisible();
  expect(within(panel).getByText("공식 관광 출처 기반 공공 원정")).toBeVisible();

  // The source is a corner link now, not a disclosure.
  const source = within(panel).getByRole("link", { name: "출처 확인" });
  expect(source).toHaveClass("tactical-source");
  expect(within(panel).queryByText("추천 근거 보기")).not.toBeInTheDocument();

  // The stronghold-growth note sits on its own line under the defence gap,
  // whose value carries the number alone — the row label says what it means.
  const gapRow = within(panel).getByText("방어 우위").closest("div")!;
  const gap = within(gapRow).getByText(/^\d+P$/);
  expect(gap.nextElementSibling).toHaveTextContent(/거점 성장까지|최고 단계 방어 중/);
});

it("labels a public route without borrowing the artist connection story", async () => {
  // BLINK has no researched tie to Busan, so nothing is borrowed to fill it —
  // not JISOO's Gunpo story, not anyone else's.
  renderPreviewWithArtist({ selectedArtistId: "blackpink", selectedTerritoryId: "busan" });

  const panel = await screen.findByRole("complementary", { name: "부산 전술 패널" });
  expect(within(panel).getByText("지역의 공공 관광 코스")).toBeVisible();
  expect(within(panel).getByText("공식 관광 출처 기반 공공 원정")).toBeVisible();
  expect(within(panel).queryByText(/지역 연결 스토리/)).not.toBeInTheDocument();
});

it("sets the balance multiplier beside the stronghold mark", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist();
  await user.click(await screen.findByRole("button", { name: "전체" }));

  const list = screen.getByRole("list", { name: "지도와 같은 영토 목록" });
  // Yeongwol is the one territory carrying a population-decline multiplier.
  const yeongwol = within(list).getByRole("button", { name: /^영월/ });
  const multiplier = within(yeongwol).getByText("1.8×");
  expect(multiplier).toHaveClass("territory-multiplier");
  // It shares the stronghold row instead of adding one of its own.
  expect(multiplier.previousElementSibling).toHaveAttribute("role", "img");
  expect(within(yeongwol).getByText(/방어 우위|탈환까지/)).toHaveClass("territory-gap");
});

it("clears the tactical panel when the selected territory is picked again", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist();

  expect(await screen.findByRole("complementary", { name: "부산 전술 패널" })).toBeVisible();
  const list = screen.getByRole("list", { name: "지도와 같은 영토 목록" });
  const busan = within(list).getByRole("button", { name: /^부산/ });
  expect(busan).toHaveAttribute("aria-pressed", "true");

  await user.click(busan);

  // Deselecting puts the panel away and gives the map the whole row.
  expect(busan).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByRole("complementary", { name: /전술 패널$/ })).not.toBeInTheDocument();
  expect(document.querySelector(".preview-map-layout")).toHaveClass("preview-map-layout--solo");

  await user.click(busan);
  expect(screen.getByRole("complementary", { name: "부산 전술 패널" })).toBeVisible();
});

it("keeps the tactical card open, with no chevron to fold it away", async () => {
  renderPreviewWithArtist();

  const panel = await screen.findByRole("complementary", { name: "부산 전술 패널" });
  // The fandom line is gone; the territory name carries the header alone.
  expect(within(panel).getByRole("heading", { name: "부산" }).parentElement)
    .not.toHaveTextContent("ARMY");

  // The card is what the reader came for, so it has nothing to fold away.
  expect(within(panel).queryByRole("button", { name: "영토 카드 접기" })).not.toBeInTheDocument();
  expect(within(panel).queryByRole("button", { name: "영토 카드 펼치기" })).not.toBeInTheDocument();
  expect(within(panel).getByRole("button", { name: "원정 시작" })).toBeVisible();
});

it("slides the tactical card in from the side it was paged from", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist({ selectedArtistId: "blackpink", selectedTerritoryId: "gunpo" });

  const panel = await screen.findByRole("complementary", { name: "군포 전술 패널" });
  expect(document.getElementById("tactical-panel-body")).not.toHaveClass("slide-next");

  await user.click(within(panel).getByRole("button", { name: "다음 영토" }));

  expect(document.getElementById("tactical-panel-body")).toHaveClass("slide-next");

  await user.click(within(screen.getByRole("complementary", { name: "성남 전술 패널" }))
    .getByRole("button", { name: "이전 영토" }));

  expect(document.getElementById("tactical-panel-body")).toHaveClass("slide-previous");
});

it("lets a filter change the list without changing what is chosen", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist();

  const panel = await screen.findByRole("complementary", { name: "부산 전술 패널" });
  await user.click(within(screen.getByRole("list", { name: "지도와 같은 영토 목록" }))
    .getByRole("button", { name: /^부산/ }));
  expect(panel).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "전체" }));
  expect(screen.queryByRole("complementary", { name: /전술 패널$/ })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "소유 영토" }));
  expect(screen.queryByRole("complementary", { name: /전술 패널$/ })).not.toBeInTheDocument();

  // A filter decides what the list shows, never what is chosen: the territory
  // the reader picked stays picked even where the filter hides its card.
  await user.click(within(screen.getByRole("list", { name: "지도와 같은 영토 목록" }))
    .getByRole("button", { name: /^영월/ }));
  expect(await screen.findByRole("complementary", { name: "영월 전술 패널" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "접전 지역" }));
  expect(screen.getByRole("complementary", { name: "영월 전술 패널" })).toBeVisible();
});

it("brings the map into view when a territory card is chosen", async () => {
  const user = userEvent.setup();
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  renderPreviewWithArtist();

  await user.click(within(await screen.findByRole("list", { name: "지도와 같은 영토 목록" }))
    .getByRole("button", { name: /^대구/ }));

  expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });

  // Deselecting is not a reason to move the page.
  scrollIntoView.mockClear();
  await user.click(within(screen.getByRole("list", { name: "지도와 같은 영토 목록" }))
    .getByRole("button", { name: /^대구/ }));
  expect(scrollIntoView).not.toHaveBeenCalled();
});

it("holds the page still while the tactical card pages to another territory", async () => {
  const user = userEvent.setup();
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  renderPreviewWithArtist();

  await user.click(within(await screen.findByRole("list", { name: "지도와 같은 영토 목록" }))
    .getByRole("button", { name: /^대구/ }));
  expect(scrollIntoView).toHaveBeenCalled();

  // Paging keeps the card under the reader's thumb, so the page stays put
  // even though the map still follows the new territory.
  scrollIntoView.mockClear();
  await user.click(screen.getByRole("button", { name: "다음 영토" }));

  expect(scrollIntoView).not.toHaveBeenCalled();
  expect(screen.getByRole("complementary", { name: /전술 패널$/ })).toBeVisible();
});

it("opens the territory standings and marks only the reader's own fandom", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist();

  const panel = await screen.findByRole("complementary", { name: "부산 전술 패널" });
  const standings = within(panel).getByRole("region", { name: "부산 영토 현황" });
  const toggle = within(standings).getByRole("button", { name: /영토 현황/ });
  expect(toggle).toHaveAttribute("aria-expanded", "false");

  await user.click(toggle);

  // Every fandom in the territory is listed with its own points, ranked.
  const rows = within(standings).getAllByRole("listitem");
  expect(rows.length).toBeGreaterThan(1);
  expect(rows[0]).toHaveTextContent("ARMY");
  expect(rows.filter((row) => row.className.includes("mine"))).toHaveLength(1);
});
