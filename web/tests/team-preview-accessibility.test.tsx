import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { CheckInFlow } from "@/components/check-in/check-in-flow";
import { ArtistDrawer } from "@/components/team-preview/artist-drawer";
import { RankingView } from "@/components/team-preview/ranking-view";
import { RecordView } from "@/components/team-preview/record-view";
import { TerritoryList } from "@/components/team-preview/territory-list";
import { createInitialDemoSession, DEMO_SESSION_KEY } from "@/features/team-preview/demo-session";
import { KTownApp } from "@/features/ktown-app";
import type { ArtistId } from "@/features/team-preview/types";
import type { CheckInService, Place } from "@/lib/domain";

beforeEach(() => window.localStorage.clear());

function saveConfirmedBtsSession() {
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({
    ...createInitialDemoSession(),
    artistConfirmed: true,
    selectedArtistId: "bts",
    selectedTerritoryId: "busan",
  }));
}

const place: Place = {
  id: "busan-1",
  regionId: "busan",
  nameKo: "감천문화마을",
  category: "culture",
  categoryLabel: "인근 추천",
  description: "공공 관광 추천지",
  address: "부산광역시 사하구",
  transit: "대중교통",
  dwellMinutes: 45,
  points: 100,
};

const checkInService: CheckInService = {
  create: vi.fn().mockResolvedValue({
    id: "session-1",
    placeId: place.id,
    status: "collecting",
    expiresAt: "2026-08-22T10:30:00Z",
  }),
  restore: vi.fn().mockResolvedValue(null),
  recordGps: vi.fn().mockResolvedValue(undefined),
  recordPhoto: vi.fn().mockResolvedValue(undefined),
  submit: vi.fn().mockResolvedValue({ decision: "approved", message: "승인" }),
};

function CheckInHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>감천문화마을 체크인 열기</button>
      {open ? (
        <CheckInFlow
          place={place}
          service={checkInService}
          mode="demo"
          demoAwardInput={{
            visitBase: 100,
            balanceMultiplier: 1,
            fandomSizeMultiplier: 1,
            repeatCount: 0,
            contributedToday: 0,
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function ArtistDrawerHarness({ selectedArtistId }: { selectedArtistId: ArtistId | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>아티스트 서랍 열기</button>
      <ArtistDrawer
        open={open}
        locale="ko"
        selectedArtistId={selectedArtistId}
        onClose={() => setOpen(false)}
        onSelect={() => undefined}
      />
    </>
  );
}

it.each([
  ["first", "bts", /BTS.*ARMY/],
  ["middle", "aespa", /aespa.*MY/i],
] as const)("treats the checked %s artist radio as the group's only sequential tab stop", async (_position, selectedArtistId, accessibleName) => {
  const user = userEvent.setup();
  render(<ArtistDrawerHarness selectedArtistId={selectedArtistId} />);

  await user.click(screen.getByRole("button", { name: "아티스트 서랍 열기" }));
  const dialog = screen.getByRole("dialog", { name: "아티스트 선택" });
  const close = within(dialog).getByRole("button", { name: "닫기" });
  const checked = within(dialog).getByRole("radio", { name: accessibleName });
  expect(checked).toBeChecked();

  checked.focus();
  await user.tab();
  expect(close).toHaveFocus();

  close.focus();
  await user.tab({ shift: true });
  expect(checked).toHaveFocus();
});

it("uses the first artist radio as the sequential group stop when none is checked", async () => {
  const user = userEvent.setup();
  render(<ArtistDrawerHarness selectedArtistId={null} />);

  await user.click(screen.getByRole("button", { name: "아티스트 서랍 열기" }));
  const dialog = screen.getByRole("dialog", { name: "아티스트 선택" });
  const close = within(dialog).getByRole("button", { name: "닫기" });
  close.focus();
  await user.tab({ shift: true });

  expect(within(dialog).getAllByRole("radio")[0]).toHaveFocus();
});

it("traps the artist drawer, closes it with Escape, and returns focus to its trigger", async () => {
  const user = userEvent.setup();
  saveConfirmedBtsSession();
  render(<KTownApp mode="demo" mapConfig={null} />);

  const trigger = await screen.findByRole("button", { name: "내 팬덤 · ARMY" });
  await user.click(trigger);

  const dialog = screen.getByRole("dialog", { name: "아티스트 선택" });
  const title = within(dialog).getByRole("heading", { name: "아티스트 선택" });
  expect(title).toHaveFocus();

  const lastArtist = within(dialog).getAllByRole("radio").at(-1)!;
  lastArtist.focus();
  await user.tab();
  expect(within(dialog).getByRole("button", { name: "닫기" })).toHaveFocus();

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "아티스트 선택" })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it("keeps one current primary navigation item and labels locale and reset dialogs", async () => {
  const user = userEvent.setup();
  saveConfirmedBtsSession();
  render(<KTownApp mode="demo" mapConfig={null} />);

  const navigation = await screen.findByRole("navigation", { name: "주요 메뉴" });
  expect(within(navigation).getAllByRole("button").filter((button) => button.hasAttribute("aria-current")))
    .toHaveLength(1);
  expect(screen.getByRole("group", { name: "언어 선택" })).toBeVisible();

  const reset = screen.getByRole("button", { name: "데모 초기화" });
  await user.click(reset);
  const dialog = screen.getByRole("dialog", { name: "데모를 초기화할까요?" });
  expect(within(dialog).getByRole("heading", { name: "데모를 초기화할까요?" })).toHaveFocus();

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "데모를 초기화할까요?" })).not.toBeInTheDocument();
  expect(reset).toHaveFocus();
});

it("blocks pointer activation of navigation and locale controls behind the reset dialog", async () => {
  const user = userEvent.setup();
  saveConfirmedBtsSession();
  render(<KTownApp mode="demo" mapConfig={null} />);

  const navigation = await screen.findByRole("navigation", { name: "주요 메뉴" });
  const territoryTab = within(navigation).getByRole("button", { name: "영토 지도" });
  const rankingTab = within(navigation).getByRole("button", { name: "랭킹" });
  const english = screen.getByRole("button", { name: "EN" });
  await user.click(screen.getByRole("button", { name: "데모 초기화" }));
  expect(screen.getByRole("dialog", { name: "데모를 초기화할까요?" })).toBeVisible();

  await user.click(rankingTab);
  await user.click(english);

  expect(territoryTab).toHaveAttribute("aria-current", "page");
  expect(rankingTab).not.toHaveAttribute("aria-current");
  expect(english).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("dialog", { name: "데모를 초기화할까요?" })).toBeVisible();
});

