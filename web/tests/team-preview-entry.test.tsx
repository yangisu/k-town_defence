import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { KTownApp } from "@/features/ktown-app";
import { getArtistHomeTerritories, previewContent } from "@/features/team-preview/content";
import { DEMO_SESSION_KEY, createInitialDemoSession } from "@/features/team-preview/demo-session";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = "ko";
});

it("requires profile confirmation before rendering the territory workspace", async () => {
  render(<KTownApp mode="demo" mapConfig={null} />);

  expect(await screen.findByRole("heading", { name: "응원할 아티스트를 선택하세요" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "영토 지도" })).not.toBeInTheDocument();
  expect(screen.queryByText("게스트 데모")).not.toBeInTheDocument();
  expect(within(screen.getByRole("navigation", { name: "주요 메뉴" })).getAllByRole("button")
    .every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
});

it("confirms a fandom profile before exposing the personalized workspace", async () => {
  const user = userEvent.setup();
  render(<KTownApp mode="demo" mapConfig={null} />);

  await user.click(await screen.findByRole("radio", { name: /방탄소년단.*ARMY/ }));
  expect(screen.getByRole("heading", { name: "응원할 아티스트를 선택하세요" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "이 팬덤으로 시작" }));

  expect(await screen.findByRole("button", { name: "내 팬덤 · ARMY" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "영토 지도" })).toBeVisible();
  expect(screen.queryByText("게스트 데모")).not.toBeInTheDocument();
});

it("opens in the product shell and enters the service after explicit profile confirmation", async () => {
  const user = userEvent.setup();
  render(<KTownApp mode="demo" mapConfig={null} />);

  expect(await screen.findByRole("navigation", { name: "주요 메뉴" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "응원할 아티스트를 선택하세요" })).toBeVisible();
  expect(screen.getAllByRole("radio")).toHaveLength(15);
  expect(screen.getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
  expect(document.querySelector(".map-grid")).not.toBeInTheDocument();
  expect(screen.queryByText(/KOREA\s*EXPEDITION/)).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /함께 여행할 팬덤/ })).not.toBeInTheDocument();
  expect(screen.queryByText("ARMY · #1")).not.toBeInTheDocument();

  await user.click(screen.getByRole("radio", { name: /BTS.*ARMY/ }));
  expect(screen.getByRole("heading", { name: "응원할 아티스트를 선택하세요" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "이 팬덤으로 시작" }));

  expect(screen.getByRole("heading", { name: "영토 지도" })).toBeVisible();
  expect(screen.getByText("지도를 연결하려면 Amazon Location 설정이 필요해요")).toBeVisible();
  expect(within(screen.getByRole("list", { name: "지도와 같은 영토 목록" })).getAllByRole("button"))
    .toHaveLength(previewContent.territories.length);
  expect(screen.getByRole("button", { name: "내 팬덤 · ARMY" })).toBeVisible();
  expect(within(screen.getByRole("region", { name: "현재 목표" })).getByText("ARMY · 부산")).toBeVisible();
});

it("searches localized artists and recommends their first home territory", async () => {
  const user = userEvent.setup();
  render(<KTownApp mode="demo" mapConfig={null} />);

  const search = await screen.findByRole("searchbox", { name: "아티스트 또는 팬덤 검색" });
  await user.type(search, "에스파");
  expect(screen.getAllByRole("radio")).toHaveLength(1);
  await user.clear(search);
  await user.type(search, "UAENA");
  expect(screen.getAllByRole("radio")).toHaveLength(1);
  await user.clear(search);
  await user.type(search, "aespa");
  expect(screen.getAllByRole("radio")).toHaveLength(1);
  await user.click(screen.getByRole("radio", { name: /aespa.*MY/i }));
  expect(screen.getByRole("heading", { name: "응원할 아티스트를 선택하세요" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "이 팬덤으로 시작" }));

  const recommendation = screen.getByRole("complementary", { name: "수원 전술 패널" });
  expect(within(recommendation).getByRole("heading", { name: "수원" })).toBeVisible();
  expect(within(recommendation).getByRole("button", { name: /원정 시작/ })).toBeEnabled();
  expect(within(screen.getByRole("region", { name: "현재 목표" })).getByText(/MY/)).toBeVisible();
});

