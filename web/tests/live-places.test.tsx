import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { LivePlacesPanel } from "@/components/explore/live-places-panel";
import type { Place, TourismService } from "@/lib/domain";

const place: Place = {
  id: "live-1",
  regionId: "busan",
  nameKo: "감천문화마을",
  category: "culture",
  categoryLabel: "관광 명소",
  description: "한국관광공사 공식 설명",
  address: "부산광역시 사하구",
  transit: "지도에서 위치를 확인하세요",
  dwellMinutes: 5,
  points: 0,
  imageUrl: "https://images.example/gamcheon.jpg",
};

function service(result: Place[] | Error): TourismService {
  const expedition = {
    id: "live-expedition", title: "부산 로컬 원정", regionCode: "6", travelDate: "2026-08-22",
    stops: result instanceof Error ? [] : result.map((item, index) => ({ order: index + 1, distanceKm: index, reasons: ["지역 원정 시작점"], place: item })),
  };
  return {
    listRegions: vi.fn().mockResolvedValue([]),
    getRegion: vi.fn(),
    listPlaces: result instanceof Error
      ? vi.fn().mockRejectedValue(result)
      : vi.fn().mockResolvedValue(result),
    getRecommendedExpedition: result instanceof Error ? vi.fn().mockRejectedValue(result) : vi.fn().mockResolvedValue(expedition),
    getOpenDataStatus: vi.fn().mockResolvedValue({ label: "관광 OpenAPI", activePlaceCount: 1, operations: [] }),
  };
}

it("renders a real Busan place and starts its exact check-in", async () => {
  const user = userEvent.setup();
  const onStartCheckIn = vi.fn();
  render(<LivePlacesPanel service={service([place])} onStartCheckIn={onStartCheckIn} />);

  expect(await screen.findByText("감천문화마을")).toBeVisible();
  expect(screen.getByText("공공 관광데이터 공식 설명")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "감천문화마을 체크인" }));
  expect(onStartCheckIn).toHaveBeenCalledWith(place);
});

it("shows a recoverable error state", async () => {
  render(<LivePlacesPanel service={service(new Error("network"))} onStartCheckIn={() => undefined} />);

  expect(await screen.findByText("지역 원정을 만들지 못했어요")).toBeVisible();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeVisible();
});
