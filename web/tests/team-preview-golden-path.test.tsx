import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { KTownApp } from "@/features/ktown-app";
import { createInitialDemoSession, DEMO_SESSION_KEY, type DemoSession } from "@/features/team-preview/demo-session";

beforeEach(() => window.localStorage.clear());

it("completes the personalized BTS territory journey and persists its profile and progress", async () => {
  const user = userEvent.setup();
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  let view = render(<KTownApp mode="demo" mapConfig={null} />);

  expect(await screen.findByRole("navigation", { name: "주요 메뉴" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "응원할 아티스트를 선택하세요" })).toBeVisible();
  scrollTo.mockClear();
  await user.click(screen.getByRole("radio", { name: /BTS.*ARMY/ }));
  await user.click(screen.getByRole("button", { name: "이 팬덤으로 시작" }));
  expect(screen.getByRole("button", { name: "내 팬덤 · ARMY" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "영토 지도" })).toBeVisible();
  expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });

  const ownedList = screen.getByRole("list", { name: "지도와 같은 영토 목록" });
  await user.click(within(ownedList).getByRole("button", { name: /^부산/ }));
  expect(within(screen.getByRole("complementary", { name: "부산 전술 패널" })).getByText("현재 소유 · ARMY")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "전체" }));
  const territoryList = screen.getByRole("list", { name: "지도와 같은 영토 목록" });
  const gwangju = within(territoryList).getByRole("button", { name: /^광주/ });
  await user.click(gwangju);
  expect(gwangju).toHaveAttribute("aria-pressed", "true");
  const gwangjuPanel = screen.getByRole("complementary", { name: "광주 전술 패널" });
  expect(within(gwangjuPanel).getByText("현재 소유 · ONEDOOR")).toBeVisible();
  expect(within(gwangjuPanel).getByText("도전자 · ARMY")).toBeVisible();
  expect(within(gwangjuPanel).getByText("지역 연결 스토리 · 제이홉")).toBeVisible();

  await waitFor(() => expect(window.localStorage.getItem(DEMO_SESSION_KEY)).not.toBeNull());
  const selectedGwangju = JSON.parse(window.localStorage.getItem(DEMO_SESSION_KEY)!) as DemoSession;
  view.unmount();
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({
    ...selectedGwangju,
    activeTab: "expedition",
    selectedTerritoryId: "gwangju",
    selectedExpeditionId: "gwangju-regional-support-expedition",
  }));
  view = render(<KTownApp mode="demo" mapConfig={null} />);

  expect(await screen.findByRole("heading", { name: "광주 지역 응원 원정" })).toBeVisible();
  expect(screen.getByText("지역을 응원하는 공공 관광 코스")).toBeVisible();
  expect(screen.getByText(/아티스트 직접 연관 주장 없음/)).toBeVisible();
  expect(screen.queryByText("아티스트 연관 장소 중심")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "영토 지도로" }));
  const restoredGwangjuPanel = await screen.findByRole("complementary", { name: "광주 전술 패널" });
  await user.click(within(restoredGwangjuPanel).getByRole("button", { name: "원정 시작" }));
  expect(await screen.findByRole("heading", { name: "BTS 부산 공식 공연장 원정" })).toBeVisible();
  expect(screen.getByText("아티스트 연관 장소 중심")).toBeVisible();
  expect(screen.getByText("추천 근거 보기")).toBeVisible();
  expect(screen.getByRole("link", { name: "출처 확인" })).toHaveAttribute("href", "https://weverse.io/bts/notice/3595");
  const linkedStop = screen.getByRole("listitem", { name: "부산아시아드주경기장" });
  expect(within(linkedStop).getByText("아티스트 연관 장소")).toBeVisible();
  expect(within(linkedStop).getByRole("link", { name: "부산아시아드주경기장 출처" }))
    .toHaveAttribute("href", "https://weverse.io/bts/notice/3595");
  expect(within(screen.getByRole("region", { name: "부산 영토 현황" })).getByText(/ARMY.*920P/)).toBeVisible();

  await user.click(within(linkedStop).getByRole("button", { name: "부산아시아드주경기장 체크인" }));
  const checkIn = await screen.findByRole("dialog", { name: "현장 체크인" });
  await user.click(within(checkIn).getByRole("button", { name: "데모 인증 진행" }));
  expect(within(checkIn).getByText("GPS 위치 확인 완료")).toBeVisible();
  expect(within(checkIn).getByText("현장 사진 확인 완료")).toBeVisible();
  expect(within(checkIn).getByText("체류 45분 확인")).toBeVisible();
  await user.click(within(checkIn).getByRole("checkbox", { name: "로컬 소비 인증 포함" }));
  await user.click(within(checkIn).getByRole("button", { name: "포인트 검토" }));
  await user.click(within(checkIn).getByRole("button", { name: "체크인 제출" }));

  expect(await within(checkIn).findByRole("heading", { name: "체크인 승인 완료" })).toBeVisible();
  expect(within(checkIn).getByText("유효 포인트 +260P")).toBeVisible();
  expect(within(checkIn).getByText(/부산 지역 점유율.*52\.3%.*58\.4%/)).toBeVisible();
  expect(within(checkIn).getByText(/거점.*씨앗.*나무/)).toBeVisible();
  expect(within(checkIn).getByText(/팬덤 순위.*#1.*#1/)).toBeVisible();
  await user.click(within(checkIn).getByRole("button", { name: "여행 계속하기" }));

  await waitFor(() => {
    const saved = JSON.parse(window.localStorage.getItem(DEMO_SESSION_KEY)!) as DemoSession;
    expect(saved.contributedToday).toBe(260);
    expect(saved.approvedCheckIns).toEqual([
      expect.objectContaining({ expeditionId: "bts-busan-artist-linked-expedition", placeId: "busan-asiad-bts-concert-venue", territoryId: "busan", awardedPoints: 260 }),
    ]);
  });

  await user.click(screen.getAllByRole("button", { name: "랭킹" })[0]);
  expect(screen.getByRole("list", { name: "상위 3개 포디움" })).toBeVisible();
  expect(screen.getByRole("progressbar", { name: "순위 목표 진행률" })).toBeVisible();
  const ranking = screen.getByRole("list", { name: "팬덤 랭킹" });
  const selectedFandom = within(ranking).getByRole("listitem", { current: true });
  expect(selectedFandom).toHaveTextContent("#1");
  expect(selectedFandom).toHaveTextContent("방탄소년단 · ARMY");
  expect(selectedFandom).toHaveTextContent("23,380P");

  await user.click(screen.getByRole("button", { name: "대전 영토 자세히 보기" }));
  expect(await screen.findByRole("complementary", { name: "대전 전술 패널" })).toBeVisible();
  await user.click(screen.getAllByRole("button", { name: "랭킹" })[0]);
  expect(await screen.findByRole("heading", { name: "랭킹" })).toBeVisible();

  await user.click(screen.getAllByRole("button", { name: "내 기록" })[0]);
  expect(screen.getByRole("heading", { name: "내 기록" })).toBeVisible();
  expect(screen.getByText("완료한 원정").parentElement).toHaveTextContent("완료한 원정0");
  expect(within(screen.getByRole("list", { name: "활동 타임라인" })).getByText("부산아시아드주경기장")).toBeVisible();

  view.unmount();
  render(<KTownApp mode="demo" mapConfig={null} />);
  expect(await screen.findByRole("button", { name: "내 팬덤 · ARMY" })).toBeVisible();
  await user.click(screen.getAllByRole("button", { name: "랭킹" })[0]);
  const persistedRanking = screen.getByRole("list", { name: "팬덤 랭킹" });
  expect(within(persistedRanking).getByRole("listitem", { current: true })).toHaveTextContent("23,380P");
  await user.click(screen.getAllByRole("button", { name: "내 기록" })[0]);
  expect(await screen.findByText("부산아시아드주경기장")).toBeVisible();
  expect(screen.getByRole("region", { name: "내 시즌 요약" })).toHaveTextContent("기여 포인트260P");
}, 20_000);

