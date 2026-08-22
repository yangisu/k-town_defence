import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { KTownApp } from "@/features/ktown-app";
import { previewContent } from "@/features/team-preview/content";
import { DEMO_SESSION_KEY, createInitialDemoSession } from "@/features/team-preview/demo-session";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = "ko";
});

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
  const recommendation = screen.getByRole("complementary", { name: "수원 전술 패널" });
  expect(within(recommendation).getByRole("heading", { name: "수원" })).toBeVisible();
  expect(within(recommendation).getByRole("button", { name: /원정 시작/ })).toBeEnabled();
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

it("keeps the current objective, reset, and locale controls in one non-overlapping shell header", async () => {
  render(<KTownApp mode="demo" mapConfig={null} />);

  const header = await screen.findByRole("banner");
  const objective = screen.getByRole("region", { name: "현재 목표" });
  const locale = screen.getByRole("group", { name: "언어 선택" });

  expect(header).toContainElement(objective);
  expect(header).toContainElement(locale);
  expect(objective).toHaveAttribute("data-shell-region", "objective");
  expect(locale).toHaveAttribute("data-shell-region", "locale");
  expect(within(objective).getByRole("button", { name: "데모 초기화" })).toBeVisible();
});

it("switches artists without carrying the previous artist's expedition route", async () => {
  const user = userEvent.setup();
  render(<KTownApp mode="demo" mapConfig={null} />);

  await user.click(await screen.findByRole("button", { name: "아티스트 선택" }));
  await user.click(screen.getByRole("radio", { name: /BTS.*ARMY/ }));
  await user.click(screen.getByRole("button", { name: "원정 시작" }));
  expect(await screen.findByRole("heading", { name: "BTS 부산 바다 원정" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "영토 지도로" }));

  await user.click(screen.getByRole("button", { name: "아티스트 변경" }));
  await user.click(screen.getByRole("radio", { name: /aespa.*MY/i }));
  expect(await screen.findByRole("complementary", { name: "수원 전술 패널" })).toBeVisible();

  await user.click(screen.getAllByRole("button", { name: "원정" })[0]);
  expect(await screen.findByRole("heading", { name: "aespa 수원 성곽 원정" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "BTS 부산 바다 원정" })).not.toBeInTheDocument();
});

it("synchronizes the root document language for persisted and runtime locale changes", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({
    ...createInitialDemoSession(),
    locale: "en",
  }));
  const view = render(<KTownApp mode="demo" mapConfig={null} />);

  expect(await screen.findByRole("button", { name: "EN", pressed: true })).toBeVisible();
  expect(document.documentElement).toHaveAttribute("lang", "en");
  await user.click(screen.getByRole("button", { name: "한국어" }));
  expect(document.documentElement).toHaveAttribute("lang", "ko");

  view.unmount();
});
