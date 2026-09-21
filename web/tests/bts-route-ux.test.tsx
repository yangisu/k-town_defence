import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { RouteRecommendationPicker } from "@/components/team-preview/route-recommendation-picker";
import { PreviewExpeditionView } from "@/components/team-preview/expedition-view";
import { TerritoryView } from "@/components/team-preview/territory-view";
import { DemoSessionProvider } from "@/features/team-preview/demo-session-context";
import { createInitialDemoSession, DEMO_SESSION_KEY } from "@/features/team-preview/demo-session";
import type { AppServices, LiveExpedition, LiveExpeditionStop, PersistedExpedition, Place } from "@/lib/domain";
import { services } from "@/lib/demo-services";

function place(id: string, nameKo: string): Place {
  return {
    id, nameKo, regionId: "busan", category: "culture", categoryLabel: "문화시설", description: `${nameKo} 설명`,
    address: "부산광역시", transit: "도보", dwellMinutes: 30, points: 100, latitude: 35.1, longitude: 129.05,
  };
}

function stop(id: string, name: string, options: Partial<LiveExpeditionStop> = {}): LiveExpeditionStop {
  return {
    order: 1, distanceKm: 0, reasons: ["필수 메인 관광지"], place: place(id, name), kind: "anchor",
    placement: "main", required: true, selectedByDefault: true, evidence: null, ...options,
  };
}

const recommendation: LiveExpedition = {
  id: "recommendation-1", title: "BTS 부산 원정", regionCode: "6", travelDate: "2026-09-21",
  routeKey: "bts-busan", routeVersion: "bts-busan-v1:snapshot:202504",
  stops: [
    stop("anchor-a", "부산아시아드주경기장"),
    stop("optional-1", "부산시민공원", {
      order: 2, kind: "recommendation", placement: "between", required: false, selectedByDefault: false,
      distanceKm: 1.2, reasons: ["우회 1.2km"], evidence: { source: "KTOUR_RELATED_ATTRACTION", reason: "연관 관광지" },
    }),
    stop("anchor-b", "감천문화마을", { order: 3 }),
  ],
};

it("selects optional BTS stops while keeping both required anchors", async () => {
  const user = userEvent.setup();
  const onStart = vi.fn();
  render(<RouteRecommendationPicker recommendation={recommendation} locale="ko" onStart={onStart} />);

  const items = screen.getAllByRole("listitem");
  expect(items.map((item) => within(item).getByRole("heading").textContent)).toEqual([
    "부산아시아드주경기장", "부산시민공원", "감천문화마을",
  ]);
  expect(within(items[0]).getByText("필수")).toBeVisible();
  expect(within(items[1]).getByText("선택")).toBeVisible();
  expect(within(items[1]).getByText(/방문 데이터 기반/)).toBeVisible();

  await user.click(screen.getByRole("button", { name: "부산시민공원 코스에 추가" }));
  expect(screen.getByRole("button", { name: "부산시민공원 코스에서 제외" })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: "선택한 코스로 원정 시작" }));
  expect(onStart).toHaveBeenCalledWith(["optional-1"]);
});

it("shows the anchor-only fallback instead of an error", () => {
  const fallback = {
    ...recommendation,
    routeVersion: "bts-busan-v1:snapshot:RELATED_UNAVAILABLE",
    stops: [recommendation.stops[0], recommendation.stops[2]],
  };
  const onStart = vi.fn();
  render(<RouteRecommendationPicker recommendation={fallback} locale="ko" onStart={onStart} />);
  expect(screen.getByRole("status")).toHaveTextContent("현재는 선택 추천지가 없습니다");
  expect(screen.getAllByText("필수")).toHaveLength(2);
  expect(screen.getAllByRole("listitem").map((item) => within(item).getByRole("heading").textContent)).toEqual([
    "부산아시아드주경기장", "감천문화마을",
  ]);
  screen.getByRole("button", { name: "선택한 코스로 원정 시작" }).click();
  expect(onStart).toHaveBeenCalledWith([]);
});

