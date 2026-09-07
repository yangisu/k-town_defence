import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { TerritoryView } from "@/components/team-preview/territory-view";
import { TerritoryList } from "@/components/team-preview/territory-list";
import {
  TERRITORY_FILTERS,
  filterAndOrderTerritories,
} from "@/components/team-preview/map-filters";
import {
  DEMO_SESSION_KEY,
  createInitialDemoSession,
  demoSessionReducer,
  type DemoSession,
} from "@/features/team-preview/demo-session";
import { GAME_RULES, type MissionAward } from "@/features/team-preview/game-rules";
import { DemoSessionProvider } from "@/features/team-preview/demo-session-context";

beforeEach(() => window.localStorage.clear());

function confirmedSession(overrides: Partial<DemoSession> = {}): DemoSession {
  return {
    ...createInitialDemoSession(),
    artistConfirmed: true,
    selectedArtistId: "bts",
    selectedTerritoryId: "busan",
    ...overrides,
  };
}

function renderPreviewWithArtist(overrides: Partial<DemoSession> = {}) {
  const state = confirmedSession(overrides);
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(state));
  render(
    <DemoSessionProvider storage={window.localStorage}>
      <TerritoryView
        mapConfig={null}
      />
    </DemoSessionProvider>,
  );

}

const award = (points: number): MissionAward => ({
  visit: points,
  dwell: 0,
  localSpend: 0,
  accommodation: 0,
  strongholdBonus: 0,
  subtotal: points,
  multiplier: 1,
  validPoints: points,
  cappedPoints: points,
});

