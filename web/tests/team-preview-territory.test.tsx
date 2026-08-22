import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { TerritoryView } from "@/components/team-preview/territory-view";
import {
  TERRITORY_FILTERS,
  filterAndOrderTerritories,
} from "@/components/team-preview/map-filters";
import {
  DEMO_SESSION_KEY,
  createInitialDemoSession,
  type DemoSession,
} from "@/features/team-preview/demo-session";
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