it.each([
  {
    locale: "ko",
    localeButton: "한국어",
    searchLabel: "아티스트 또는 팬덤 검색",
    query: "에스파",
    setupTitle: "응원할 아티스트를 선택하세요",
    confirmLabel: "이 팬덤으로 시작",
    territories: "대표 영토: 수원, 부산",
  },
  {
    locale: "en",
    localeButton: "EN",
    searchLabel: "Search artist or fandom",
    query: "MY",
    setupTitle: "Choose an artist to support",
    confirmLabel: "Start with this fandom",
    territories: "Home territories: Suwon, Busan",
  },
])("exposes searchable $locale artist metadata before explicit confirmation", async ({
  localeButton,
  searchLabel,
  query,
  setupTitle,
  confirmLabel,
  territories,
}) => {
  const user = userEvent.setup();
  render(<KTownApp mode="demo" mapConfig={null} />);

  await user.click(await screen.findByRole("button", { name: localeButton }));
  const allArtists = screen.getAllByRole("radio");
  expect(allArtists).toHaveLength(previewContent.artists.length);
  for (const [index, artist] of previewContent.artists.entries()) {
    const card = allArtists[index].closest("label");
    const territoryNames = getArtistHomeTerritories(artist.id)
      .map((territory) => territory.name[localeButton === "EN" ? "en" : "ko"])
      .join(", ");
    expect(card).toHaveStyle({ "--artist-color": artist.color });
    expect(within(card!).getByText(`${localeButton === "EN" ? "Home territories" : "대표 영토"}: ${territoryNames}`))
      .toBeVisible();
  }
  const search = await screen.findByRole("searchbox", { name: searchLabel });
  await user.type(search, query);
  const artist = screen.getByRole("radio", { name: /aespa.*MY/i });
  const card = artist.closest("label");

  expect(card).toHaveStyle({ "--artist-color": "#4c66d6" });
  expect(within(card!).getByText(territories)).toBeVisible();
  await user.click(artist);
  expect(screen.getByRole("heading", { name: setupTitle })).toBeVisible();
  await user.click(screen.getByRole("button", { name: confirmLabel }));
  expect(screen.queryByRole("heading", { name: setupTitle })).not.toBeInTheDocument();
});

it("hydrates a confirmed returning profile directly into its personalized workspace", async () => {
  const saved = {
    ...createInitialDemoSession(),
    artistConfirmed: true,
    selectedArtistId: "bts" as const,
    selectedTerritoryId: "busan",
  };
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(saved));

  render(<KTownApp mode="demo" mapConfig={null} />);

  expect(screen.queryByRole("heading", { name: "응원할 아티스트를 선택하세요" })).not.toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "내 팬덤 · ARMY" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "영토 지도" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "응원할 아티스트를 선택하세요" })).not.toBeInTheDocument();
});

it("does not allow reconfirming the current fandom as a profile change", async () => {
  const user = userEvent.setup();
  render(<KTownApp mode="demo" mapConfig={null} />);

  await user.click(await screen.findByRole("radio", { name: /BTS.*ARMY/ }));
  await user.click(screen.getByRole("button", { name: "이 팬덤으로 시작" }));
  await user.click(screen.getByRole("button", { name: "내 팬덤 · ARMY" }));

  expect(screen.getByRole("button", { name: "이 팬덤으로 변경" })).toBeDisabled();
});

it("does not confirm a selected fandom after search hides its card", async () => {
  const user = userEvent.setup();
  render(<KTownApp mode="demo" mapConfig={null} />);

  await user.click(await screen.findByRole("radio", { name: /aespa.*MY/i }));
  await user.type(screen.getByRole("searchbox", { name: "아티스트 또는 팬덤 검색" }), "BTS");

  expect(screen.getByRole("button", { name: "이 팬덤으로 시작" })).toBeDisabled();
});

it("keeps locale controls and omits ambiguous identity when no fandom is selected", () => {
  render(
    <AppShell
      variant="demo"
      activeTab="explore"
      locale="ko"
      onLocaleChange={vi.fn()}
      onTabChange={vi.fn()}
    >
      <div>service</div>
    </AppShell>,
  );

  expect(screen.getAllByRole("button", { name: "영토 지도" })).toHaveLength(2);
  expect(screen.queryByText("게스트 데모")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "한국어" })).toBeVisible();
  expect(screen.getByRole("button", { name: "EN" })).toBeVisible();
  expect(screen.queryByText(/ARMY/)).not.toBeInTheDocument();
});

it("keeps the current objective, reset, and locale controls in one non-overlapping shell header", async () => {
  const user = userEvent.setup();
  render(<KTownApp mode="demo" mapConfig={null} />);

  await user.click(await screen.findByRole("radio", { name: /BTS.*ARMY/ }));
  await user.click(screen.getByRole("button", { name: "이 팬덤으로 시작" }));

  const objective = screen.getByRole("region", { name: "현재 목표" });
  const locale = screen.getByRole("group", { name: "언어 선택" });
  const header = objective.closest("header");

  expect(header).not.toBeNull();
  expect(header).toContainElement(objective);
  expect(header).toContainElement(locale);
  expect(objective).toHaveAttribute("data-shell-region", "objective");
  expect(locale).toHaveAttribute("data-shell-region", "locale");
  expect(within(objective).getByRole("button", { name: "데모 초기화" })).toBeVisible();
});

it("switches artists without carrying the previous artist's expedition route", async () => {
  const user = userEvent.setup();
  render(<KTownApp mode="demo" mapConfig={null} />);

  await user.click(await screen.findByRole("radio", { name: /BTS.*ARMY/ }));
  await user.click(screen.getByRole("button", { name: "이 팬덤으로 시작" }));
  await user.click(screen.getByRole("button", { name: "원정 시작" }));
  expect(await screen.findByRole("heading", { name: "BTS 부산 바다 원정" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "영토 지도로" }));

  await user.click(screen.getByRole("button", { name: "내 팬덤 · ARMY" }));
  await user.click(screen.getByRole("radio", { name: /aespa.*MY/i }));
  await user.click(screen.getByRole("button", { name: "이 팬덤으로 변경" }));
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
