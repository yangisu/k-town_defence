import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { LiveExpeditionPanel } from "@/components/expedition/live-expedition-panel";
import type { LiveExpedition, OpenDataStatus, Place, TourismService } from "@/lib/domain";


const places: Place[] = [
  {
    id: "place-1", regionId: "busan", nameKo: "감천문화마을", category: "culture",
    categoryLabel: "관광 명소", description: "한국관광공사 공식 설명", address: "부산광역시 사하구",
    transit: "", dwellMinutes: 5, points: 0, imageUrls: ["https://images.example/1.jpg"],
    openTime: "09:00~18:00", syncedAt: "2026-08-22T03:00:00Z",
  },
  {
    id: "place-2", regionId: "busan", nameKo: "부산 로컬 식당", category: "local_food",
    categoryLabel: "먹거리", description: "지역 식재료를 만나는 곳", address: "부산광역시 중구",
    transit: "", dwellMinutes: 5, points: 0,
  },
  {
    id: "place-3", regionId: "busan", nameKo: "부산 여름 축제", category: "event",
    categoryLabel: "행사", description: "여행일에 열리는 지역 행사", address: "부산광역시 영도구",
    transit: "", dwellMinutes: 5, points: 0,
  },
];

const expedition: LiveExpedition = {
  id: "expedition-1", title: "부산 로컬 원정", regionCode: "6", keyword: "BTS",
  travelDate: "2026-08-22", dataUpdatedAt: "2026-08-22T03:00:00Z",
  stops: [
    { order: 1, distanceKm: 0, reasons: ["키워드 일치"], place: places[0] },
    { order: 2, distanceKm: 0.8, reasons: ["다른 유형의 지역 명소", "아직 방문 기록이 적은 장소"], place: places[1] },
    { order: 3, distanceKm: 1.2, reasons: ["여행일에 열리는 행사"], place: places[2] },
  ],
};

const status: OpenDataStatus = {
  label: "관광 OpenAPI", lastSuccessfulSyncAt: "2026-08-22T03:00:00Z",
  activePlaceCount: 100,
  operations: [
    { operation: "areaBasedList2", lastSucceededAt: "2026-08-22T03:00:00Z", responseCount: 100 },
    { operation: "detailCommon2", lastSucceededAt: "2026-08-22T03:00:00Z", responseCount: 100 },
  ],
};

function service(result: LiveExpedition | Error = expedition): TourismService {
  return {
    listRegions: vi.fn().mockResolvedValue([]), getRegion: vi.fn(), listPlaces: vi.fn().mockResolvedValue([]),
    getRecommendedExpedition: result instanceof Error ? vi.fn().mockRejectedValue(result) : vi.fn().mockResolvedValue(result),
    getOpenDataStatus: vi.fn().mockResolvedValue(status),
  };
}

it("shows an explainable live expedition and starts the exact stop check-in", async () => {
  const user = userEvent.setup();
  const onStartCheckIn = vi.fn();
  const tourism = service();
  render(
    <LiveExpeditionPanel
      service={tourism}
      onStartCheckIn={onStartCheckIn}
      now={() => new Date("2026-08-21T18:00:00Z")}
    />,
  );

  expect(await screen.findByText("키워드 일치")).toBeVisible();
  expect(screen.getByText("여행일에 열리는 행사")).toBeVisible();
  expect(screen.getByText("관광 OpenAPI · 2개 기능 연동")).toBeVisible();
  expect(screen.getByText("활성 관광지 100곳")).toBeVisible();
  expect(screen.getByText("areaBasedList2 · 100건")).toBeVisible();
  expect(screen.getByText("detailCommon2 · 100건")).toBeVisible();
  expect(screen.getByText("09:00~18:00")).toBeVisible();
  expect(tourism.getRecommendedExpedition).toHaveBeenCalledWith(
    expect.objectContaining({ travelDate: "2026-08-22" }),
  );
  await user.click(screen.getByRole("button", { name: "감천문화마을 체크인" }));
  expect(onStartCheckIn).toHaveBeenCalledWith(places[0]);
});

it("removes prohibited provider branding from upstream copy", async () => {
  const { container } = render(
    <LiveExpeditionPanel service={service()} onStartCheckIn={() => undefined} />,
  );

  await screen.findByText("키워드 일치");
  expect(container.textContent).not.toContain("한국관광공사");
  expect(container.textContent).not.toMatch(/\bKTO\b/);
  expect(screen.getByText("공공 관광데이터 공식 설명")).toBeVisible();
});

it("rebuilds the expedition when the submitted keyword is unchanged", async () => {
  const user = userEvent.setup();
  const tourism = service();
  render(<LiveExpeditionPanel service={tourism} onStartCheckIn={() => undefined} />);

  await screen.findByRole("heading", { name: "부산 로컬 원정" });
  await user.click(screen.getByRole("button", { name: "원정 다시 만들기" }));

  expect(tourism.getRecommendedExpedition).toHaveBeenCalledTimes(2);
});

it("shows a recoverable expedition error", async () => {
  render(<LiveExpeditionPanel service={service(new Error("network"))} onStartCheckIn={() => undefined} />);

  expect(await screen.findByText("지역 원정을 만들지 못했어요")).toBeVisible();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeVisible();
});
