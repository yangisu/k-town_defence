import { expect, it } from "vitest";
import { strongholdColor, strongholdRadius, territoryBounds } from "@/features/team-preview/map-presentation";

const gwangjuPolygon = {
  type: "Feature" as const,
  properties: { id: "gwangju" },
  geometry: {
    type: "Polygon" as const,
    coordinates: [[[126.7, 35.0], [127.0, 35.0], [127.0, 35.3], [126.7, 35.3], [126.7, 35.0]]],
  },
};

it("sizes strongholds by stage and derives a polygon viewport", () => {
  expect(strongholdRadius("seed")).toBe(7);
  expect(strongholdRadius("tree")).toBe(11);
  expect(strongholdRadius("landmark")).toBe(16);
  expect(territoryBounds(gwangjuPolygon)).toEqual([[126.7, 35.0], [127.0, 35.3]]);
});

it("keeps the owner color independent of stronghold stage", () => {
  const colors = { bts: "#7c5ce0" };
  expect(["seed", "tree", "landmark"].map((stage) => strongholdColor("bts", stage, colors)))
    .toEqual(["#7c5ce0", "#7c5ce0", "#7c5ce0"]);
});

it("returns no viewport for invalid or empty geometry", () => {
  expect(territoryBounds({ type: "Feature", properties: {}, geometry: null })).toBeNull();
  expect(territoryBounds({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [] } })).toBeNull();
  expect(territoryBounds({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[["east", 35]]]} })).toBeNull();
});
