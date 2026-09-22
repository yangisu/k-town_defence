import { render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MembershipGate } from "@/components/membership/membership-gate";
import { MembershipProvider } from "@/features/membership/membership-context";
import { ApiError } from "@/lib/api/api-error";
import type { MembershipService } from "@/lib/domain";


it("lets a member without a fandom through to the product's own picker", async () => {
  const service: MembershipService = {
    listFandoms: vi.fn().mockResolvedValue([
      { id: "fandom-1", name: "ARMY", artistName: "방탄소년단" },
    ]),
    getCurrent: vi.fn().mockResolvedValue(null),
    createFandom: vi.fn(),
    leaveSeason: vi.fn(),
    selectFandom: vi.fn().mockResolvedValue({
      userId: "user-1",
      seasonId: "season-1",
      fandomId: "fandom-1",
      lockedAt: "2026-08-22T00:00:00Z",
    }),
  };

  const replace = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, pathname: "/", search: "", replace },
  });

  render(
    <MembershipProvider service={service}>
      <MembershipGate><div>실시간 부산 관광지</div></MembershipGate>
    </MembershipProvider>,
  );

  // Choosing happens on the first-run picker behind the gate, the same one
  // the demo opens with, so the gate only waits for the answer.
  expect(await screen.findByText("실시간 부산 관광지")).toBeVisible();
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  expect(service.selectFandom).not.toHaveBeenCalled();
});

it("sends unauthenticated visitors to the sign-in page", async () => {
  const service: MembershipService = {
    listFandoms: vi.fn().mockRejectedValue(new ApiError(401, "AUTHENTICATION_REQUIRED")),
    getCurrent: vi.fn().mockRejectedValue(new ApiError(401, "AUTHENTICATION_REQUIRED")),
    createFandom: vi.fn(),
    leaveSeason: vi.fn(),
    selectFandom: vi.fn(),
  };

  const replace = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { pathname: "/", search: "", replace },
  });

  render(
    <MembershipProvider service={service}>
      <MembershipGate><div>실시간 부산 관광지</div></MembershipGate>
    </MembershipProvider>,
  );

  // A visitor who is not signed in belongs on the sign-in screen, not on a
  // page whose only control is a link to it.
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/signin?return_to=%2F"));
  expect(screen.queryByRole("link", { name: "로그인하기" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
});
