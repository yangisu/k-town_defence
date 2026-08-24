import { render, screen, waitFor, within } from "@testing-library/react";
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
import type { MissionAward } from "@/features/team-preview/game-rules";
import { DemoSessionProvider } from "@/features/team-preview/demo-session-context";

beforeEach(() => window.localStorage.clear());

function confirmedSession(overrides: Partial<DemoSession> = {}): DemoSession {
  return {
    ...createInitialDemoSession(),
    artistConfirmed: true,
    selectedArtistId: "bts",
    selectedTerritoryId: "busan",
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
        onChooseArtist={vi.fn()}
      />
    </DemoSessionProvider>,
  );

}

const award = (points: number): MissionAward => ({
  visit: points,
  dwell: 0,
  localSpend: 0,
  accommodation: 0,
  subtotal: points,
  multiplier: 1,
  validPoints: points,
  cappedPoints: points,
});

it("turns artist choice into a visible tactical recommendation", async () => {
  renderPreviewWithArtist();

  const panel = await screen.findByRole("complementary", { name: "부산 전술 패널" });
  expect(within(panel).getByText(/^(정국|지민)$/)).toBeVisible();
  expect(within(panel).getByRole("heading", { name: "부산" })).toBeVisible();
  expect(within(panel).getByText(/^방어 우위$/)).toBeVisible();
  expect(within(panel).getByText(/지역균형 보너스/)).toBeVisible();
  expect(within(panel).getByText("방문 기본")).toBeVisible();
  expect(within(panel).getByText("체류 보너스")).toBeVisible();
  expect(within(panel).getByText("로컬 소비")).toBeVisible();
  expect(within(panel).getByText("숙박")).toBeVisible();
  expect(within(panel).getByText(/영토 영향/)).toBeVisible();
  expect(within(panel).getByText(/팬덤 순위 영향/)).toBeVisible();
  expect(within(panel).getByRole("link", { name: "연결 근거 출처" })).toHaveAttribute("href", expect.stringMatching(/^https:\/\//));
  expect(within(panel).getByRole("button", { name: /원정 시작/ })).toBeEnabled();
});

it("changes results when the user filters to contested territory", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist();

  await screen.findByRole("complementary", { name: "부산 전술 패널" });
  await user.click(screen.getByRole("button", { name: "접전 지역" }));

  expect(screen.getByRole("list", { name: "지도와 같은 영토 목록" }))
    .toHaveTextContent("탈환까지");
});

it("shows the resolved fandom owner after a mission captures a territory", () => {
  let ready = demoSessionReducer(createInitialDemoSession(), { type: "selectArtist", artistId: "bts" });
  ready = demoSessionReducer(ready, { type: "openExpedition", expeditionId: "bts-busan-expedition" });
  const tied = demoSessionReducer(ready, {
    type: "completeCheckIn", expeditionId: "bts-busan-expedition", placeId: "busan-1", award: award(80),
  });
  let challenger = demoSessionReducer(tied, { type: "selectArtist", artistId: "blackpink" });
  challenger = demoSessionReducer(challenger, { type: "selectTerritory", territoryId: "busan" });
  challenger = demoSessionReducer(challenger, { type: "openExpedition", expeditionId: "busan-public-expedition" });
  const captured = demoSessionReducer(challenger, {
    type: "completeCheckIn",
    expeditionId: "busan-public-expedition",
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
    .toEqual(["daegu", "busan", "yeongwol"]);
});

it("routes an empty region to a sourced same-territory expedition without fabricating evidence", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist({ selectedTerritoryId: "yeongwol" });

  const panel = await screen.findByRole("complementary", { name: "영월 전술 패널" });
  expect(within(panel).getByText("인근 추천")).toBeVisible();
  expect(within(panel).queryByLabelText("연결 근거 등급")).not.toBeInTheDocument();
  expect(within(panel).getByRole("link", { name: "영토 자료 출처" })).toHaveAttribute("href", expect.stringMatching(/^https:\/\//));

  const action = within(panel).getByRole("button", { name: "원정 시작" });
  expect(action).toBeEnabled();
  await user.click(action);

  await waitFor(() => {
    const saved = JSON.parse(window.localStorage.getItem(DEMO_SESSION_KEY)!) as DemoSession;
    expect(saved.selectedTerritoryId).toBe("yeongwol");
    expect(saved.selectedExpeditionId).toBe("yeongwol-public-expedition");
  });
});

it.each([
  ["gwangju", "광주"],
  ["yeongwol", "영월"],
] as const)("keeps %s battle context and actionable projection in the same territory", async (territoryId, territoryName) => {
  renderPreviewWithArtist({ selectedTerritoryId: territoryId });

  const panel = await screen.findByRole("complementary", { name: `${territoryName} 전술 패널` });
  expect(within(panel).getByRole("heading", { name: territoryName })).toBeVisible();
  expect(within(panel).getByRole("button", { name: "원정 시작" })).toBeEnabled();

  const projection = within(panel).getByRole("region", { name: `${territoryName} 추천 원정 영향` });
  expect(projection).toHaveTextContent(territoryId === "yeongwol" ? "지역균형 보너스 1.8×" : "지역균형 보너스 1×");
  expect(projection).toHaveTextContent(territoryId === "yeongwol" ? "인구감소지역 지정" : "기본 지역균형 배율");
  expect(projection).toHaveTextContent(/영토 영향/);
  expect(projection).toHaveTextContent(/팬덤 순위 영향.*#1.*현재 순위 유지/);
});

it.each([
  ["ko", ["내 팬덤", "접전 지역", "아티스트 연결", "전체"], ["소유 영토", "가장 강한 소유 영토", "가장 가까운 접전 영토", "추천 행동"], "현재 소유", "전국 보기", "아티스트 변경", "내 팬덤 영토 요약"],
  ["en", ["My fandom", "Contested", "Artist connection", "All"], ["Owned territories", "Strongest owned territory", "Nearest contested territory", "Recommended action"], "Current owner", "National view", "Change artist", "My fandom territory summary"],
] as const)("keeps all personalized map fallbacks available in %s", async (locale, filterLabels, summaryLabels, owner, nationalView, changeArtist, summary) => {
  const user = userEvent.setup();
  renderPreviewWithArtist({ locale: locale as "ko" | "en", selectedArtistId: "boynextdoor", selectedTerritoryId: "gwangju" });

  await screen.findByRole("button", { name: filterLabels[0] });
  const filters = screen.getAllByRole("button").filter((button) => filterLabels.includes(button.textContent as typeof filterLabels[number]));
  expect(filters.map((button) => button.textContent)).toEqual(filterLabels);
  expect(filters[0]).toHaveAttribute("aria-pressed", "true");
  const summaryRegion = screen.getByRole("region", { name: summary });
  for (const label of summaryLabels) expect(summaryRegion).toHaveTextContent(label);
  expect(screen.getByRole("list")).toHaveTextContent(`${owner} · ONEDOOR`);
  expect(screen.getByRole("button", { name: nationalView })).toBeVisible();
  expect(screen.getByRole("button", { name: changeArtist })).toBeVisible();

  const list = screen.getByRole("list");
  const lengths: number[] = [];
  for (const filter of filterLabels) {
    await user.click(screen.getByRole("button", { name: filter }));
    lengths.push(within(list).getAllByRole("button").length);
  }
  expect(lengths).toEqual([2, 23, 4, 23]);
});
