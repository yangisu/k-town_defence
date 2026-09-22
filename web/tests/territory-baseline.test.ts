import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { territories } from "@/lib/demo-preview/territories";

// The live server starts each season on this file's numbers, and the demo
// starts on its own territory data. They are meant to be the same opening
// board; if one changes without the other, the demo and the deployed map
// quietly show different owners.
it("keeps the server's opening board identical to the demo's", () => {
  const serverBaseline = JSON.parse(readFileSync(
    resolve(__dirname, "../../src/ktown_defense/data/territory_baseline.json"),
    "utf8",
  )) as Record<string, Record<string, number>>;

  const demoBaseline = Object.fromEntries(territories.map((territory) => [
    territory.id,
    Object.fromEntries(territory.standings.map((standing) => [standing.fandomName, standing.validPoints])),
  ]));

  expect(serverBaseline).toEqual(demoBaseline);
});

// Zero everywhere is what made one fandom own the whole map: a region needs a
// clear leader from the start, not a tie the server has to break by id.
it("gives every region a single clear leader to open on", () => {
  for (const territory of territories) {
    const points = territory.standings.map((standing) => standing.validPoints).sort((a, b) => b - a);
    expect(points[0]).toBeGreaterThan(points[1] ?? 0);
  }
});
