import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ArtistSelector } from "@/components/team-preview/artist-drawer";
import { artistProfileForFandom } from "@/features/team-preview/fandom-artists";
import { previewContent } from "@/features/team-preview/content";

const armyFandom = { id: "10000000-0000-4000-8000-000000000001", name: "ARMY", artistName: "방탄소년단" };
const namedFandom = { id: "c0ffee00-0000-4000-8000-000000000009", name: "MOONLIGHT", artistName: "달빛소년단" };

it("resolves a catalogued fandom to its documented artist", () => {
  const profile = artistProfileForFandom(armyFandom);

  expect(profile).toBe(previewContent.artists.find((artist) => artist.id === "bts"));
});

it("builds an artist for a fandom a member named, keyed on the fandom so it survives a reload", () => {
  const profile = artistProfileForFandom(namedFandom);

  expect(profile.id).toBe(`fandom:${namedFandom.id}`);
  expect(profile.artistName.ko).toBe("달빛소년단");
  expect(profile.fandomName).toBe("MOONLIGHT");
  expect(profile.representativeTerritoryIds).toEqual([]);
  expect(profile.color).toMatch(/^#[0-9a-f]{6}$/);
  // Same fandom, same colour, every time — a fandom that changed colour on
  // each load would read as a different one.
  expect(artistProfileForFandom(namedFandom).color).toBe(profile.color);
});

it("offers only the season's fandoms, and adds one the season does not carry", async () => {
  const user = userEvent.setup();
  const onAddArtist = vi.fn().mockResolvedValue(undefined);
  const roster = [armyFandom, namedFandom].map(artistProfileForFandom);

  render(
    <ArtistSelector
      locale="ko"
      selectedArtistId={null}
      roster={roster}
      confirmLabel="이 팬덤 추가"
      onAddArtist={onAddArtist}
      onSelect={() => undefined}
      onConfirm={() => undefined}
    />,
  );

  // The catalog has fifteen artists; the season here holds two.
  expect(screen.getByText("ARMY")).toBeVisible();
  expect(screen.getByText("MOONLIGHT")).toBeVisible();
  expect(screen.queryByText("BLINK")).not.toBeInTheDocument();

  await user.type(screen.getByRole("searchbox"), "라이즈");
  await user.click(screen.getByRole("button", { name: /직접 추가하기/ }));
  // What they searched for is what they were looking for, so it is already in.
  expect(screen.getByLabelText("아티스트 이름")).toHaveValue("라이즈");
  await user.type(screen.getByLabelText("팬덤 이름"), "BRIIZE");
  await user.click(screen.getByRole("button", { name: "추가하고 선택" }));

  await waitFor(() => expect(onAddArtist).toHaveBeenCalledWith("BRIIZE", "라이즈"));
});