it("completes and persists the full BTS demo journey from a blank session in English", async () => {
  const user = userEvent.setup();
  const view = render(<KTownApp mode="demo" mapConfig={null} />);

  expect(await screen.findByRole("heading", { name: "응원할 아티스트를 선택하세요" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "EN" }));
  expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Choose an artist to support" })).toBeVisible();
  expect(screen.queryByText("영토 지도")).not.toBeInTheDocument();
  expect(screen.queryByText("지도를 연결하려면 Amazon Location 설정이 필요해요")).not.toBeInTheDocument();

  const search = screen.getByRole("searchbox", { name: "Search artist or fandom" });
  await user.type(search, "BTS");
  expect(screen.getAllByRole("radio")).toHaveLength(1);
  await user.click(screen.getByRole("radio", { name: /BTS.*ARMY/ }));
  await user.click(screen.getByRole("button", { name: "Start with this fandom" }));
  expect(screen.getByRole("button", { name: "My fandom · ARMY" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Territory Map" })).toBeVisible();

  await user.click(screen.getAllByRole("button", { name: "Ranking" })[0]);
  const initialRanking = screen.getByRole("list", { name: "Fandom ranking" });
  const initialSelectedFandom = within(initialRanking).getByRole("listitem", { current: true });
  expect(initialSelectedFandom).toHaveTextContent("BTS · ARMY");
  expect(initialSelectedFandom).toHaveTextContent("23,120P");
  expect(screen.queryByRole("list", { name: "팬덤 랭킹" })).not.toBeInTheDocument();
  await user.click(screen.getAllByRole("button", { name: "Territory Map" })[0]);

  const filters = screen.getByRole("group", { name: "Territory filters" });
  await user.click(within(filters).getByRole("button", { name: "All" }));
  const territoryList = screen.getByRole("list", { name: "Map-equivalent territory list" });
  const yeongwol = within(territoryList).getByRole("button", { name: /^Yeongwol/ });
  await user.click(yeongwol);
  expect(yeongwol).toHaveAttribute("aria-pressed", "true");
  expect(yeongwol).toHaveTextContent("1.8×");
  expect(screen.getByRole("complementary", { name: "Yeongwol tactical panel" })).toBeVisible();
  expect(screen.queryByRole("group", { name: "영토 필터" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Start expedition" }));
  expect(await screen.findByRole("heading", { name: "BTS Busan official concert venue expedition" })).toBeVisible();
  expect(screen.getByText("Artist-linked places first")).toBeVisible();
  expect(screen.getByText("Why this is recommended")).toBeVisible();
  expect(screen.getByRole("link", { name: "View source" })).toHaveAttribute("href", "https://weverse.io/bts/notice/3595");
  const linkedStop = screen.getByRole("listitem", { name: "Busan Asiad Main Stadium" });
  expect(within(linkedStop).getByText("Artist-linked place")).toBeVisible();
  expect(within(linkedStop).getByRole("link", { name: "Busan Asiad Main Stadium source" }))
    .toHaveAttribute("href", "https://weverse.io/bts/notice/3595");
  expect(within(screen.getByRole("region", { name: "Busan territory standings" })).getByText(/ARMY.*920P/)).toBeVisible();
  expect(screen.queryByRole("link", { name: "아티스트 연결 출처" })).not.toBeInTheDocument();

  await user.click(within(linkedStop).getByRole("button", { name: "Busan Asiad Main Stadium check in" }));
  const checkIn = await screen.findByRole("dialog", { name: "On-site check-in" });
  expect(within(checkIn).queryByRole("heading", { name: "현장 체크인" })).not.toBeInTheDocument();
  await user.click(within(checkIn).getByRole("button", { name: "Run demo verification" }));
  expect(within(checkIn).getByText("GPS position verified")).toBeVisible();
  expect(within(checkIn).getByText("On-site photo verified")).toBeVisible();
  expect(within(checkIn).getByText("Dwell 45 minutes verified")).toBeVisible();
  await user.click(within(checkIn).getByRole("checkbox", { name: "Include local spend verification" }));
  await user.click(within(checkIn).getByRole("button", { name: "Review points" }));
  await user.click(within(checkIn).getByRole("button", { name: "Submit check-in" }));

  expect(await within(checkIn).findByRole("heading", { name: "Check-in approved" })).toBeVisible();
  expect(within(checkIn).getByText("Valid points +260P")).toBeVisible();
  expect(within(checkIn).getByText(/Busan Territory share.*52\.3%.*58\.4%/)).toBeVisible();
  expect(within(checkIn).getByText(/Stronghold.*Seed.*Tree/)).toBeVisible();
  expect(within(checkIn).getByText(/Fandom rank.*#1.*#1/)).toBeVisible();
  expect(within(checkIn).queryByText(/지역 점유율/)).not.toBeInTheDocument();
  await user.click(within(checkIn).getByRole("button", { name: "Continue trip" }));

  await waitFor(() => {
    const saved = JSON.parse(window.localStorage.getItem(DEMO_SESSION_KEY)!) as DemoSession;
    expect(saved.locale).toBe("en");
    expect(saved.contributedToday).toBe(260);
    expect(saved.approvedCheckIns).toEqual([
      expect.objectContaining({ expeditionId: "bts-busan-artist-linked-expedition", placeId: "busan-asiad-bts-concert-venue", territoryId: "busan", awardedPoints: 260 }),
    ]);
  });

  await user.click(screen.getAllByRole("button", { name: "Ranking" })[0]);
  const ranking = screen.getByRole("list", { name: "Fandom ranking" });
  const selectedFandom = within(ranking).getByRole("listitem", { current: true });
  expect(selectedFandom).toHaveTextContent("#1");
  expect(selectedFandom).toHaveTextContent("BTS · ARMY");
  expect(selectedFandom).toHaveTextContent("23,380P");
  expect(screen.queryByText("선택한 팬덤")).not.toBeInTheDocument();

  await user.click(screen.getAllByRole("button", { name: "My Record" })[0]);
  expect(screen.getByRole("heading", { name: "My Record" })).toBeVisible();
  expect(screen.getByText("Completed expeditions").parentElement).toHaveTextContent("Completed expeditions0");
  expect(within(screen.getByRole("list", { name: "Activity timeline" })).getByText("Busan Asiad Main Stadium")).toBeVisible();
  expect(screen.queryByRole("heading", { name: "내 기록" })).not.toBeInTheDocument();

  view.unmount();
  render(<KTownApp mode="demo" mapConfig={null} />);
  expect(await screen.findByRole("button", { name: "My fandom · ARMY" })).toBeVisible();
  expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getAllByRole("button", { name: "Ranking" })[0]);
  const persistedRanking = screen.getByRole("list", { name: "Fandom ranking" });
  expect(within(persistedRanking).getByRole("listitem", { current: true })).toHaveTextContent("23,380P");
  await user.click(screen.getAllByRole("button", { name: "My Record" })[0]);
  expect(await screen.findByText("Busan Asiad Main Stadium")).toBeVisible();
  expect(screen.getByRole("region", { name: "My season summary" })).toHaveTextContent("Contribution points260P");

  window.localStorage.setItem("ktown-english-neighbor", "preserve-me");
  await user.click(screen.getByRole("button", { name: "Reset demo" }));
  const resetDialog = screen.getByRole("dialog", { name: "Reset demo?" });
  await user.click(within(resetDialog).getByRole("button", { name: "Reset" }));

  expect(await screen.findByRole("heading", { name: "Choose an artist to support" })).toBeVisible();
  expect(screen.queryByText("1. 아티스트 선택")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "My fandom · ARMY" })).not.toBeInTheDocument();
  expect(window.localStorage.getItem("ktown-english-neighbor")).toBe("preserve-me");
  await waitFor(() => expect(window.localStorage.getItem(DEMO_SESSION_KEY)).toBeNull());
}, 20_000);

it("returns an empty season dashboard to Explore without resetting the confirmed profile or selected territory", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({
    ...createInitialDemoSession(),
    artistConfirmed: true,
    selectedArtistId: "bts",
    selectedTerritoryId: "busan",
    activeTab: "journey",
  }));
  render(<KTownApp mode="demo" mapConfig={null} />);

  expect(await screen.findByRole("heading", { name: "아직 원정 기록이 없어요" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "영토 둘러보기" }));

  expect(await screen.findByRole("heading", { name: "영토 지도" })).toBeVisible();
  expect(screen.getByRole("button", { name: "내 팬덤 · ARMY" })).toBeVisible();
  await waitFor(() => {
    const saved = JSON.parse(window.localStorage.getItem(DEMO_SESSION_KEY)!) as DemoSession;
    expect(saved.selectedArtistId).toBe("bts");
    expect(saved.selectedTerritoryId).toBe("busan");
    expect(saved.approvedCheckIns).toEqual([]);
  });
});

it("shows Gwangju regional support before opening the nearest eligible BTS-linked expedition", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({
    ...createInitialDemoSession(),
    artistConfirmed: true,
    selectedArtistId: "bts",
    selectedTerritoryId: "gwangju",
    selectedExpeditionId: "gwangju-regional-support-expedition",
    activeTab: "expedition",
  }));
  render(<KTownApp mode="demo" mapConfig={null} />);

  expect(await screen.findByRole("heading", { name: "광주 지역 응원 원정" })).toBeVisible();
  expect(screen.getByText("지역을 응원하는 공공 관광 코스")).toBeVisible();
  expect(screen.getByText(/아티스트 직접 연관 주장 없음/)).toBeVisible();

  await user.click(screen.getByRole("button", { name: "영토 지도로" }));
  const gwangjuPanel = await screen.findByRole("complementary", { name: "광주 전술 패널" });
  expect(within(gwangjuPanel).getByText(/지역 연결 스토리 · 제이홉/)).toBeVisible();

  await user.click(within(gwangjuPanel).getByRole("button", { name: "원정 시작" }));
  expect(await screen.findByRole("heading", { name: "BTS 부산 공식 공연장 원정" })).toBeVisible();
  expect(screen.getByText("아티스트 연관 장소 중심")).toBeVisible();
  const linkedStop = screen.getByRole("listitem", { name: "부산아시아드주경기장" });
  expect(within(linkedStop).getByText("아티스트 연관 장소")).toBeVisible();
  expect(within(linkedStop).getByRole("link", { name: "부산아시아드주경기장 출처" }))
    .toHaveAttribute("href", "https://weverse.io/bts/notice/3595");
}, 20_000);

it("opens the inspected contested territory in Explore from the ranking dashboard", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({
    ...createInitialDemoSession(),
    artistConfirmed: true,
    selectedArtistId: "bts",
    selectedTerritoryId: "gwangju",
    activeTab: "battle",
    selectedExpeditionId: null,
  }));
  render(<KTownApp mode="demo" mapConfig={null} />);

  const inspectBusan = await screen.findByRole("button", { name: "부산 영토 자세히 보기" });
  await user.click(inspectBusan);

  expect(await screen.findByRole("heading", { name: "영토 지도" })).toBeVisible();
  expect(await screen.findByRole("complementary", { name: "부산 전술 패널" })).toBeVisible();
}, 20_000);
