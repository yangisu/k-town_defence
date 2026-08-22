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
import { KTownApp } from "@/features/ktown-app";

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
  const onOpenExpedition = vi.fn();

  render(
    <DemoSessionProvider storage={window.localStorage}>
      <TerritoryView
        mapConfig={null}
        onChooseArtist={vi.fn()}
        onSelectTerritory={vi.fn()}
        onOpenExpedition={onOpenExpedition}
      />
    </DemoSessionProvider>,
  );

  return { onOpenExpedition };
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
  const tied = demoSessionReducer(createInitialDemoSession(), {
    type: "completeMission",
    missionId: "busan-1",
    award: award(80),
  });
  const challenger = demoSessionReducer(tied, { type: "selectArtist", artistId: "blackpink" });
  const captured = demoSessionReducer(challenger, {
    type: "completeMission",
    missionId: "busan-2",
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

it("keeps exact filter IDs and deterministic recommendation priority", () => {
  const state = confirmedSession();

  expect(TERRITORY_FILTERS.map((filter) => filter.id)).toEqual([
    "recommended",
    "unclaimed",
    "contested",
    "artist_connection",
    "population_decline",
  ]);
  expect(filterAndOrderTerritories(state.territories, "recommended", "bts")
    .slice(0, 4)
    .map((territory) => territory.id))
    .toEqual(["gwangju", "daegu", "busan", "yeongwol"]);
});

it("routes an empty region to a sourced playable recommendation without fabricating evidence", async () => {
  const user = userEvent.setup();
  const { onOpenExpedition } = renderPreviewWithArtist({ selectedTerritoryId: "yeongwol" });

  const panel = await screen.findByRole("complementary", { name: "영월 전술 패널" });
  expect(within(panel).getByText("인근 추천")).toBeVisible();
  expect(within(panel).queryByLabelText("연결 근거 등급")).not.toBeInTheDocument();
  expect(within(panel).getByRole("link", { name: "영토 자료 출처" })).toHaveAttribute("href", expect.stringMatching(/^https:\/\//));

  const action = within(panel).getByRole("button", { name: "부산 원정 시작" });
  expect(action).toBeEnabled();
  await user.click(action);

  expect(onOpenExpedition).toHaveBeenCalledWith("busan", "bts-busan-expedition");
  await waitFor(() => {
    const saved = JSON.parse(window.localStorage.getItem(DEMO_SESSION_KEY)!) as DemoSession;
    expect(saved.selectedTerritoryId).toBe("busan");
  });
});

it.each([
  ["gwangju", "광주"],
  ["yeongwol", "영월"],
] as const)("keeps %s battle context separate from the actionable Busan projection", async (territoryId, territoryName) => {
  renderPreviewWithArtist({ selectedTerritoryId: territoryId });

  const panel = await screen.findByRole("complementary", { name: `${territoryName} 전술 패널` });
  expect(within(panel).getByRole("heading", { name: territoryName })).toBeVisible();
  expect(within(panel).getByRole("button", { name: "부산 원정 시작" })).toBeEnabled();

  const projection = within(panel).getByRole("region", { name: "부산 추천 원정 영향" });
  expect(projection).toHaveTextContent("지역균형 보너스 1×");
  expect(projection).toHaveTextContent("기본 지역균형 배율");
  expect(projection).toHaveTextContent(/영토 영향.*방어 유지.*씨앗 → 나무/);
  expect(projection).toHaveTextContent(/팬덤 순위 영향.*#1.*현재 순위 유지/);
});

it("normalizes a stale local filter after reset and artist reselection", async () => {
  const user = userEvent.setup();
  render(<KTownApp mode="demo" mapConfig={null} />);

  await user.click(await screen.findByRole("button", { name: "아티스트 선택" }));
  await user.click(screen.getByRole("radio", { name: /BTS.*ARMY/ }));
  await user.click(screen.getByRole("button", { name: "인구감소지역 보너스" }));

  expect(await screen.findByRole("complementary", { name: "영월 전술 패널" })).toBeVisible();
  expect(within(screen.getByRole("list", { name: "지도와 같은 영토 목록" })).getAllByRole("button"))
    .toHaveLength(1);

  await user.click(screen.getByRole("button", { name: "데모 초기화" }));
  await user.click(within(screen.getByRole("dialog", { name: "데모를 초기화할까요?" }))
    .getByRole("button", { name: "초기화" }));
  await user.click(screen.getByRole("button", { name: "아티스트 선택" }));
  await user.click(screen.getByRole("radio", { name: /aespa.*MY/i }));

  const panel = await screen.findByRole("complementary", { name: "부산 전술 패널" });
  expect(panel).toBeVisible();
  expect(screen.getByRole("button", { name: "추천 지역" })).toHaveAttribute("aria-pressed", "true");
  const list = screen.getByRole("list", { name: "지도와 같은 영토 목록" });
  expect(within(list).getAllByRole("button")).toHaveLength(23);
  expect(within(list).getByRole("button", { name: /^부산/ })).toHaveAttribute("aria-pressed", "true");
});