it("redirects programmatic background focus into the reset dialog", async () => {
  const user = userEvent.setup();
  saveConfirmedBtsSession();
  render(<KTownApp mode="demo" mapConfig={null} />);

  const english = await screen.findByRole("button", { name: "EN" });
  await user.click(screen.getByRole("button", { name: "데모 초기화" }));
  const dialog = screen.getByRole("dialog", { name: "데모를 초기화할까요?" });
  const title = within(dialog).getByRole("heading", { name: "데모를 초기화할까요?" });

  english.focus();

  expect(title).toHaveFocus();
});

it("focuses and traps the check-in dialog, then restores its invoking control", async () => {
  const user = userEvent.setup();
  render(<CheckInHarness />);

  const trigger = screen.getByRole("button", { name: "감천문화마을 체크인 열기" });
  await user.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "현장 체크인" });
  expect(within(dialog).getByRole("heading", { name: "현장 체크인" })).toHaveFocus();

  const lastAction = await within(dialog).findByRole("button", { name: "데모 인증 진행" });
  await waitFor(() => expect(lastAction).toBeEnabled());
  lastAction.focus();
  await user.tab();
  expect(within(dialog).getByRole("button", { name: "체크인 닫기" })).toHaveFocus();

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "현장 체크인" })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it("exposes map-equivalent territory buttons with selection and stronghold names", () => {
  const session = createInitialDemoSession();
  const territories = [
    { ...session.territories[0], strongholdStage: "seed" as const },
    { ...session.territories[1], strongholdStage: "tree" as const },
    { ...session.territories[2], strongholdStage: "landmark" as const },
  ];

  render(
    <TerritoryList
      territories={territories}
      locale="en"
      selectedArtistId="bts"
      selectedTerritoryId={territories[1].id}
      onSelectTerritory={vi.fn()}
    />,
  );

  const list = screen.getByRole("list", { name: "Map-equivalent territory list" });
  expect(within(list).getByRole("button", { name: /Seed stronghold/ })).toHaveAttribute("aria-pressed", "false");
  expect(within(list).getByRole("button", { name: /Tree stronghold/ })).toHaveAttribute("aria-pressed", "true");
  expect(within(list).getByRole("button", { name: /Landmark stronghold/ })).toHaveAttribute("aria-pressed", "false");
});

