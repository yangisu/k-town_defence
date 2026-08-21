import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { MembershipGate } from "@/components/membership/membership-gate";
import { MembershipProvider } from "@/features/membership/membership-context";
import type { MembershipService } from "@/lib/domain";


it("requires a fandom selection before revealing the live application", async () => {
  const user = userEvent.setup();
  const service: MembershipService = {
    listFandoms: vi.fn().mockResolvedValue([
      { id: "fandom-1", name: "ARMY", artistName: "방탄소년단" },
    ]),
    getCurrent: vi.fn().mockResolvedValue(null),
    selectFandom: vi.fn().mockResolvedValue({
      userId: "user-1",
      seasonId: "season-1",
      fandomId: "fandom-1",
      lockedAt: "2026-08-22T00:00:00Z",
    }),
  };

  render(
    <MembershipProvider service={service}>
      <MembershipGate><div>실시간 부산 관광지</div></MembershipGate>
    </MembershipProvider>,
  );

  expect(await screen.findByRole("radio", { name: /ARMY/ })).toBeVisible();
  expect(screen.queryByText("실시간 부산 관광지")).not.toBeInTheDocument();
  await user.click(screen.getByRole("radio", { name: /ARMY/ }));
  await user.click(screen.getByRole("button", { name: "이 팬덤으로 시즌 시작" }));
  expect(await screen.findByText("실시간 부산 관광지")).toBeVisible();
  expect(service.selectFandom).toHaveBeenCalledWith("fandom-1");
});
