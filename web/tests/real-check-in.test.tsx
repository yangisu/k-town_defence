import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { CheckInFlow } from "@/components/check-in/check-in-flow";
import type { CheckInService, Place } from "@/lib/domain";

const place: Place = { id: "place-1", regionId: "busan", nameKo: "감천문화마을", category: "culture", categoryLabel: "관광 명소", description: "공식 설명", address: "부산", transit: "지도", dwellMinutes: 5, points: 0 };

const geolocation = {
  getCurrentPosition(success: PositionCallback) {
    success({ coords: { latitude: 35.1, longitude: 129, accuracy: 20 } as GeolocationCoordinates, timestamp: Date.now() });
  },
  watchPosition: () => 0,
  clearWatch: () => undefined,
} as Geolocation;

it("uploads actual GPS samples and a selected photo before pending submission", async () => {
  const user = userEvent.setup();
  const service: CheckInService = {
    create: vi.fn().mockResolvedValue({ id: "session-1", placeId: place.id, status: "collecting", expiresAt: "2026-08-21T10:30:00Z" }),
    restore: vi.fn().mockResolvedValue(null), recordGps: vi.fn().mockResolvedValue(undefined),
    recordPhoto: vi.fn().mockResolvedValue(undefined), submit: vi.fn().mockResolvedValue({ decision: "pending", message: "검토 대기" }),
  };
  render(<CheckInFlow place={place} service={service} mode="integrated" geolocation={geolocation} onClose={() => undefined} />);
  const locationButton = screen.getByRole("button", { name: "실제 위치 확인" });
  await waitFor(() => expect(locationButton).toBeEnabled());
  await user.click(locationButton);
  expect(service.recordGps).toHaveBeenCalledTimes(3);

  const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "camera.jpg", { type: "image/jpeg" });
  await user.upload(await screen.findByLabelText("현장 사진 선택"), file);
  await user.click(await screen.findByRole("button", { name: "체크인 제출" }));

  expect(service.recordPhoto).toHaveBeenCalledWith("session-1", expect.objectContaining({ file }));
  expect(await screen.findByText("CHECK-IN PENDING")).toBeVisible();
  expect(screen.queryByText(/\+\d+P/)).not.toBeInTheDocument();
});
