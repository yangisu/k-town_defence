import { describe, expect, it } from "vitest";
import { buildShareCard } from "@/features/share/build-share-card";

describe("buildShareCard", () => {
  it("names the place and points, never raw GPS", () => {
    const card = buildShareCard("checkin", { placeId: "place-1", placeName: "감천문화마을", pointsAwarded: 100 });

    expect(card.title).toContain("감천문화마을");
    expect(card.description).toContain("100점");
    expect(card.description).not.toMatch(/lat|lng|latitude|longitude/i);
  });

  it("describes a pending check-in without inventing a point total", () => {
    const card = buildShareCard("checkin", { placeId: "place-1", placeName: "감천문화마을" });

    expect(card.description).not.toMatch(/\d+점을 획득/);
    expect(card.description).toContain("운영 검토");
  });

  it("points the share link at the public checkin page for that place", () => {
    const card = buildShareCard("checkin", { placeId: "place-1", placeName: "감천문화마을" }, "https://app.example");

    expect(card.shareUrl).toBe("https://app.example/share/checkin/place-1");
    expect(card.imageUrl).toBe("https://app.example/share/checkin/place-1/image");
  });

  it("summarizes territory ownership without exposing rival user data", () => {
    const card = buildShareCard("territory", { fandomName: "ARMY", ownedCount: 12, strongestTerritoryName: "부산" });

    expect(card.title).toContain("ARMY");
    expect(card.description).toContain("12개");
    expect(card.description).toContain("부산");
  });

  it("still summarizes territory ownership when there is no strongest territory yet", () => {
    const card = buildShareCard("territory", { fandomName: "ARMY", ownedCount: 0, strongestTerritoryName: null });

    expect(card.description).toContain("0개");
    expect(card.description).not.toContain("undefined");
  });
});
