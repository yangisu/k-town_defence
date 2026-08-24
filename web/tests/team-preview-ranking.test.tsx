import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { RankingView } from "@/components/team-preview/ranking-view";
import { createInitialDemoSession } from "@/features/team-preview/demo-session";
import type { FandomStanding, Locale, PreviewTerritory } from "@/features/team-preview/types";

const rankingCss = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8").replace(/\s+/g, "");

function resolvedPaletteColor(token: string) {
  if (!token.startsWith("--")) return "";
  const palette = rankingCss.match(/:root\{([^}]*)\}/)?.[1] ?? "";
  return palette.match(new RegExp(`${token}:(#[0-9a-f]{6})`))?.[1] ?? "";
}

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  return channels.reduce((sum, channel, index) => {
    const linear = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
}

function contrastRatio(foreground: string, background: string) {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const fandoms: FandomStanding[] = [
  { artistId: "bts", fandomName: "ARMY", strongholds: 4, validPoints: 8_000, trend: "up" },
  { artistId: "blackpink", fandomName: "BLINK", strongholds: 4, validPoints: 100, trend: "down" },
  { artistId: "seventeen", fandomName: "CARAT", strongholds: 1, validPoints: 1_200, trend: "same" },
];

function contestedTerritories(): PreviewTerritory[] {
  return createInitialDemoSession().territories.slice(0, 1).map((territory) => ({
    ...territory,
    ownerArtistId: "bts",
    standings: [
      { artistId: "bts", fandomName: "ARMY", validPoints: 920 },
      { artistId: "blackpink", fandomName: "BLINK", validPoints: 840 },
    ],
  }));
}

const localeCopy: Record<Locale, {
  artist: string;
  myFandom: string;
  firstRank: string;
  leaderboard: string;
  progress: string;
  contested: string;
  owner: string;
  challenger: string;
  inspect: string;
}> = {
  ko: {
    artist: "방탄소년단",
    myFandom: "내 팬덤 · ARMY",
    firstRank: "팬덤 순위 1위",
    leaderboard: "팬덤 랭킹",
    progress: "순위 목표 진행률",
    contested: "접전 중",
    owner: "점유 팬덤",
    challenger: "도전 팬덤",
    inspect: "부산 영토 자세히 보기",
  },
  en: {
    artist: "BTS",
    myFandom: "My fandom · ARMY",
    firstRank: "Fandom rank #1",
    leaderboard: "Fandom ranking",
    progress: "Ranking goal progress",
    contested: "Contested now",
    owner: "Owner",
    challenger: "Challenger",
    inspect: "Inspect Busan territory",
  },
};

it("keeps selected-fandom text at AA contrast while preserving artist-color ranking accents", () => {
  const selectedLabel = [...rankingCss.matchAll(/\.ranking-row-identityspan\{([^}]*)\}/g)].at(-1)?.[1] ?? "";
  const foregroundToken = selectedLabel.match(/color:var\((--[a-z-]+)\)/)?.[1] ?? "";

  expect(contrastRatio(resolvedPaletteColor(foregroundToken), resolvedPaletteColor("--paper"))).toBeGreaterThanOrEqual(4.5);
  expect(selectedLabel).not.toContain("--artist-color");
  expect(rankingCss).toMatch(/\.ranking-leaderboardli\.selected\{[^}]*border-color:var\(--artist-color\)/);
  expect(rankingCss).toMatch(/\.ranking-stronghold-barprogress\{[^}]*accent-color:var\(--artist-color\)/);
});

for (const locale of ["ko", "en"] as const) {
  it(`presents a localized, actionable ranking dashboard in ${locale}`, async () => {
    const user = userEvent.setup();
    const onInspectTerritory = vi.fn();
    const copy = localeCopy[locale];
    render(
      <RankingView
        locale={locale}
        fandoms={fandoms}
        territories={contestedTerritories()}
        selectedArtistId="bts"
        onInspectTerritory={onInspectTerritory}
      />,
    );

    const podium = screen.getByRole("list", { name: /podium|포디움/i });
    const podiumCards = within(podium).getAllByRole("listitem");
    expect(podiumCards).toHaveLength(3);
    expect(podiumCards[0]).toHaveTextContent(copy.firstRank);
    expect(podiumCards[0]).toHaveTextContent(`${copy.artist} · ARMY`);
    expect(podiumCards[0]).toHaveTextContent("4");
    expect(podiumCards[0]).toHaveTextContent("8,000P");
    expect(podiumCards[0]).toHaveTextContent(locale === "ko" ? "상승" : "Up");
    expect(podiumCards[0]).toHaveStyle({ "--artist-color": "#7c5ce0" });

    const goal = screen.getByRole("region", { name: copy.myFandom });
    expect(goal).toHaveTextContent(copy.myFandom);
    expect(goal).toHaveTextContent(locale === "ko" ? "1위 방어 중" : "Defending first place");
    expect(within(goal).getByRole("progressbar", { name: copy.progress })).toHaveAttribute("aria-valuenow", "1");

    const leaderboard = screen.getByRole("list", { name: copy.leaderboard });
    const rows = within(leaderboard).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent(`${copy.artist} · ARMY`);
    expect(rows[0]).toHaveAttribute("aria-current", "true");
    expect(within(rows[0]).getByRole("progressbar", { name: /strongholds|거점/i })).toHaveAttribute("aria-valuemax", "4");
    expect(within(rows[2]).getByRole("progressbar", { name: /strongholds|거점/i })).toHaveAttribute("aria-valuenow", "1");

    const contested = screen.getByRole("list", { name: copy.contested });
    const territoryAction = within(contested).getByRole("button", { name: copy.inspect });
    expect(territoryAction).toHaveTextContent(copy.owner);
    expect(territoryAction).toHaveTextContent(copy.challenger);
    expect(territoryAction).toHaveTextContent("80P");
    await user.click(territoryAction);
    expect(onInspectTerritory).toHaveBeenCalledWith("busan");
  });
}

it.each([0, 1, 2])("renders only the %i available podium entries", (available) => {
  render(
    <RankingView
      locale="en"
      fandoms={fandoms.slice(0, available)}
      territories={[]}
      selectedArtistId={available > 0 ? "bts" : null}
      onInspectTerritory={() => undefined}
    />,
  );

  expect(within(screen.getByRole("list", { name: "Top three podium" })).queryAllByRole("listitem")).toHaveLength(available);
});

it("orders the podium and leaderboard by strongholds before valid points", () => {
  render(
    <RankingView
      locale="en"
      fandoms={[
        { artistId: "bts", fandomName: "ARMY", strongholds: 3, validPoints: 8_000, trend: "up" },
        { artistId: "blackpink", fandomName: "BLINK", strongholds: 4, validPoints: 100, trend: "down" },
      ]}
      territories={[]}
      selectedArtistId="bts"
      onInspectTerritory={() => undefined}
    />,
  );

  expect(within(screen.getByRole("list", { name: "Top three podium" })).getAllByRole("listitem")[0]).toHaveTextContent("BLACKPINK · BLINK");
  expect(within(screen.getByRole("list", { name: "Fandom ranking" })).getAllByRole("listitem")[0]).toHaveTextContent("BLACKPINK · BLINK");
});

it("uses the valid-points tie-break to set a lower-ranked fandom's next stronghold goal", () => {
  render(
    <RankingView
      locale="en"
      fandoms={[
        { artistId: "blackpink", fandomName: "BLINK", strongholds: 4, validPoints: 100, trend: "down" },
        { artistId: "bts", fandomName: "ARMY", strongholds: 3, validPoints: 8_000, trend: "up" },
      ]}
      territories={[]}
      selectedArtistId="bts"
      onInspectTerritory={() => undefined}
    />,
  );

  const goal = screen.getByRole("region", { name: "My fandom · ARMY" });
  expect(goal).toHaveTextContent("1 more strongholds needed");
  expect(within(goal).getByRole("progressbar", { name: "Ranking goal progress" })).toHaveAttribute("aria-valuenow", "0.75");
});

it("requires one more stronghold when a lower-ranked fandom would lose the valid-points tie-break", () => {
  render(
    <RankingView
      locale="en"
      fandoms={[
        { artistId: "blackpink", fandomName: "BLINK", strongholds: 4, validPoints: 8_000, trend: "down" },
        { artistId: "bts", fandomName: "ARMY", strongholds: 3, validPoints: 100, trend: "up" },
      ]}
      territories={[]}
      selectedArtistId="bts"
      onInspectTerritory={() => undefined}
    />,
  );

  const goal = screen.getByRole("region", { name: "My fandom · ARMY" });
  expect(goal).toHaveTextContent("2 more strongholds needed");
  expect(within(goal).getByRole("progressbar", { name: "Ranking goal progress" })).toHaveAttribute("aria-valuenow", "0.6");
});
