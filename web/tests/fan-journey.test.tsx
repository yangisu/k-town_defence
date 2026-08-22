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
    expect(await screen.findByRole("heading", { name: "바다를 따라 부산 방어전" })).toBeVisible();
    expect(screen.getByText("2 / 5 완료")).toBeVisible();
    expect(screen.getByText("영도 흰여울길")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /영도 흰여울길 체크인/ }));
    expect(await screen.findByRole("heading", { name: "현장 체크인" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "인증 과정 진행" }));
    await user.click(screen.getByRole("button", { name: "체크인 제출" }));
    expect(await screen.findByText("부산 여행에 120P를 보탰어요")).toBeVisible();
    expect(screen.getByLabelText("부산 탈환까지 300P")).toBeVisible();
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
