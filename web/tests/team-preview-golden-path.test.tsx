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
  expect(screen.getByRole("heading", { name: "영토 지도" })).toBeVisible();
  expect(screen.getByText("1. 아티스트 선택")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "EN" }));
  expect(screen.getByRole("heading", { name: "Territory Map" })).toBeVisible();
  expect(screen.getByText("Amazon Location configuration is required to connect the map")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "한국어" }));
  expect(screen.getByRole("heading", { name: "영토 지도" })).toBeVisible();
  expect(screen.getByText("지도를 연결하려면 Amazon Location 설정이 필요해요")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "아티스트 선택" }));
  const artistDialog = screen.getByRole("dialog", { name: "아티스트 선택" });
  const search = within(artistDialog).getByRole("searchbox", { name: "아티스트 또는 팬덤 검색" });
  await user.type(search, "BTS");
  expect(within(artistDialog).getAllByRole("radio")).toHaveLength(1);
  await user.click(within(artistDialog).getByRole("radio", { name: /BTS.*ARMY/ }));
  expect(screen.getByText("ARMY · #1")).toBeVisible();

  await user.click(screen.getAllByRole("button", { name: "랭킹" })[0]);
  const initialRanking = screen.getByRole("list", { name: "팬덤 랭킹" });
  expect(within(initialRanking).getByRole("listitem", { current: true })).toHaveTextContent("19,560P");
  await user.click(screen.getAllByRole("button", { name: "영토 지도" })[0]);

  const filters = screen.getByRole("group", { name: "영토 필터" });
  await user.click(within(filters).getByRole("button", { name: "인구감소지역 보너스" }));
  const territoryList = screen.getByRole("list", { name: "지도와 같은 영토 목록" });
  const yeongwol = within(territoryList).getByRole("button", { name: /^영월/ });
  await user.click(yeongwol);
  expect(yeongwol).toHaveAttribute("aria-pressed", "true");
  expect(yeongwol).toHaveTextContent("1.8×");
  expect(screen.getByRole("complementary", { name: "영월 전술 패널" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "부산 원정 시작" }));
  expect(await screen.findByRole("heading", { name: "BTS 부산 바다 원정" })).toBeVisible();
  expect(screen.getByText("검증")).toBeVisible();
  expect(screen.getByText(/KBS World가 지민과 정국의 고향으로 확인한 부산/)).toBeVisible();
  expect(screen.getByRole("link", { name: "아티스트 연결 출처" }))
    .toHaveAttribute("href", expect.stringMatching(/^https:\/\//));
  const nearbyStop = screen.getByRole("listitem", { name: "감천문화마을" });
  expect(within(nearbyStop).getByText("인근 추천")).toBeVisible();
  expect(within(nearbyStop).getByText(/직접 연관을 주장하지 않는/)).toBeVisible();
  expect(within(nearbyStop).getByRole("link", { name: "감천문화마을 출처" }))
    .toHaveAttribute("href", expect.stringMatching(/^https:\/\//));
  expect(within(screen.getByRole("region", { name: "부산 영토 현황" })).getByText(/ARMY.*920P/)).toBeVisible();

  await user.click(within(nearbyStop).getByRole("button", { name: "감천문화마을 체크인" }));
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
    expect(saved.missionHistory).toEqual([
      expect.objectContaining({ missionId: "busan-1", territoryId: "busan", awardedPoints: 260 }),
    ]);
  });

  await user.click(screen.getAllByRole("button", { name: "랭킹" })[0]);
  const ranking = screen.getByRole("list", { name: "팬덤 랭킹" });
  const selectedFandom = within(ranking).getByRole("listitem", { current: true });
  expect(selectedFandom).toHaveTextContent("#1");
  expect(selectedFandom).toHaveTextContent("방탄소년단 · ARMY");
  expect(selectedFandom).toHaveTextContent("19,820P");

  await user.click(screen.getAllByRole("button", { name: "내 기록" })[0]);
  expect(screen.getByRole("heading", { name: "내 기록" })).toBeVisible();
  expect(screen.getByText("완료한 원정").parentElement).toHaveTextContent("완료한 원정1");
  expect(within(screen.getByRole("list", { name: "승인된 체크인" })).getByText("감천문화마을")).toBeVisible();

  view.unmount();
  render(<KTownApp mode="demo" mapConfig={null} />);
  expect(await screen.findByText("ARMY · #1")).toBeVisible();
  await user.click(screen.getAllByRole("button", { name: "랭킹" })[0]);
  const persistedRanking = screen.getByRole("list", { name: "팬덤 랭킹" });
  expect(within(persistedRanking).getByRole("listitem", { current: true })).toHaveTextContent("19,820P");
  await user.click(screen.getAllByRole("button", { name: "내 기록" })[0]);
  expect(await screen.findByText("감천문화마을")).toBeVisible();
  expect(screen.getByText("유효 포인트").parentElement).toHaveTextContent("유효 포인트260P");

  window.localStorage.setItem("ktown-neighbor", "preserve-me");
  await user.click(screen.getByRole("button", { name: "데모 초기화" }));
  const resetDialog = screen.getByRole("dialog", { name: "데모를 초기화할까요?" });
  await user.click(within(resetDialog).getByRole("button", { name: "초기화" }));

  expect(await screen.findByText("1. 아티스트 선택")).toBeVisible();
  expect(screen.getByText("2. 추천 영토 확인")).toBeVisible();
  expect(screen.getByText("3. 첫 원정 시작")).toBeVisible();
  expect(screen.queryByText("ARMY · #1")).not.toBeInTheDocument();
  expect(window.localStorage.getItem("ktown-neighbor")).toBe("preserve-me");
  await waitFor(() => expect(window.localStorage.getItem(DEMO_SESSION_KEY)).toBeNull());
}, 20_000);