it("turns artist choice into a visible tactical recommendation", async () => {
  renderPreviewWithArtist();

  const panel = await screen.findByRole("complementary", { name: "부산 전술 패널" });
  expect(within(panel).getByText("지역 연결 스토리 · 지민", { selector: "strong" })).toBeVisible();
  expect(within(panel).queryByText("팀 데이터 · 미검증 제안")).not.toBeInTheDocument();
  expect(within(panel).getByRole("heading", { name: "부산" })).toBeVisible();
  expect(within(panel).getByText(/^방어 우위$/)).toBeVisible();
  expect(within(panel).getByText(/지역균형 보너스/)).toBeVisible();
  expect(within(panel).getByText("방문 기본")).toBeVisible();
  expect(within(panel).getByText("체류 보너스")).toBeVisible();
  expect(within(panel).getByText("로컬 소비")).toBeVisible();
  expect(within(panel).getByText("숙박")).toBeVisible();
  expect(within(panel).getByText(/영토 영향/)).toBeVisible();
  expect(within(panel).getByText(/팬덤 순위 영향/)).toBeVisible();
  expect(within(panel).getByRole("link", { name: "출처 확인" })).toHaveAttribute("href", expect.stringMatching(/^https:\/\//));
  expect(within(panel).getByRole("button", { name: /원정 시작/ })).toBeEnabled();
  expect(within(panel).getByRole("img", { name: /거점/ })).toHaveStyle({ "--owner-color": "#7c5ce0" });
});

it("changes results when the user filters to contested territory", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist();

  await screen.findByRole("complementary", { name: "부산 전술 패널" });
  await user.click(screen.getByRole("button", { name: "접전 지역" }));

  expect(screen.getByRole("list", { name: "지도와 같은 영토 목록" }))
    .toHaveTextContent("탈환까지");
  expect(screen.getByText("정렬: 방어 긴급도 → 탈환 필요 포인트 → 내 거점 거리")).toBeVisible();
});

it("shows the resolved fandom owner after a mission captures a territory", () => {
  let ready = demoSessionReducer(createInitialDemoSession(), { type: "selectArtist", artistId: "bts" });
  ready = demoSessionReducer(ready, { type: "openExpedition", expeditionId: "bts-busan-artist-linked-expedition" });
  const tied = demoSessionReducer(ready, {
    type: "completeCheckIn", expeditionId: "bts-busan-artist-linked-expedition", placeId: "busan-1", award: award(80),
  });
  let challenger = demoSessionReducer(tied, { type: "selectArtist", artistId: "blackpink" });
  challenger = demoSessionReducer(challenger, { type: "selectTerritory", territoryId: "busan" });
  challenger = demoSessionReducer(challenger, { type: "openExpedition", expeditionId: "busan-regional-support-expedition" });
  const captured = demoSessionReducer(challenger, {
    type: "completeCheckIn",
    expeditionId: "busan-regional-support-expedition",
    placeId: "busan-2",
    award: award(161),
  });
  const busan = captured.territories.find((territory) => territory.id === "busan")!;

  expect(busan.ownerArtistId).toBe("blackpink");
  expect(busan.standings[0]?.fandomName).toBe("ARMY");
  render(
    <TerritoryList
      territories={[busan]}
      locale="ko"
      selectedArtistId="blackpink"
      selectedTerritoryId="busan"
      onSelectTerritory={vi.fn()}
    />,
  );

  const row = screen.getByRole("button", { name: /^부산/ });
  expect(row).toHaveTextContent("BLINK");
  expect(row).not.toHaveTextContent("ARMY");
});

it("keeps personalized filter IDs and fandom filtering", () => {
  const state = confirmedSession();

  expect(TERRITORY_FILTERS.map((filter) => filter.id)).toEqual([
    "my_fandom",
    "contested",
    "artist_connection",
    "all",
  ]);
  expect(filterAndOrderTerritories(state.territories, "my_fandom", "bts")
    .map((territory) => territory.id))
    .toEqual(["busan", "daegu", "yeongwol"]);
});

it("routes an empty region to the nearest sourced artist-linked expedition without fabricating evidence", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist({ selectedTerritoryId: "yeongwol" });

  const panel = await screen.findByRole("complementary", { name: "영월 전술 패널" });
  expect(within(panel).getByText("인근 추천")).toBeVisible();
  expect(within(panel).queryByLabelText("연결 근거 등급")).not.toBeInTheDocument();
  expect(within(panel).getByText("이 영토에는 선택한 아티스트의 검증된 직접 연결이 없어 부산의 검증된 아티스트 연관 장소 중심 원정을 추천합니다.")).toBeVisible();
  expect(within(panel).getByRole("link", { name: "출처 확인" })).toHaveAttribute("href", expect.stringMatching(/^https:\/\//));

  const action = within(panel).getByRole("button", { name: "원정 시작" });
  expect(action).toBeEnabled();
  await user.click(action);

  await waitFor(() => {
    const saved = JSON.parse(window.localStorage.getItem(DEMO_SESSION_KEY)!) as DemoSession;
    expect(saved.selectedTerritoryId).toBe("busan");
    expect(saved.selectedExpeditionId).toBe("bts-busan-artist-linked-expedition");
  });
});

it.each([
  ["gwangju", "광주"],
  ["yeongwol", "영월"],
] as const)("keeps %s battle context while opening the nearest evidence-eligible route", async (territoryId, territoryName) => {
  const user = userEvent.setup();
  renderPreviewWithArtist({ selectedTerritoryId: territoryId });

  const panel = await screen.findByRole("complementary", { name: `${territoryName} 전술 패널` });
  expect(within(panel).getByRole("heading", { name: territoryName })).toBeVisible();
  const action = within(panel).getByRole("button", { name: "원정 시작" });
  expect(action).toBeEnabled();

  const projection = within(panel).getByRole("region", { name: "부산 추천 원정 영향" });
  expect(projection).toHaveTextContent("지역균형 보너스 1×");
  expect(projection).toHaveTextContent("기본 지역균형 배율");
  expect(projection).toHaveTextContent(/영토 영향/);
  expect(projection).toHaveTextContent(/팬덤 순위 영향.*#1.*현재 순위 유지/);

  await user.click(action);
  await waitFor(() => {
    const saved = JSON.parse(window.localStorage.getItem(DEMO_SESSION_KEY)!) as DemoSession;
    expect(saved.selectedTerritoryId).toBe("busan");
    expect(saved.selectedExpeditionId).toBe("bts-busan-artist-linked-expedition");
  });
});

it("uses summary cards as map navigation and explains the distance anchor", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist({ selectedArtistId: "rescene", selectedTerritoryId: "geoje" });

  const summary = await screen.findByRole("region", { name: "내 팬덤 영토 요약" });
  const strongest = within(summary).getByRole("button", { name: /가장 강한 소유 영토.*경주/ });
  const nearest = within(summary).getByRole("button", { name: /내 거점에서 가까운 접전지/ });

  expect(nearest).toHaveTextContent(/거점 기준.*약 .*km/);
  await user.click(strongest);

  await waitFor(() => expect(JSON.parse(window.localStorage.getItem(DEMO_SESSION_KEY)!)).toMatchObject({
    selectedTerritoryId: "gyeongju",
  }));
  expect(screen.getByRole("button", { name: /^경주/ })).toHaveAttribute("aria-pressed", "true");
});

it("describes the actual nearest artist-linked recommendation in English", async () => {
  renderPreviewWithArtist({ locale: "en", selectedTerritoryId: "yeongwol" });

  const panel = await screen.findByRole("complementary", { name: "Yeongwol tactical panel" });
  expect(within(panel).getByText("This territory has no verified direct connection to the selected artist, so the nearest verified artist-linked expedition in Busan is recommended.")).toBeVisible();
  expect(within(panel).queryByText(/public tourism expedition is recommended/i)).not.toBeInTheDocument();
});

it.each([
  [
    "ko",
    ["내 팬덤", "접전 지역", "아티스트 연결", "전체"],
    [["소유 영토", "2"], ["가장 강한 소유 영토", "광주"], ["내 거점에서 가까운 접전지", "원주"], ["추천 행동", "방어 · 원주"]],
    "현재 소유",
    "전국 보기",
    "아티스트 변경",
    "내 팬덤 영토 요약",
  ],
  [
    "en",
    ["My fandom", "Contested", "Artist connection", "All"],
    [["Owned territories", "2"], ["Strongest owned territory", "Gwangju"], ["Contested territory near my base", "Wonju"], ["Recommended action", "Defend · Wonju"]],
    "Current owner",
    "National view",
    "Change artist",
    "My fandom territory summary",
  ],
] as const)("keeps every personalized summary value and filter order available in %s", async (locale, filterLabels, summaryPairs, owner, nationalView, changeArtist, summary) => {
  const user = userEvent.setup();
  renderPreviewWithArtist({ locale: locale as "ko" | "en", selectedArtistId: "boynextdoor", selectedTerritoryId: "gwangju" });

  await screen.findByRole("button", { name: filterLabels[0] });
  const filters = screen.getAllByRole("button").filter((button) => filterLabels.includes(button.textContent as typeof filterLabels[number]));
  expect(filters.map((button) => button.textContent)).toEqual(filterLabels);
  expect(filters[0]).toHaveAttribute("aria-pressed", "true");
  const summaryRegion = screen.getByRole("region", { name: summary });
  expect(within(summaryRegion).getAllByRole("button").map((button) => [
    button.querySelector("span")?.textContent,
    button.querySelector("strong")?.textContent,
  ])).toEqual(summaryPairs);
  const territoryListLabel = locale === "ko" ? "지도와 같은 영토 목록" : "Map-equivalent territory list";
  expect(screen.getByRole("list", { name: territoryListLabel })).toHaveTextContent(`${owner} · ONEDOOR`);
  expect(screen.queryByRole("button", { name: nationalView })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: changeArtist })).not.toBeInTheDocument();

  const territoryNames = locale === "ko"
    ? {
        busan: "부산", daegu: "대구", gwangju: "광주", gunpo: "군포", seongnam: "성남", geoje: "거제", suwon: "수원", gyeongju: "경주", daejeon: "대전", seoul: "서울", yongin: "용인", goyang: "고양", incheon: "인천", jeju: "제주", ulsan: "울산", siheung: "시흥", cheonan: "천안", pohang: "포항", wonju: "원주", chuncheon: "춘천", uijeongbu: "의정부", namyangju: "남양주", yeongwol: "영월",
      }
    : {
        busan: "Busan", daegu: "Daegu", gwangju: "Gwangju", gunpo: "Gunpo", seongnam: "Seongnam", geoje: "Geoje", suwon: "Suwon", gyeongju: "Gyeongju", daejeon: "Daejeon", seoul: "Seoul", yongin: "Yongin", goyang: "Goyang", incheon: "Incheon", jeju: "Jeju", ulsan: "Ulsan", siheung: "Siheung", cheonan: "Cheonan", pohang: "Pohang", wonju: "Wonju", chuncheon: "Chuncheon", uijeongbu: "Uijeongbu", namyangju: "Namyangju", yeongwol: "Yeongwol",
      };
  const expectedTerritoryIds = [
    ["wonju", "gwangju"],
    ["wonju", "chuncheon", "yongin", "gunpo", "cheonan", "daejeon", "busan", "ulsan"],
    ["busan", "wonju", "gwangju", "suwon"],
    ["busan", "wonju", "gwangju", "suwon", "gunpo", "daejeon", "yongin", "ulsan", "cheonan", "chuncheon", "yeongwol", "geoje", "gyeongju", "goyang", "namyangju", "daegu", "seoul", "seongnam", "siheung", "uijeongbu", "incheon", "jeju", "pohang"],
  ] as const;
  const list = screen.getByRole("list", { name: locale === "ko" ? "지도와 같은 영토 목록" : "Map-equivalent territory list" });
  for (const [index, filter] of filterLabels.entries()) {
    await user.click(screen.getByRole("button", { name: filter }));
    const actualTerritoryIds = within(list).getAllByRole("button").map((button) => {
      const name = button.querySelector("strong")?.textContent;
      return Object.entries(territoryNames).find(([, territoryName]) => territoryName === name)?.[0];
    });
    expect(actualTerritoryIds).toEqual(expectedTerritoryIds[index]);
  }
});

