import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { TerritoryStandings } from "@/components/team-preview/territory-standings";
import { previewContent } from "@/features/team-preview/content";
import type { PreviewTerritory } from "@/features/team-preview/types";

const busan = previewContent.territories.find((territory) => territory.id === "busan") as PreviewTerritory;

it("opens folded and ranks only the fandoms that have scored", async () => {
  const territory: PreviewTerritory = {
    ...busan,
    standings: [
      { artistId: "blackpink", fandomName: "BLINK", validPoints: 0 },
      { artistId: "bts", fandomName: "ARMY", validPoints: 840 },
      { artistId: "boynextdoor", fandomName: "ONEDOOR", validPoints: 3600 },
      { artistId: "seventeen", fandomName: "CARAT", validPoints: 0 },
    ],
  };
  render(<TerritoryStandings territory={territory} locale="ko" selectedArtistId="bts" />);

  const toggle = screen.getByRole("button", { name: "영토 현황" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("list")).not.toBeInTheDocument();

  await userEvent.setup().click(toggle);
  const rows = within(screen.getByRole("list")).getAllByRole("listitem");
  expect(rows.map((row) => row.textContent)).toEqual([
    expect.stringContaining("ONEDOOR"),
    expect.stringContaining("ARMY"),
  ]);
  expect(screen.queryByText("BLINK")).not.toBeInTheDocument();
  expect(screen.queryByText("CARAT")).not.toBeInTheDocument();
});

it("says so when no fandom has scored yet, instead of a list of zeros", async () => {
  const territory: PreviewTerritory = {
    ...busan,
    standings: [{ artistId: "bts", fandomName: "ARMY", validPoints: 0 }],
  };
  render(<TerritoryStandings territory={territory} locale="ko" selectedArtistId="bts" />);

  await userEvent.setup().click(screen.getByRole("button", { name: "영토 현황" }));
  expect(screen.getByText("아직 점수를 얻은 팬덤이 없어요")).toBeVisible();
  expect(screen.queryByText("0P")).not.toBeInTheDocument();
});
