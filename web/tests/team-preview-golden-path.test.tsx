import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it } from "vitest";
import { KTownApp } from "@/features/ktown-app";
import { DEMO_SESSION_KEY, type DemoSession } from "@/features/team-preview/demo-session";

beforeEach(() => window.localStorage.clear());

it("completes the bilingual BTS demo journey, persists its impact, and resets only the preview", async () => {
  const user = userEvent.setup();
  const view = render(<KTownApp mode="demo" mapConfig={null} />);

  expect(await screen.findByRole("navigation", { name: "주요 메뉴" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "응원할 아티스트를 선택하세요" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "EN" }));
  expect(screen.getByRole("heading", { name: "Choose an artist to support" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "한국어" }));
  expect(screen.getByRole("heading", { name: "응원할 아티스트를 선택하세요" })).toBeVisible();

  const search = screen.getByRole("searchbox", { name: "아티스트 또는 팬덤 검색" });
  await user.type(search, "BTS");
  expect(screen.getAllByRole("radio")).toHaveLength(1);
  await user.click(screen.getByRole("radio", { name: /BTS.*ARMY/ }));
  await user.click(screen.getByRole("button", { name: "이 팬덤으로 시작" }));
  expect(screen.getByRole("button", { name: "내 팬덤 · ARMY" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "영토 지도" })).toBeVisible();

  await user.click(screen.getAllByRole("button", { name: "랭킹" })[0]);
  const initialRanking = screen.getByRole("list", { name: "팬덤 랭킹" });
  expect(within(initialRanking).getByRole("listitem", { current: true })).toHaveTextContent("19,560P");
  await user.click(screen.getAllByRole("button", { name: "영토 지도" })[0]);

  const filters = screen.getByRole("group", { name: "영토 필터" });
  await user.click(within(filters).getByRole("button", { name: "전체" }));
  const territoryList = screen.getByRole("list", { name: "지도와 같은 영토 목록" });
  const yeongwol = within(territoryList).getByRole("button", { name: /^영월/ });
  await user.click(yeongwol);
  expect(yeongwol).toHaveAttribute("aria-pressed", "true");
  expect(yeongwol).toHaveTextContent("1.8×");
  expect(screen.getByRole("complementary", { name: "영월 전술 패널" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "원정 시작" }));
  expect(await screen.findByRole("heading", { name: "영월 지역 응원 원정" })).toBeVisible();
  expect(screen.getByText("지역을 응원하는 공공 관광 코스")).toBeVisible();
  expect(screen.getByText(/아티스트 직접 연관 주장 없음/)).toBeVisible();
  expect(screen.queryByRole("link", { name: "아티스트 연결 출처" })).not.toBeInTheDocument();
  const nearbyStop = screen.getByRole("listitem", { name: "청령포" });
  expect(within(nearbyStop).getByText("인근 추천")).toBeVisible();
  expect(within(nearbyStop).getByText(/직접 연관을 주장하지 않는/)).toBeVisible();
  expect(within(nearbyStop).getByRole("link", { name: "청령포 출처" }))
    .toHaveAttribute("href", expect.stringMatching(/^https:\/\//));
  expect(within(screen.getByRole("region", { name: "영월 영토 현황" })).getByText(/ARMY.*920P/)).toBeVisible();

  await user.click(within(nearbyStop).getByRole("button", { name: "청령포 체크인" }));
  const checkIn = await screen.findByRole("dialog", { name: "현장 체크인" });
  await user.click(within(checkIn).getByRole("button", { name: "데모 인증 진행" }));
  expect(within(checkIn).getByText("GPS 위치 확인 완료")).toBeVisible();
  expect(within(checkIn).getByText("현장 사진 확인 완료")).toBeVisible();
  expect(within(checkIn).getByText("체류 45분 확인")).toBeVisible();
  await user.click(within(checkIn).getByRole("checkbox", { name: "로컬 소비 인증 포함" }));
  await user.click(within(checkIn).getByRole("button", { name: "포인트 검토" }));
  await user.click(within(checkIn).getByRole("button", { name: "체크인 제출" }));

  expect(await within(checkIn).findByRole("heading", { name: "체크인 승인 완료" })).toBeVisible();
  expect(within(checkIn).getByText("유효 포인트 +468P")).toBeVisible();
  expect(within(checkIn).getByText(/영월 지역 점유율.*52\.3%.*62\.3%/)).toBeVisible();
  expect(within(checkIn).getByText(/거점.*씨앗.*나무/)).toBeVisible();
  expect(within(checkIn).getByText(/팬덤 순위.*#1.*#1/)).toBeVisible();
  await user.click(within(checkIn).getByRole("button", { name: "여행 계속하기" }));

  await waitFor(() => {
    const saved = JSON.parse(window.localStorage.getItem(DEMO_SESSION_KEY)!) as DemoSession;
    expect(saved.contributedToday).toBe(468);
    expect(saved.approvedCheckIns).toEqual([
      expect.objectContaining({ expeditionId: "yeongwol-public-expedition", placeId: "yeongwol-1", territoryId: "yeongwol", awardedPoints: 468 }),
    ]);
  });

  await user.click(screen.getAllByRole("button", { name: "랭킹" })[0]);
  const ranking = screen.getByRole("list", { name: "팬덤 랭킹" });
  const selectedFandom = within(ranking).getByRole("listitem", { current: true });
  expect(selectedFandom).toHaveTextContent("#1");
  expect(selectedFandom).toHaveTextContent("방탄소년단 · ARMY");
  expect(selectedFandom).toHaveTextContent("20,028P");

  await user.click(screen.getAllByRole("button", { name: "내 기록" })[0]);
  expect(screen.getByRole("heading", { name: "내 기록" })).toBeVisible();
  expect(screen.getByText("완료한 원정").parentElement).toHaveTextContent("완료한 원정0");
  expect(within(screen.getByRole("list", { name: "승인된 체크인" })).getByText("청령포")).toBeVisible();

  view.unmount();
  render(<KTownApp mode="demo" mapConfig={null} />);
  expect(await screen.findByRole("button", { name: "내 팬덤 · ARMY" })).toBeVisible();
  await user.click(screen.getAllByRole("button", { name: "랭킹" })[0]);
  const persistedRanking = screen.getByRole("list", { name: "팬덤 랭킹" });
  expect(within(persistedRanking).getByRole("listitem", { current: true })).toHaveTextContent("20,028P");
  await user.click(screen.getAllByRole("button", { name: "내 기록" })[0]);
  expect(await screen.findByText("청령포")).toBeVisible();
  expect(screen.getByText("유효 포인트").parentElement).toHaveTextContent("유효 포인트468P");

  window.localStorage.setItem("ktown-neighbor", "preserve-me");
  await user.click(screen.getByRole("button", { name: "데모 초기화" }));
  const resetDialog = screen.getByRole("dialog", { name: "데모를 초기화할까요?" });
  await user.click(within(resetDialog).getByRole("button", { name: "초기화" }));

  expect(await screen.findByRole("heading", { name: "응원할 아티스트를 선택하세요" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "내 팬덤 · ARMY" })).not.toBeInTheDocument();
  expect(window.localStorage.getItem("ktown-neighbor")).toBe("preserve-me");
  await waitFor(() => expect(window.localStorage.getItem(DEMO_SESSION_KEY)).toBeNull());
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
  expect(initialSelectedFandom).toHaveTextContent("19,560P");
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
  expect(await screen.findByRole("heading", { name: "Yeongwol regional support expedition" })).toBeVisible();
  expect(screen.getByText("Public tourism route supporting the region")).toBeVisible();
  expect(screen.getByText(/no direct artist claim/)).toBeVisible();
  expect(screen.queryByRole("link", { name: "Artist connection source" })).not.toBeInTheDocument();
  const nearbyStop = screen.getByRole("listitem", { name: "Cheongnyeongpo" });
  expect(within(nearbyStop).getByText("Nearby recommendation")).toBeVisible();
  expect(within(nearbyStop).getByText(/makes no direct artist-connection claim/)).toBeVisible();
  expect(within(nearbyStop).getByRole("link", { name: "Cheongnyeongpo source" }))
    .toHaveAttribute("href", expect.stringMatching(/^https:\/\//));
  expect(within(screen.getByRole("region", { name: "Yeongwol territory standings" })).getByText(/ARMY.*920P/)).toBeVisible();
  expect(screen.queryByRole("link", { name: "아티스트 연결 출처" })).not.toBeInTheDocument();

  await user.click(within(nearbyStop).getByRole("button", { name: "Cheongnyeongpo check in" }));
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
  expect(within(checkIn).getByText("Valid points +468P")).toBeVisible();
  expect(within(checkIn).getByText(/Yeongwol Territory share.*52\.3%.*62\.3%/)).toBeVisible();
  expect(within(checkIn).getByText(/Stronghold.*Seed.*Tree/)).toBeVisible();
  expect(within(checkIn).getByText(/Fandom rank.*#1.*#1/)).toBeVisible();
  expect(within(checkIn).queryByText(/지역 점유율/)).not.toBeInTheDocument();
  await user.click(within(checkIn).getByRole("button", { name: "Continue trip" }));

  await waitFor(() => {
    const saved = JSON.parse(window.localStorage.getItem(DEMO_SESSION_KEY)!) as DemoSession;
    expect(saved.locale).toBe("en");
    expect(saved.contributedToday).toBe(468);
    expect(saved.approvedCheckIns).toEqual([
      expect.objectContaining({ expeditionId: "yeongwol-public-expedition", placeId: "yeongwol-1", territoryId: "yeongwol", awardedPoints: 468 }),
    ]);
  });

  await user.click(screen.getAllByRole("button", { name: "Ranking" })[0]);
  const ranking = screen.getByRole("list", { name: "Fandom ranking" });
  const selectedFandom = within(ranking).getByRole("listitem", { current: true });
  expect(selectedFandom).toHaveTextContent("#1");
  expect(selectedFandom).toHaveTextContent("BTS · ARMY");
  expect(selectedFandom).toHaveTextContent("20,028P");
  expect(screen.queryByText("선택한 팬덤")).not.toBeInTheDocument();

  await user.click(screen.getAllByRole("button", { name: "My Record" })[0]);
  expect(screen.getByRole("heading", { name: "My Record" })).toBeVisible();
  expect(screen.getByText("Completed expeditions").parentElement).toHaveTextContent("Completed expeditions0");
  expect(within(screen.getByRole("list", { name: "Approved check-ins" })).getByText("Cheongnyeongpo")).toBeVisible();
  expect(screen.queryByRole("heading", { name: "내 기록" })).not.toBeInTheDocument();

  view.unmount();
  render(<KTownApp mode="demo" mapConfig={null} />);
  expect(await screen.findByRole("button", { name: "My fandom · ARMY" })).toBeVisible();
  expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getAllByRole("button", { name: "Ranking" })[0]);
  const persistedRanking = screen.getByRole("list", { name: "Fandom ranking" });
  expect(within(persistedRanking).getByRole("listitem", { current: true })).toHaveTextContent("20,028P");
  await user.click(screen.getAllByRole("button", { name: "My Record" })[0]);
  expect(await screen.findByText("Cheongnyeongpo")).toBeVisible();
  expect(screen.getByText("Valid points").parentElement).toHaveTextContent("Valid points468P");

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