it("explains the point breakdown from the award box help toggle", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist();

  const award = await screen.findByRole("region", { name: "추천 원정 예상 포인트" });
  expect(within(award).queryByText("방문 기본", { selector: "strong" })).not.toBeInTheDocument();

  const help = within(award).getByRole("button", { name: "포인트 계산 방식 보기" });
  expect(help).toHaveAttribute("aria-expanded", "false");
  await user.click(help);

  expect(help).toHaveAttribute("aria-expanded", "true");
  const note = document.getElementById("tactical-award-help")!;
  expect(award).toContainElement(note);
  // The thresholds and values come from GAME_RULES, so the copy cannot drift.
  expect(note).toHaveTextContent(`${GAME_RULES.dwellLongMinutes}분 이상 머물면 ${GAME_RULES.dwell60Minutes}P`);
  expect(note).toHaveTextContent(`지역 가게에서 쓴 내역을 인증하면 ${GAME_RULES.localSpend}P`);
  expect(note).toHaveTextContent(`숙박을 인증하면 ${GAME_RULES.accommodation}P`);
  expect(note).toHaveTextContent(`씨앗 +${GAME_RULES.strongholdVisitBonus}P`);
  expect(note).toHaveTextContent(`하루 상한은 ${GAME_RULES.dailyCap.toLocaleString()}P`);

  await user.click(help);
  expect(help).toHaveAttribute("aria-expanded", "false");
  expect(document.getElementById("tactical-award-help")).toBeNull();
});

