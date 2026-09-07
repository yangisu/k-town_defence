import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { StrongholdMark } from "@/components/team-preview/stronghold-mark";

it.each([
  ["seed" as const, "Seed stronghold"],
  ["tree" as const, "Tree stronghold"],
  ["landmark" as const, "Landmark stronghold"],
])("renders the %s stronghold at the shared marker diameter", (stage, accessibleName) => {
  // Every stage reserves the same space; the label and owner colour tell them apart.
  const diameter = "18px";
  render(<StrongholdMark stage={stage} locale="en" ownerColor="#f28a45" />);

  const mark = screen.getByRole("img", { name: accessibleName });
  expect(mark).toHaveStyle({ "--owner-color": "#f28a45" });
  expect(mark.querySelector(".stronghold-silhouette")).toHaveStyle({ "--marker-size": diameter });
});

it.each([
  ["seed" as const, "Seed stronghold"],
  ["tree" as const, "Tree stronghold"],
  ["landmark" as const, "Landmark stronghold"],
])("draws the %s stronghold as a glyph tinted by the owner", (stage, accessibleName) => {
  render(<StrongholdMark stage={stage} locale="en" ownerColor="#f28a45" />);

  const silhouette = screen.getByRole("img", { name: accessibleName }).querySelector(".stronghold-silhouette")!;
  const glyph = silhouette.querySelector("svg");
  // Each stage has its own drawing, filled with the inherited owner colour.
  expect(glyph).not.toBeNull();
  expect(glyph).toHaveAttribute("fill", "currentColor");
  expect(glyph!.querySelectorAll("path, rect").length).toBeGreaterThan(0);
});
