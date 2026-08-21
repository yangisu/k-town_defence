import { describe, expect, it } from "vitest";
import { services } from "@/lib/demo-services";

describe("demo service contracts", () => {
  it("returns tourism places and an expedition for the selected region", async () => {
    const region = await services.tourism.getRegion("busan");
    const places = await services.tourism.listPlaces({ regionId: "busan" });
    const expeditions = await services.expeditions.listByRegion("busan");

    expect(region.nameKo).toBe("부산");
    expect(places.map((place) => place.category)).toEqual(
      expect.arrayContaining(["kpop", "culture", "local_food"]),
    );
    expect(expeditions[0].stopIds.length).toBeGreaterThanOrEqual(3);
  });

  it("returns clones so a screen cannot mutate shared fixtures", async () => {
    const first = await services.tourism.listRegions();
    first[0].nameKo = "변경됨";
    const second = await services.tourism.listRegions();
    expect(second[0].nameKo).not.toBe("변경됨");
  });
});
