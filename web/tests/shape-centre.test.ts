import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { shapeCentre } from "@/features/team-preview/shape-centre";

const territories = JSON.parse(
  readFileSync(resolve(process.cwd(), "public/data/preview-territories.geojson"), "utf8"),
) as { features: { id: string; geometry: { type: string; coordinates: number[][][] | number[][][][] } }[] };

type Ring = number[][];
const insideRing = (point: number[], ring: Ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[j];
    if ((ay > point[1]) !== (by > point[1])
      && point[0] < ((bx - ax) * (point[1] - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
};
const insideFeature = (point: number[], geometry: { type: string; coordinates: unknown }) => {
  const polygons = (geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates) as Ring[][];
  return polygons.some(([outer, ...holes]) => insideRing(point, outer)
    && !holes.some((hole) => insideRing(point, hole)));
};

it("puts every territory's mark inside the territory itself", () => {
  const outside = territories.features.filter((feature) => {
    const centre = shapeCentre(feature);
    return !centre || !insideFeature([centre.longitude, centre.latitude], feature.geometry);
  });
  expect(outside.map((feature) => feature.id)).toEqual([]);
});

it("keeps the mark off a territory's edge, well inside its body", () => {
  // A mark on the coast reads as belonging to the water beside it.
  const incheon = territories.features.find((feature) => feature.id === "incheon");
  const centre = shapeCentre(incheon);
  // Not the bounding box centre, which for Incheon lands in the Yellow Sea
  // between the mainland and its northern islands.
  expect(centre).not.toBeNull();
  expect(centre!.longitude).toBeGreaterThan(126.2);
});

it("centres a ring-shaped territory in its body, not in the hole", () => {
  const donut = {
    geometry: {
      type: "Polygon",
      coordinates: [
        [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
        [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]],
      ],
    },
  };
  const centre = shapeCentre(donut, 0.01)!;
  expect(insideFeature([centre.longitude, centre.latitude], donut.geometry)).toBe(true);
});