it("renders all stronghold states as distinct named silhouettes with visible labels", () => {
  render(<RecordView locale="ko" session={createInitialDemoSession()} />);

  const growth = screen.getByRole("list", { name: "성장 단계" });
  expect(within(growth).getByRole("img", { name: "씨앗 거점" })).toHaveTextContent("씨앗");
  expect(within(growth).getByRole("img", { name: "나무 거점" })).toHaveTextContent("나무");
  expect(within(growth).getByRole("img", { name: "랜드마크 거점" })).toHaveTextContent("랜드마크");
});

it("announces the complete mission impact as one polite textual summary", async () => {
  const user = userEvent.setup();
  render(
    <CheckInFlow
      place={place}
      service={checkInService}
      mode="demo"
      demoAwardInput={{
        visitBase: 100,
        balanceMultiplier: 1,
        fandomSizeMultiplier: 1,
        repeatCount: 0,
        contributedToday: 0,
      }}
      impact={{
        territoryName: "부산",
        territoryShareBefore: 52.3,
        territoryShareAfter: 58.4,
        strongholdBefore: "씨앗",
        strongholdAfter: "나무",
        fandomRankBefore: 2,
        fandomRankAfter: 1,
        personalRankBefore: 128,
        personalRankAfter: 123,
      }}
      onApproved={() => undefined}
      onClose={() => undefined}
    />,
  );

  await user.click(await screen.findByRole("button", { name: "데모 인증 진행" }));
  await user.click(screen.getByRole("button", { name: "포인트 검토" }));
  await user.click(screen.getByRole("button", { name: "체크인 제출" }));

  const impact = await screen.findByRole("status", { name: "미션 영향 요약" });
  expect(impact).toHaveAttribute("aria-live", "polite");
  expect(impact).toHaveTextContent("부산 지역 점유율 · 52.3% → 58.4%");
  expect(impact).toHaveTextContent("거점 · 씨앗 → 나무");
  expect(impact).toHaveTextContent("팬덤 순위 · #2 → #1");
  expect(impact).toHaveTextContent("내 기여 순위 · #128 → #123");
});

