import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import Page from "@/app/page";

async function selectDemoMembership(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("radio", { name: /BTS.*ARMY/ }));
  await user.click(screen.getByRole("button", { name: "이 팬덤으로 시작" }));
}

describe("fan tourism journey", () => {
  beforeEach(() => window.localStorage.clear());

  it("moves from regional discovery through an approved check-in", async () => {
    const user = userEvent.setup();
    render(<Page />);
    await selectDemoMembership(user);

    expect(await screen.findByRole("heading", { name: "영토 지도" })).toBeVisible();
    await user.click(within(screen.getByRole("list", { name: "지도와 같은 영토 목록" })).getByRole("button", { name: /^부산/ }));
    const tacticalPanel = screen.getByRole("complementary", { name: "부산 전술 패널" });
    expect(tacticalPanel).toBeVisible();
    expect(screen.getByText("추천 근거 보기")).toBeVisible();
    expect(screen.getByRole("link", { name: "출처 확인" })).toBeInTheDocument();

    await user.click(within(tacticalPanel).getByRole("button", { name: "원정 시작" }));
    expect(await screen.findByRole("heading", { name: "BTS 부산 공식 공연장 원정" })).toBeVisible();
    expect(screen.getByText("부산아시아드주경기장")).toBeVisible();
    expect(screen.getByText("감천문화마을")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "부산아시아드주경기장 체크인" }));
    expect(await screen.findByRole("heading", { name: "현장 체크인" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "데모 인증 진행" }));
    await user.click(screen.getByRole("checkbox", { name: "로컬 소비 인증 포함" }));
    await user.click(screen.getByRole("button", { name: "포인트 검토" }));
    await user.click(screen.getByRole("button", { name: "체크인 제출" }));
    expect(await screen.findByRole("heading", { name: "체크인 승인 완료" })).toBeVisible();
    expect(screen.getByText("유효 포인트 +270P")).toBeVisible();
    expect(screen.getByText(/지역 점유율/)).toBeVisible();
  }, 10_000);

  it("navigates to battle and travel record views", async () => {
    const user = userEvent.setup();
    render(<Page />);
    await selectDemoMembership(user);

    await user.click((await screen.findAllByRole("button", { name: "랭킹" }))[0]);
    expect(await screen.findByRole("heading", { name: "랭킹" })).toBeVisible();
    expect(screen.getByRole("list", { name: "팬덤 랭킹" })).toBeVisible();
    await user.click(screen.getAllByRole("button", { name: "내 기록" })[0]);
    expect(await screen.findByRole("heading", { name: "내 기록" })).toBeVisible();
    expect(screen.getByText("완료한 원정").parentElement).toHaveTextContent("완료한 원정0");
    expect(screen.getByRole("heading", { name: "아직 원정 기록이 없어요" })).toBeVisible();
    expect(screen.queryByRole("list", { name: "활동 타임라인" })).not.toBeInTheDocument();
  });
});
