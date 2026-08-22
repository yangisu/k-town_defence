import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { RankingView } from "@/components/team-preview/ranking-view";
import { createInitialDemoSession, demoSessionReducer } from "@/features/team-preview/demo-session";
import type { MissionAward } from "@/features/team-preview/game-rules";
import type { FandomStanding } from "@/features/team-preview/types";

it("keeps strongholds ahead of points and shows the selected fandom's exact next-rank gap", () => {
  const initial = createInitialDemoSession();
  const fandoms: FandomStanding[] = [
    { artistId: "bts", fandomName: "ARMY", strongholds: 3, validPoints: 8_000, trend: "up" },
    { artistId: "blackpink", fandomName: "BLINK", strongholds: 4, validPoints: 100, trend: "down" },
    { artistId: "seventeen", fandomName: "CARAT", strongholds: 1, validPoints: 1_200, trend: "same" },
  ];
  const territories = initial.territories.slice(0, 3).map((territory, index) => ({
    ...territory,
    standings: index === 0
      ? [
          { artistId: "bts" as const, fandomName: "ARMY", validPoints: 920 },
          { artistId: "blackpink" as const, fandomName: "BLINK", validPoints: 840 },
        ]
      : index === 1
        ? [
            { artistId: "bts" as const, fandomName: "ARMY", validPoints: 700 },
            { artistId: "blackpink" as const, fandomName: "BLINK", validPoints: 690 },
          ]
        : [
            { artistId: "bts" as const, fandomName: "ARMY", validPoints: 640 },
            { artistId: "blackpink" as const, fandomName: "BLINK", validPoints: 600 },
          ],
  }));

  render(
    <RankingView
      locale="ko"
      fandoms={fandoms}
      territories={territories}
      selectedArtistId="bts"
    />,
  );

  const leaderboard = screen.getByRole("list", { name: "팬덤 랭킹" });
  const rows = within(leaderboard).getAllByRole("listitem");
  expect(rows[0]).toHaveTextContent("#1");
  expect(rows[0]).toHaveTextContent("블랙핑크 · BLINK");
  expect(rows[0]).toHaveTextContent("거점 4개");
  expect(rows[0]).toHaveTextContent("100P");
  expect(rows[0]).toHaveTextContent("하락");
  expect(rows[1]).toHaveAttribute("aria-current", "true");
  expect(rows[1]).toHaveTextContent("방탄소년단 · ARMY");
  expect(rows[1]).toHaveTextContent("거점 3개");
  expect(rows[1]).toHaveTextContent("8,000P");
  expect(rows[1]).toHaveTextContent("상승");

  expect(screen.getByRole("region", { name: "다음 순위까지" }))
    .toHaveTextContent("거점 1개 더 확보");

  const contested = within(screen.getByRole("list", { name: "접전 중" })).getAllByRole("listitem");
  expect(contested.map((item) => item.textContent)).toEqual([
    expect.stringContaining("대구 · 10P 차이"),
    expect.stringContaining("광주 · 40P 차이"),
    expect.stringContaining("부산 · 80P 차이"),
  ]);
});

it("excludes a territory once mission impact widens its gap beyond the shared contested limit", () => {
  const initial = createInitialDemoSession();
  const territories = initial.territories.slice(0, 3).map((territory, index) => ({
    ...territory,
    standings: index === 0
      ? [
          { artistId: "bts" as const, fandomName: "ARMY", validPoints: 920 },
          { artistId: "blackpink" as const, fandomName: "BLINK", validPoints: 840 },
        ]
      : index === 1
        ? [
            { artistId: "bts" as const, fandomName: "ARMY", validPoints: 700 },
            { artistId: "blackpink" as const, fandomName: "BLINK", validPoints: 690 },
          ]
        : [
            { artistId: "bts" as const, fandomName: "ARMY", validPoints: 640 },
            { artistId: "blackpink" as const, fandomName: "BLINK", validPoints: 600 },
          ],
  }));
  const award: MissionAward = {
    visit: 260,
    dwell: 0,
    localSpend: 0,
    accommodation: 0,
    subtotal: 260,
    multiplier: 1,
    validPoints: 260,
    cappedPoints: 260,
  };
  const afterMission = demoSessionReducer(
    { ...initial, territories },
    { type: "completeMission", missionId: "busan-1", award },
  );

  render(
    <RankingView
      locale="ko"
      fandoms={afterMission.fandoms}
      territories={afterMission.territories}
      selectedArtistId="bts"
    />,
  );

  const contested = within(screen.getByRole("list", { name: "접전 중" })).getAllByRole("listitem");
  expect(contested.map((item) => item.textContent)).toEqual([
    expect.stringContaining("대구 · 10P 차이"),
    expect.stringContaining("광주 · 40P 차이"),
  ]);
  expect(within(screen.getByRole("list", { name: "접전 중" })).queryByText(/부산/)).not.toBeInTheDocument();
});