it("enters profile setup by keyboard and keeps primary navigation inert until confirmation", async () => {
  const user = userEvent.setup();
  render(<KTownApp mode="demo" mapConfig={null} />);

  const navigation = await screen.findByRole("navigation", { name: "주요 메뉴" });
  expect(screen.getByRole("img", { name: "K-Town Defense" })).toBeVisible();
  expect(within(navigation).getAllByRole("button").every((button) => (button as HTMLButtonElement).disabled)).toBe(true);

  await user.tab();
  expect(screen.getByRole("button", { name: "한국어" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("button", { name: "EN" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("searchbox", { name: "아티스트 또는 팬덤 검색" })).toHaveFocus();
  await user.tab();

  const bts = screen.getByRole("radio", { name: /방탄소년단.*ARMY/ });
  const blackpink = screen.getByRole("radio", { name: /블랙핑크.*BLINK/ });
  expect(bts).toHaveFocus();
  await user.keyboard("{Space}{ArrowDown}");
  expect(blackpink).toBeChecked();
  await user.keyboard("{ArrowUp}");
  expect(bts).toBeChecked();

  const confirm = screen.getByRole("button", { name: "이 팬덤으로 시작" });
  confirm.focus();
  await user.keyboard("{Enter}");

  expect(await screen.findByRole("heading", { name: "영토 지도" })).toBeVisible();
  expect(within(navigation).getAllByRole("button").every((button) => !(button as HTMLButtonElement).disabled)).toBe(true);
});

it("returns focus to the profile trigger after a keyboard-confirmed fandom change", async () => {
  const user = userEvent.setup();
  render(<KTownApp mode="demo" mapConfig={null} />);

  await user.click(await screen.findByRole("radio", { name: /방탄소년단.*ARMY/ }));
  await user.click(screen.getByRole("button", { name: "이 팬덤으로 시작" }));
  const trigger = screen.getByRole("button", { name: "내 팬덤 · ARMY" });
  await user.click(trigger);
  await user.click(within(screen.getByRole("dialog", { name: "아티스트 선택" })).getByRole("radio", { name: /aespa.*MY/i }));
  const confirm = screen.getByRole("button", { name: "이 팬덤으로 변경" });
  confirm.focus();
  await user.keyboard("{Enter}");

  await waitFor(() => expect(screen.getByRole("button", { name: "내 팬덤 · MY" })).toHaveFocus());
});

it("keeps the map fallback, territory-card selection, and selected-region text keyboard complete", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({
    ...createInitialDemoSession(),
    artistConfirmed: true,
    selectedArtistId: "bts",
    selectedTerritoryId: "busan",
  }));
  render(<KTownApp mode="demo" mapConfig={null} />);

  const unavailable = await screen.findByText("지도를 사용할 수 없어요");
  expect(unavailable.closest('[role="status"]')).toHaveTextContent("지도를 연결하려면 Amazon Location 설정이 필요해요");
  await user.click(screen.getByRole("button", { name: "전체" }));
  const list = screen.getByRole("list", { name: "지도와 같은 영토 목록" });
  const busan = within(list).getByRole("button", { name: /^부산/ });
  const gwangju = within(list).getByRole("button", { name: /^광주/ });
  expect(busan).toHaveAttribute("aria-pressed", "true");

  gwangju.focus();
  await user.keyboard("{Enter}");

  expect(gwangju).toHaveAttribute("aria-pressed", "true");
  expect(busan).toHaveAttribute("aria-pressed", "false");
  const selectedRegion = await screen.findByRole("complementary", { name: "광주 전술 패널" });
  expect(within(selectedRegion).getByRole("heading", { name: "광주" })).toBeVisible();
  expect(within(selectedRegion).getByText("현재 소유 · ONEDOOR")).toBeVisible();
  expect(screen.getByRole("button", { name: "전국 보기" })).toBeVisible();
});

it("labels ranking progress and gives every locked reward a non-color status", () => {
  const session = createInitialDemoSession();
  const ranking = render(
    <RankingView
      locale="ko"
      fandoms={session.fandoms}
      territories={session.territories}
      selectedArtistId="bts"
      onInspectTerritory={vi.fn()}
    />,
  );

  const progress = screen.getByRole("progressbar", { name: "순위 목표 진행률" });
  expect(progress).toHaveAttribute("aria-valuemin", "0");
  expect(progress).toHaveAttribute("aria-valuemax", "1");
  expect(Number(progress.getAttribute("aria-valuenow"))).toBeGreaterThanOrEqual(0);
  ranking.unmount();

  render(<RecordView locale="ko" session={session} />);
  const rewards = screen.getByRole("list", { name: "획득 보상" });
  const lockedRewards = within(rewards).getAllByRole("listitem");
  expect(lockedRewards).toHaveLength(3);
  for (const reward of lockedRewards) {
    expect(reward).toHaveClass("locked");
    expect(reward).toHaveTextContent("잠김");
    expect(within(reward).getByRole("img")).toHaveAccessibleName(/거점/);
  }
});

it("opens Ranking and Record CTA destinations from the keyboard", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({
    ...createInitialDemoSession(),
    artistConfirmed: true,
    selectedArtistId: "bts",
    selectedTerritoryId: "gwangju",
    activeTab: "battle",
  }));
  render(<KTownApp mode="demo" mapConfig={null} />);

  const rankingCta = await screen.findByRole("button", { name: "부산 영토 자세히 보기" });
  rankingCta.focus();
  await user.keyboard("{Enter}");
  expect(await screen.findByRole("heading", { name: "영토 지도" })).toBeVisible();
  expect(screen.getByRole("complementary", { name: "부산 전술 패널" })).toBeVisible();

  const navigation = screen.getByRole("navigation", { name: "주요 메뉴" });
  const recordTab = within(navigation).getByRole("button", { name: "내 기록" });
  recordTab.focus();
  await user.keyboard("{Enter}");
  expect(await screen.findByRole("heading", { name: "아직 원정 기록이 없어요" })).toBeVisible();

  const recordCta = screen.getByRole("button", { name: "영토 둘러보기" });
  recordCta.focus();
  await user.keyboard("{Enter}");
  expect(await screen.findByRole("heading", { name: "영토 지도" })).toBeVisible();
  expect(screen.getByRole("button", { name: "내 팬덤 · ARMY" })).toBeVisible();
});