it("explains the impact figures from their own help toggle", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist();

  const impact = await screen.findByRole("region", { name: "부산 추천 원정 영향" });
  const help = within(impact).getByRole("button", { name: "영향 지표 설명 보기" });
  expect(help).toHaveAttribute("aria-expanded", "false");

  await user.click(help);

  const note = document.getElementById("tactical-impact-help")!;
  expect(impact).toContainElement(note);
  // Each term repeats a label rendered in the same box.
  expect(within(note).getByText("지역균형 보너스")).toBeVisible();
  expect(within(note).getByText("영토 영향")).toBeVisible();
  expect(within(note).getByText("팬덤 순위 영향")).toBeVisible();
  expect(note).toHaveTextContent("소유자를 넘어서면 점령 예상");
  expect(note).toHaveTextContent("거점 수를 먼저 보고, 같으면 유효 포인트로 갈립니다");

  // The two help toggles are independent.
  expect(within(impact).getByRole("button", { name: "영향 지표 설명 보기" })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "포인트 계산 방식 보기" })).toHaveAttribute("aria-expanded", "false");

  await user.click(help);
  expect(document.getElementById("tactical-impact-help")).toBeNull();
});

it("reports a started route as in progress on the tactical panel", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist({ selectedArtistId: "blackpink", selectedTerritoryId: "gunpo" });

  await user.click(within(await screen.findByRole("complementary", { name: "군포 전술 패널" }))
    .getByRole("button", { name: "원정 시작" }));

  expect(within(screen.getByRole("complementary", { name: "군포 전술 패널" }))
    .getByRole("button", { name: "원정 중" })).toBeVisible();
});

