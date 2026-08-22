import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import Page from "@/app/page";

async function selectDemoMembership(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "아티스트 선택" }));
  await user.click(screen.getByRole("radio", { name: /BTS.*ARMY/ }));
}

describe("fan tourism journey", () => {
  beforeEach(() => window.localStorage.clear());

  it("moves from regional discovery through an approved check-in", async () => {
    const user = userEvent.setup();
    render(<Page />);
    await selectDemoMembership(user);

    expect(await screen.findByRole("heading", { name: "영토 지도" })).toBeVisible();
    expect(screen.getByRole("complementary", { name: "부산 전술 패널" })).toBeVisible();
    expect(screen.getByRole("link", { name: "연결 근거 출처" })).toBeVisible();

    await user.click(screen.getAllByRole("button", { name: "원정" })[0]);
    expect(await screen.findByRole("heading", { name: "BTS 부산 바다 원정" })).toBeVisible();
    expect(screen.getByText("감천문화마을")).toBeVisible();
    expect(screen.getByText("자갈치시장")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "감천문화마을 체크인" }));
    expect(await screen.findByRole("heading", { name: "현장 체크인" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "데모 인증 진행" }));
    await user.click(screen.getByRole("checkbox", { name: "로컬 소비 인증 포함" }));
    await user.click(screen.getByRole("button", { name: "포인트 검토" }));
    await user.click(screen.getByRole("button", { name: "체크인 제출" }));
    expect(await screen.findByRole("heading", { name: "체크인 승인 완료" })).toBeVisible();
    expect(screen.getByText("유효 포인트 +260P")).toBeVisible();
    expect(screen.getByText(/지역 점유율/)).toBeVisible();
  });

  it("navigates to battle and travel record views", async () => {
    const user = userEvent.setup();
    render(<Page />);
    await selectDemoMembership(user);

    await user.click((await screen.findAllByRole("button", { name: "랭킹" }))[0]);
    expect(await screen.findByRole("heading", { name: "시즌 01 지역 전선" })).toBeVisible();
    await user.click(screen.getAllByRole("button", { name: "내 기록" })[0]);
    expect(await screen.findByLabelText("방문 지역 4곳")).toBeVisible();
    expect(screen.getByLabelText("검토 중 1건")).toBeVisible();
  });
});