it("completes and persists the full BTS demo journey from a blank session in English", async () => {
  const user = userEvent.setup();
  const view = render(<KTownApp mode="demo" mapConfig={null} />);

  expect(await screen.findByText("1. 아티스트 선택")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "EN" }));
  expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Territory Map" })).toBeVisible();
  expect(screen.getByText("1. Choose an artist")).toBeVisible();
  expect(screen.getByText("Amazon Location configuration is required to connect the map")).toBeVisible();
  expect(screen.queryByText("영토 지도")).not.toBeInTheDocument();
  expect(screen.queryByText("지도를 연결하려면 Amazon Location 설정이 필요해요")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Choose artist" }));
  const artistDialog = screen.getByRole("dialog", { name: "Choose an artist" });
  const search = within(artistDialog).getByRole("searchbox", { name: "Search artist or fandom" });
  await user.type(search, "BTS");
  expect(within(artistDialog).getAllByRole("radio")).toHaveLength(1);
  await user.click(within(artistDialog).getByRole("radio", { name: /BTS.*ARMY/ }));
  expect(screen.getByText("ARMY · #1")).toBeVisible();
  expect(screen.queryByRole("dialog", { name: "아티스트 선택" })).not.toBeInTheDocument();

  await user.click(screen.getAllByRole("button", { name: "Ranking" })[0]);
  const initialRanking = screen.getByRole("list", { name: "Fandom ranking" });
  const initialSelectedFandom = within(initialRanking).getByRole("listitem", { current: true });
  expect(initialSelectedFandom).toHaveTextContent("BTS · ARMY");
  expect(initialSelectedFandom).toHaveTextContent("19,560P");
  expect(screen.queryByRole("list", { name: "팬덤 랭킹" })).not.toBeInTheDocument();
  await user.click(screen.getAllByRole("button", { name: "Territory Map" })[0]);

  const filters = screen.getByRole("group", { name: "Territory filters" });
  await user.click(within(filters).getByRole("button", { name: "Population-decline bonus" }));
  const territoryList = screen.getByRole("list", { name: "Map-equivalent territory list" });
  const yeongwol = within(territoryList).getByRole("button", { name: /^Yeongwol/ });
  await user.click(yeongwol);
  expect(yeongwol).toHaveAttribute("aria-pressed", "true");
  expect(yeongwol).toHaveTextContent("1.8×");
  expect(screen.getByRole("complementary", { name: "Yeongwol tactical panel" })).toBeVisible();
  expect(screen.queryByRole("group", { name: "영토 필터" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Busan Start expedition" }));
  expect(await screen.findByRole("heading", { name: "BTS Busan coast expedition" })).toBeVisible();
  expect(screen.getByText("Verified")).toBeVisible();
  expect(screen.getByText(/identified by KBS World as Jimin and Jungkook's hometown/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Artist connection source" }))
    .toHaveAttribute("href", expect.stringMatching(/^https:\/\//));
  const nearbyStop = screen.getByRole("listitem", { name: "Gamcheon Culture Village" });
  expect(within(nearbyStop).getByText("Nearby recommendation")).toBeVisible();
  expect(within(nearbyStop).getByText(/makes no direct artist-connection claim/)).toBeVisible();
  expect(within(nearbyStop).getByRole("link", { name: "Gamcheon Culture Village source" }))
    .toHaveAttribute("href", expect.stringMatching(/^https:\/\//));
  expect(within(screen.getByRole("region", { name: "Busan territory standings" })).getByText(/ARMY.*920P/)).toBeVisible();
  expect(screen.queryByRole("link", { name: "아티스트 연결 출처" })).not.toBeInTheDocument();

  await user.click(within(nearbyStop).getByRole("button", { name: "Gamcheon Culture Village check in" }));
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
    expect(saved.missionHistory).toEqual([
      expect.objectContaining({ missionId: "busan-1", territoryId: "busan", awardedPoints: 260 }),
    ]);
  });

  await user.click(screen.getAllByRole("button", { name: "Ranking" })[0]);
  const ranking = screen.getByRole("list", { name: "Fandom ranking" });
  const selectedFandom = within(ranking).getByRole("listitem", { current: true });
  expect(selectedFandom).toHaveTextContent("#1");
  expect(selectedFandom).toHaveTextContent("BTS · ARMY");
  expect(selectedFandom).toHaveTextContent("19,820P");
  expect(screen.queryByText("선택한 팬덤")).not.toBeInTheDocument();

  await user.click(screen.getAllByRole("button", { name: "My Record" })[0]);
  expect(screen.getByRole("heading", { name: "My Record" })).toBeVisible();
  expect(screen.getByText("Completed expeditions").parentElement).toHaveTextContent("Completed expeditions1");
  expect(within(screen.getByRole("list", { name: "Approved check-ins" })).getByText("Gamcheon Culture Village")).toBeVisible();
  expect(screen.queryByRole("heading", { name: "내 기록" })).not.toBeInTheDocument();

  view.unmount();
  render(<KTownApp mode="demo" mapConfig={null} />);
  expect(await screen.findByText("ARMY · #1")).toBeVisible();
  expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getAllByRole("button", { name: "Ranking" })[0]);
  const persistedRanking = screen.getByRole("list", { name: "Fandom ranking" });
  expect(within(persistedRanking).getByRole("listitem", { current: true })).toHaveTextContent("19,820P");
  await user.click(screen.getAllByRole("button", { name: "My Record" })[0]);
  expect(await screen.findByText("Gamcheon Culture Village")).toBeVisible();
  expect(screen.getByText("Valid points").parentElement).toHaveTextContent("Valid points260P");

  window.localStorage.setItem("ktown-english-neighbor", "preserve-me");
  await user.click(screen.getByRole("button", { name: "Reset demo" }));
  const resetDialog = screen.getByRole("dialog", { name: "Reset demo?" });
  await user.click(within(resetDialog).getByRole("button", { name: "Reset" }));

  expect(await screen.findByText("1. Choose an artist")).toBeVisible();
  expect(screen.getByText("2. Review a territory")).toBeVisible();
  expect(screen.getByText("3. Start the first expedition")).toBeVisible();
  expect(screen.queryByText("1. 아티스트 선택")).not.toBeInTheDocument();
  expect(screen.queryByText("ARMY · #1")).not.toBeInTheDocument();
  expect(window.localStorage.getItem("ktown-english-neighbor")).toBe("preserve-me");
  await waitFor(() => expect(window.localStorage.getItem(DEMO_SESSION_KEY)).toBeNull());
}, 20_000);
