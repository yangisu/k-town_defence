import { expect, it } from "vitest";
import { copy } from "@/features/team-preview/i18n";

it("keeps Korean and English key sets identical", () => {
  expect(Object.keys(copy.en).sort()).toEqual(Object.keys(copy.ko).sort());
  expect(copy.ko.navTerritory).toBe("영토 지도");
  expect(copy.en.navTerritory).toBe("Territory Map");
});
