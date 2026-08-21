import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { CheckInFlow } from "@/components/check-in/check-in-flow";
import type { CheckInService, Place } from "@/lib/domain";

const place: Place = {
  id: "place-1",
  regionId: "busan",
  nameKo: "감천문화마을",
  category: "culture",
  categoryLabel: "관광 명소",
  description: "부산의 산복도로 문화마을",
  address: "부산광역시 사하구",
  transit: "버스",
  dwellMinutes: 5,
  points: 0,
};

it("shows a pending review without invented approval or points", async () => {
  const user = userEvent.setup();
  const service: CheckInService = {
    create: vi.fn().mockResolvedValue({ id: "session-1", placeId: place.id, status: "collecting", expiresAt: "2026-08-21T10:30:00Z" }),
    restore: vi.fn().mockResolvedValue(null),
    recordGps: vi.fn().mockResolvedValue(undefined),
    recordPhoto: vi.fn().mockResolvedValue(undefined),
    submit: vi.fn().mockResolvedValue({ decision: "pending", message: "체크인 제출이 접수되었습니다. 검토를 기다려 주세요." }),
  };

  render(<CheckInFlow place={place} service={service} mode="integrated" onClose={() => undefined} />);
  const advance = screen.getByRole("button", { name: "인증 과정 진행" });
  await waitFor(() => expect(advance).toBeEnabled());
  await user.click(advance);
  await user.click(await screen.findByRole("button", { name: "체크인 제출" }));

  expect(await screen.findByText(/검토를 기다려 주세요/)).toBeVisible();
  expect(screen.getByText("CHECK-IN PENDING")).toBeVisible();
  expect(screen.queryByText(/\+\d+P/)).not.toBeInTheDocument();
  expect(screen.queryByText(/방문이 승인/)).not.toBeInTheDocument();
});