it("pages the tactical panel through the listed territories", async () => {
  const user = userEvent.setup();
  // BLINK owns exactly two territories, so the pager holds two pages.
  renderPreviewWithArtist({ selectedArtistId: "blackpink", selectedTerritoryId: "gunpo" });

  const panel = await screen.findByRole("complementary", { name: "군포 전술 패널" });
  expect(within(panel).getAllByRole("button", { name: /번째 영토 보기$/ })).toHaveLength(2);
  expect(within(panel).getAllByRole("button", { name: /번째 영토 보기$/ })[0]).toHaveAttribute("aria-current", "true");
  expect(within(panel).getByRole("button", { name: "이전 영토" })).toBeDisabled();

  await user.click(within(panel).getByRole("button", { name: "다음 영토" }));

  const next = await screen.findByRole("complementary", { name: "성남 전술 패널" });
  expect(within(next).getByRole("heading", { name: "성남" })).toBeVisible();
  expect(within(next).getAllByRole("button", { name: /번째 영토 보기$/ })[1]).toHaveAttribute("aria-current", "true");
  expect(within(next).getByRole("button", { name: "다음 영토" })).toBeDisabled();

  // A dot jumps straight back to its territory.
  await user.click(within(next).getAllByRole("button", { name: /번째 영토 보기$/ })[0]);
  expect(await screen.findByRole("complementary", { name: "군포 전술 패널" })).toBeVisible();
});

it("hides the pager while a single territory is listed", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist({ selectedArtistId: "seventeen", selectedTerritoryId: "namyangju" });

  const panel = await screen.findByRole("complementary", { name: "남양주 전술 패널" });
  expect(within(panel).queryByRole("button", { name: "다음 영토" })).not.toBeInTheDocument();
  expect(within(panel).queryByRole("button", { name: /번째 영토 보기$/ })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "전체" }));

  // Past a dozen territories the dots give way to a plain position readout.
  const widened = await screen.findByRole("complementary", { name: "남양주 전술 패널" });
  expect(within(widened).getByRole("button", { name: "다음 영토" })).toBeInTheDocument();
  expect(within(widened).queryByRole("button", { name: /번째 영토 보기$/ })).not.toBeInTheDocument();
  expect(within(widened).getByRole("status")).toHaveTextContent(/^\d+ \/ 23$/);
});

it("pages the panel with a horizontal swipe but leaves vertical drags alone", async () => {
  renderPreviewWithArtist({ selectedArtistId: "blackpink", selectedTerritoryId: "gunpo" });

  const panel = await screen.findByRole("complementary", { name: "군포 전술 패널" });
  fireEvent.touchStart(panel, { touches: [{ clientX: 200, clientY: 100 }] });
  fireEvent.touchEnd(panel, { changedTouches: [{ clientX: 176, clientY: 300 }] });
  expect(screen.getByRole("complementary", { name: "군포 전술 패널" })).toBeVisible();

  const beforeSwipe = screen.getByRole("complementary", { name: "군포 전술 패널" });
  fireEvent.touchStart(beforeSwipe, { touches: [{ clientX: 240, clientY: 120 }] });
  fireEvent.touchEnd(beforeSwipe, { changedTouches: [{ clientX: 120, clientY: 132 }] });
  expect(await screen.findByRole("complementary", { name: "성남 전술 패널" })).toBeVisible();

  // Swiping past the last territory stays put.
  const last = screen.getByRole("complementary", { name: "성남 전술 패널" });
  fireEvent.touchStart(last, { touches: [{ clientX: 240, clientY: 120 }] });
  fireEvent.touchEnd(last, { changedTouches: [{ clientX: 120, clientY: 120 }] });
  expect(screen.getByRole("complementary", { name: "성남 전술 패널" })).toBeVisible();
});

