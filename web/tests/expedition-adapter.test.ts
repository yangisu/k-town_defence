import { expect, it } from "vitest";
import { liveMissionPlaces } from "@/lib/adapters/expedition";
import type { PersistedExpedition, Place } from "@/lib/domain";

function place(id: string, coordinates?: { latitude: number; longitude: number }): Place {
  return {
    id,
    regionId: "6",
    nameKo: id,
    category: "culture",
    categoryLabel: "문화",
    description: "설명",
    address: "부산",
    transit: "도보",
    dwellMinutes: 30,
    points: 100,
    ...coordinates,
  };
}

it("omits live stops without coordinates instead of placing them at 0,0", () => {
  const expedition: PersistedExpedition = {
    id: "expedition-1",
    recommendationId: "recommendation-1",
    title: "부산 원정",
    regionCode: "6",
    travelDate: "2026-09-21",
    status: "active",
    createdAt: "2026-09-21T00:00:00Z",
    stops: [
      { order: 1, distanceKm: 0, reasons: [], place: place("missing"), kind: "anchor", placement: "main", required: true, selectedByDefault: true, evidence: null },
      { order: 2, distanceKm: 1, reasons: [], place: place("valid", { latitude: 35.1796, longitude: 129.0756 }), kind: "anchor", placement: "main", required: true, selectedByDefault: true, evidence: null },
    ],
  };

  const result = liveMissionPlaces(expedition, "busan");

  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ id: "valid", coordinates: { latitude: 35.1796, longitude: 129.0756 } });
});
