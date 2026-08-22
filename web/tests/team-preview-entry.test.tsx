import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { KTownApp } from "@/features/ktown-app";
import { previewContent } from "@/features/team-preview/content";

beforeEach(() => window.localStorage.clear());

it("opens in the product shell and guides artist selection beside the service", async () => {
  const user = userEvent.setup();
  render(<KTownApp mode="demo" mapConfig={null} />);

  expect(await screen.findByRole("navigation", { name: "주요 메뉴" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "영토 지도" })).toBeVisible();
  expect(screen.getByText("게스트 데모")).toBeVisible();
  expect(screen.getByText("1. 아티스트 선택")).toBeVisible();
  expect(screen.getByText("지도를 연결하려면 Amazon Location 설정이 필요해요")).toBeVisible();
  expect(within(screen.getByRole("list", { name: "지도와 같은 영토 목록" })).getAllByRole("button"))
    .toHaveLength(previewContent.territories.length);
  expect(document.querySelector(".map-grid")).not.toBeInTheDocument();
  expect(screen.queryByText(/KOREA\s*EXPEDITION/)).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /함께 여행할 팬덤/ })).not.toBeInTheDocument();
  expect(screen.queryByText("ARMY · #1")).not.toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "현재 목표" })).queryByText("ARMY · 부산")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "아티스트 선택" }));
  expect(screen.getByRole("dialog", { name: "아티스트 선택" })).toBeVisible();
  expect(screen.getAllByRole("radio")).toHaveLength(15);
  expect(screen.getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
  await user.click(screen.getByRole("radio", { name: /BTS.*ARMY/ }));
  expect(screen.getByText("ARMY · #1")).toBeVisible();
  expect(within(screen.getByRole("region", { name: "현재 목표" })).getByText("ARMY · 부산")).toBeVisible();
});

it("searches localized artists and recommends their first home territory", async () => {
  const user = userEvent.setup();
  render(<KTownApp mode="demo" mapConfig={null} />);

  await user.click(await screen.findByRole("button", { name: "아티스트 선택" }));
  const search = screen.getByRole("searchbox", { name: "아티스트 또는 팬덤 검색" });
  await user.type(search, "에스파");
  expect(screen.getAllByRole("radio")).toHaveLength(1);
  await user.clear(search);
  await user.type(search, "UAENA");
  expect(screen.getAllByRole("radio")).toHaveLength(1);
  await user.clear(search);
  await user.type(search, "aespa");
  expect(screen.getAllByRole("radio")).toHaveLength(1);
  await user.click(screen.getByRole("radio", { name: /aespa.*MY/i }));

  expect(screen.queryByRole("dialog", { name: "아티스트 선택" })).not.toBeInTheDocument();
  const recommendation = screen.getByRole("complementary", { name: "추천 영토" });
  expect(within(recommendation).getByText("2. 추천 영토 확인")).toBeVisible();
  expect(within(recommendation).getByText("부산")).toBeVisible();
  expect(within(screen.getByRole("region", { name: "현재 목표" })).getByText(/MY/)).toBeVisible();
});

it("keeps demo labels and locale controls when no fandom is selected", () => {
  render(
    <AppShell
      variant="demo"
      activeTab="explore"
      locale="ko"
      fandomName={null}
      rank={null}
      onLocaleChange={vi.fn()}
      onTabChange={vi.fn()}
    >
      <div>service</div>
    </AppShell>,
  );

  expect(screen.getAllByRole("button", { name: "영토 지도" })).toHaveLength(2);
  expect(screen.getByText("게스트 데모")).toBeVisible();
  expect(screen.getByRole("button", { name: "한국어" })).toBeVisible();
  expect(screen.getByRole("button", { name: "EN" })).toBeVisible();
  expect(screen.queryByText(/ARMY/)).not.toBeInTheDocument();
});