it("blocks another territory's expedition until the running one ends", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist({ selectedArtistId: "blackpink", selectedTerritoryId: "gunpo" });

  await user.click(within(await screen.findByRole("complementary", { name: "군포 전술 패널" }))
    .getByRole("button", { name: "원정 시작" }));
  await user.click(within(screen.getByRole("complementary", { name: "군포 전술 패널" }))
    .getByRole("button", { name: "다음 영토" }));

  const seongnam = await screen.findByRole("complementary", { name: "성남 전술 패널" });
  expect(within(seongnam).getByRole("button", { name: "다른 원정 진행 중" })).toBeDisabled();
  expect(within(seongnam).getByText("진행 중인 원정을 종료해야 다른 지역 원정을 시작할 수 있어요.")).toBeVisible();
});

it("keeps the filters in the map action row and the camera reset out of it without a map", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist();

  const filters = await screen.findByRole("group", { name: "영토 필터" });
  const actions = filters.closest(".preview-map-actions");
  expect(actions).not.toBeNull();
  // The filter group sits with the map controls rather than above the map.
  expect(document.querySelector(".preview-page-title ~ .map-filters")).toBeNull();
  expect(within(actions!).queryByRole("button", { name: "전국 보기" })).not.toBeInTheDocument();

  // Filtering still drives the list under it.
  await user.click(within(filters).getByRole("button", { name: "전체" }));
  const list = screen.getByRole("list", { name: "지도와 같은 영토 목록" });
  expect(within(list).getAllByRole("button")).toHaveLength(23);
});

it("renders the summary cards above the map", async () => {
  renderPreviewWithArtist();

  const summary = await screen.findByRole("region", { name: "내 팬덤 영토 요약" });
  const list = screen.getByRole("list", { name: "지도와 같은 영토 목록" });
  // The four cards head the page, with the map block underneath them.
  expect(summary.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("puts the territory list behind a toggle once it runs long", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist();

  await user.click(await screen.findByRole("button", { name: "전체" }));

  const list = screen.getByRole("list", { name: "지도와 같은 영토 목록" });
  const toggle = screen.getByRole("button", { name: "지역 더 보기" });
  // The collapse is a phone affordance, so every row stays in the document.
  expect(list).toHaveClass("collapsed");
  expect(toggle).toHaveAttribute("aria-controls", list.id);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  // It sits between the filter row and the list it controls.
  expect(toggle.previousElementSibling).toHaveClass("preview-map-actions");
  expect(toggle.nextElementSibling).toBe(list);

  // The control is an arrow; its purpose lives in the label.
  expect(toggle).toHaveTextContent("");

  const scrollBy = vi.fn();
  vi.stubGlobal("scrollBy", scrollBy);
  await user.click(toggle);

  expect(list).not.toHaveClass("collapsed");
  expect(scrollBy).toHaveBeenCalledWith({ top: 210, behavior: "smooth" });

  // Collapsing leaves the page where it is.
  scrollBy.mockClear();
  await user.click(screen.getByRole("button", { name: "지역 접기" }));
  expect(scrollBy).not.toHaveBeenCalled();
});

it("offers the filters as a select as well as the tag row", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist();

  const filters = await screen.findByRole("group", { name: "영토 필터" });
  const select = within(filters).getByRole("combobox", { name: "영토 필터" });
  // The select is the phone control; the tag row stays for wider screens.
  expect(select).toHaveValue("my_fandom");
  expect(within(filters).getByRole("button", { name: "전체" })).toBeInTheDocument();

  await user.selectOptions(select, "all");

  expect(select).toHaveValue("all");
  expect(within(screen.getByRole("list", { name: "지도와 같은 영토 목록" })).getAllByRole("button")).toHaveLength(23);
});

it("brings the map into view when a summary card is used", async () => {
  const user = userEvent.setup();
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  renderPreviewWithArtist();

  await user.click(within(await screen.findByRole("region", { name: "내 팬덤 영토 요약" }))
    .getAllByRole("button")[0]);

  expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
});

it("labels a public route without borrowing the artist connection story", async () => {
  // BLINK has no artist-linked route, so every territory falls back to a public one.
  renderPreviewWithArtist({ selectedArtistId: "blackpink", selectedTerritoryId: "gunpo" });

  const panel = await screen.findByRole("complementary", { name: "군포 전술 패널" });
  expect(within(panel).getByText("지역의 공공 관광 코스")).toBeVisible();
  expect(within(panel).getByText("공식 관광 출처 기반 공공 원정 · 아티스트 직접 연관 없음")).toBeVisible();
  expect(within(panel).queryByText(/지역 연결 스토리/)).not.toBeInTheDocument();

  // The source is a corner link now, not a disclosure.
  const source = within(panel).getByRole("link", { name: "출처 확인" });
  expect(source).toHaveClass("tactical-source");
  expect(within(panel).queryByText("추천 근거 보기")).not.toBeInTheDocument();

  // The stronghold-growth note sits on its own line under the defence gap.
  const gap = within(panel).getByText(/^방어 우위 \d+P$/);
  expect(gap.nextElementSibling).toHaveTextContent(/거점 성장까지|최고 단계 방어 중/);
});

it("sets the balance multiplier beside the stronghold mark", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist();
  await user.click(await screen.findByRole("button", { name: "전체" }));

  const list = screen.getByRole("list", { name: "지도와 같은 영토 목록" });
  // Yeongwol is the one territory carrying a population-decline multiplier.
  const yeongwol = within(list).getByRole("button", { name: /^영월/ });
  const multiplier = within(yeongwol).getByText("1.8×");
  expect(multiplier).toHaveClass("territory-multiplier");
  // It shares the stronghold row instead of adding one of its own.
  expect(multiplier.previousElementSibling).toHaveAttribute("role", "img");
  expect(within(yeongwol).getByText(/방어 우위|탈환까지/)).toHaveClass("territory-gap");
});

