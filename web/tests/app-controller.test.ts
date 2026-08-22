import { describe, expect, it } from "vitest";
import { appReducer, initialAppState, openExpedition } from "@/features/app-controller";

describe("app controller", () => {
  it("opens an expedition from a selected region and returns to exploration", () => {
    const selected = appReducer(initialAppState, openExpedition("busan", "busan-coast-defense"));
    expect(selected).toMatchObject({
      activeTab: "expedition",
      selectedRegionId: "busan",
      selectedExpeditionId: "busan-coast-defense",
    });
    expect(appReducer(selected, { type: "changeTab", tab: "explore" }).activeTab).toBe(
      "explore",
    );
  });
});
