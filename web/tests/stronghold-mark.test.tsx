import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { StrongholdMark } from "@/components/team-preview/stronghold-mark";

it.each([
  ["seed" as const, "14px", "Seed stronghold"],
  ["tree" as const, "22px", "Tree stronghold"],
  ["landmark" as const, "32px", "Landmark stronghold"],
])("renders the %s stronghold at the exact stage diameter", (stage, diameter, accessibleName) => {
  render(<StrongholdMark stage={stage} locale="en" ownerColor="#f28a45" />);

  const mark = screen.getByRole("img", { name: accessibleName });
  expect(mark).toHaveStyle({ "--owner-color": "#f28a45" });
  expect(mark.querySelector(".stronghold-silhouette")).toHaveStyle({ "--marker-size": diameter });
});
