import { describe, expect, it, vi } from "vitest";
import { createHttpServices } from "@/lib/http-services";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("HTTP services", () => {
  it("maps persistent backend places into the existing tourism domain", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: "place-1",
            contentId: "tour-1",
            nameKo: "감천문화마을",
            addressKo: "부산광역시 사하구",
            latitude: 35.0975,
            longitude: 129.0106,
            regionCode: "6",
            descriptionKo: "부산의 산복도로 문화마을",
          },
        ],
      }),
    );

    const places = await createHttpServices(fetcher).tourism.listPlaces({});

    expect(places).toEqual([
      expect.objectContaining({
        id: "place-1",
        regionId: "busan",
        nameKo: "감천문화마을",
        address: "부산광역시 사하구",
        description: "부산의 산복도로 문화마을",
      }),
    ]);
    expect(fetcher).toHaveBeenCalledWith("/api/ktown/api/v1/places", expect.any(Object));
  });

  it("sends safe live place filters and maps image metadata", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      total: 1,
      items: [{
        id: "place-1", contentId: "101", nameKo: "감천문화마을",
        addressKo: "부산", latitude: 35.1, longitude: 129,
        regionCode: "6", descriptionKo: "공식 설명", category: "culture",
        contentTypeId: "12", categoryCode: "A01010100",
        imageUrl: "https://images.example/place.jpg", syncedAt: "2026-08-21T10:00:00Z",
      }],
    }));

    const places = await createHttpServices(fetcher as typeof fetch).tourism.listPlaces({
      regionId: "busan", category: "culture", query: "감천 마을",
    });

    expect(fetcher.mock.calls[0][0]).toContain("regionCode=6");
    expect(fetcher.mock.calls[0][0]).toContain("category=culture");
    expect(fetcher.mock.calls[0][0]).toContain("query=%EA%B0%90%EC%B2%9C+%EB%A7%88%EC%9D%84");
    expect(places[0].imageUrl).toBe("https://images.example/place.jpg");
  });

  it("persists evidence and submits with the caller's stable idempotency key", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "session-1", placeId: "place-1", status: "collecting", expiresAt: "2026-08-21T10:30:00Z" }, 201))
      .mockResolvedValueOnce(jsonResponse({ id: "gps-1", sequence: 1 }, 201))
      .mockResolvedValueOnce(jsonResponse({ id: "photo-1", storageKey: "private/photo.jpg" }, 201))
      .mockResolvedValueOnce(jsonResponse({ id: "submission-1", sessionId: "session-1", decision: "pending", submittedAt: "2026-08-21T10:05:00Z" }, 201));
    const service = createHttpServices(fetcher).checkIn;

    const session = await service.create("place-1");
    await service.recordGps(session.id, { sequence: 1, latitude: 35.1, longitude: 129, accuracyMeters: 20, capturedAt: "2026-08-21T10:00:00Z" });
    await service.recordPhoto(session.id, { storageKey: "private/photo.jpg", contentType: "image/jpeg", sizeBytes: 1024, sha256: "a".repeat(64), capturedAt: "2026-08-21T10:00:01Z" });
    const result = await service.submit(session.id, "0f154c8a-8736-4fb6-ae2d-3a339e127b20");

    expect(result).toEqual(expect.objectContaining({ decision: "pending" }));
    expect(result.awardedPoints).toBeUndefined();
    expect(fetcher.mock.calls[3]?.[1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ "Idempotency-Key": "0f154c8a-8736-4fb6-ae2d-3a339e127b20" }),
    }));
  });
});