it("clears the tactical panel when the selected territory is picked again", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist();

  expect(await screen.findByRole("complementary", { name: "부산 전술 패널" })).toBeVisible();
  const list = screen.getByRole("list", { name: "지도와 같은 영토 목록" });
  const busan = within(list).getByRole("button", { name: /^부산/ });
  expect(busan).toHaveAttribute("aria-pressed", "true");

  await user.click(busan);

  // Deselecting puts the panel away and gives the map the whole row.
  expect(busan).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByRole("complementary", { name: /전술 패널$/ })).not.toBeInTheDocument();
  expect(document.querySelector(".preview-map-layout")).toHaveClass("preview-map-layout--solo");

  await user.click(busan);
  expect(screen.getByRole("complementary", { name: "부산 전술 패널" })).toBeVisible();
});

it("collapses the tactical card from its own chevron", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist();

  const panel = await screen.findByRole("complementary", { name: "부산 전술 패널" });
  // The fandom line is gone; the territory name carries the header alone.
  expect(within(panel).getByRole("heading", { name: "부산" }).parentElement)
    .not.toHaveTextContent("ARMY");

  const collapse = within(panel).getByRole("button", { name: "영토 카드 접기" });
  expect(collapse).toHaveAttribute("aria-expanded", "true");
  expect(within(panel).getByRole("button", { name: "원정 시작" })).toBeVisible();

  await user.click(collapse);

  expect(within(panel).queryByRole("button", { name: "원정 시작" })).not.toBeInTheDocument();
  expect(document.getElementById("tactical-panel-body")).toBeNull();

  await user.click(within(panel).getByRole("button", { name: "영토 카드 펼치기" }));
  expect(within(panel).getByRole("button", { name: "원정 시작" })).toBeVisible();
});

it("slides the tactical card in from the side it was paged from", async () => {
  const user = userEvent.setup();
  renderPreviewWithArtist({ selectedArtistId: "blackpink", selectedTerritoryId: "gunpo" });

  const panel = await screen.findByRole("complementary", { name: "군포 전술 패널" });
  expect(document.getElementById("tactical-panel-body")).not.toHaveClass("slide-next");

  await user.click(within(panel).getByRole("button", { name: "다음 영토" }));

  expect(document.getElementById("tactical-panel-body")).toHaveClass("slide-next");

  await user.click(within(screen.getByRole("complementary", { name: "성남 전술 패널" }))
    .getByRole("button", { name: "이전 영토" }));

  expect(document.getElementById("tactical-panel-body")).toHaveClass("slide-previous");
});