it("persists the selected route across refresh and completes after only its required anchors", async () => {
  const user = userEvent.setup();
  const active: PersistedExpedition = {
    ...recommendation,
    id: "persisted-browser-route",
    recommendationId: recommendation.id,
    status: "active",
    createdAt: "2026-09-21T00:00:00Z",
    stops: recommendation.stops.map((item) => ({ ...item, selectedByDefault: true })),
  };
  const restored: PersistedExpedition = {
    ...active,
    stops: active.stops.map((item) => ({
      ...item,
      completedAt: item.required ? "2026-09-21T01:00:00Z" : undefined,
    })),
  };
  const getRecommendedExpedition = vi.fn().mockResolvedValue(recommendation);
  const start = vi.fn().mockResolvedValue(active);
  const current = vi.fn().mockResolvedValue(restored);
  const complete = vi.fn().mockResolvedValue({ ...restored, status: "completed" });
  const services = {
    tourism: { getRecommendedExpedition },
    expeditions: { start, current, complete },
  } as unknown as AppServices;
  const session = {
    ...createInitialDemoSession(),
    artistConfirmed: true as const,
    selectedArtistId: "bts" as const,
    selectedTerritoryId: "busan" as const,
  };
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
  const onLiveExpedition = vi.fn();
  const startedView = render(
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
  const routePicker = (await screen.findByRole("heading", { name: "원정 코스 선택" })).closest("section");
  expect(routePicker).not.toBeNull();
  expect(within(routePicker!).getAllByRole("listitem").map((item) => within(item).getByRole("heading").textContent)).toEqual([
    "부산아시아드주경기장", "부산시민공원", "감천문화마을",
  ]);
  await user.click(screen.getByRole("button", { name: "부산시민공원 코스에 추가" }));
  await user.click(screen.getByRole("button", { name: "선택한 코스로 원정 시작" }));

  await waitFor(() => expect(start).toHaveBeenCalledWith(
    recommendation.id,
    expect.objectContaining({ routeKey: "bts-busan" }),
    ["optional-1"],
    recommendation.routeVersion,
  ));
  expect(onLiveExpedition).toHaveBeenCalledWith(active);

  // A browser refresh asks the API for the current expedition. The returned
  // snapshot, rather than the old recommendation, is the source of truth.
  startedView.unmount();
  const refreshed = await services.expeditions.current();
  expect(current).toHaveBeenCalledOnce();
  render(
    <DemoSessionProvider storage={window.localStorage}>
      <PreviewExpeditionView
        expeditionId="bts-busan-artist-linked-expedition"
        checkInService={services.checkIn}
        liveExpedition={refreshed}
        onBack={() => undefined}
        onEndExpedition={async (shouldComplete) => {
          if (shouldComplete && refreshed) await services.expeditions.complete(refreshed.id);
        }}
      />
    </DemoSessionProvider>,
  );

  const restoredRoute = (await screen.findByRole("heading", { name: "원정 코스" })).closest("section");
  expect(restoredRoute).not.toBeNull();
  const restoredStops = within(restoredRoute!).getAllByRole("listitem");
  expect(restoredStops.map((item) => within(item).getByRole("heading").textContent)).toEqual([
    "부산아시아드주경기장", "부산시민공원", "감천문화마을",
  ]);
  expect(within(restoredStops[1]).getByText("선택")).toBeVisible();
  expect(within(restoredStops[1]).getByRole("button", { name: "부산시민공원 체크인" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "원정 완료" }));
  await user.click(within(screen.getByRole("dialog", { name: "원정을 완료할까요?" }))
    .getByRole("button", { name: "원정 완료" }));
  expect(complete).toHaveBeenCalledWith(restored.id);
});

it("offers completion when required anchors are done even if a selected recommendation is not", async () => {
  const user = userEvent.setup();
  const onEnd = vi.fn();
  const state = {
    ...createInitialDemoSession(), artistConfirmed: true as const, selectedArtistId: "bts" as const,
    selectedTerritoryId: "busan" as const, selectedExpeditionId: "bts-busan-artist-linked-expedition",
    activeExpeditionId: "bts-busan-artist-linked-expedition", activeTab: "expedition" as const,
  };
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(state));
  const live: PersistedExpedition = {
    ...recommendation, id: "persisted-1", recommendationId: recommendation.id, status: "active",
    createdAt: "2026-09-21T00:00:00Z", stops: recommendation.stops.map((item) => ({
      ...item, completedAt: item.required ? "2026-09-21T01:00:00Z" : undefined,
    })),
  };
  render(<DemoSessionProvider storage={window.localStorage}><PreviewExpeditionView expeditionId="bts-busan-artist-linked-expedition" checkInService={services.checkIn} liveExpedition={live} onBack={() => undefined} onEndExpedition={onEnd} /></DemoSessionProvider>);

  await user.click(await screen.findByRole("button", { name: "원정 완료" }));
  await user.click(within(screen.getByRole("dialog", { name: "원정을 완료할까요?" })).getByRole("button", { name: "원정 완료" }));
  expect(onEnd).toHaveBeenCalledWith(true);
});
