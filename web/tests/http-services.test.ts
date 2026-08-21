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
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "camera.jpg", { type: "image/jpeg" });
    await service.recordPhoto(session.id, { file, capturedAt: "2026-08-21T10:00:01Z" });
    const result = await service.submit(session.id, "0f154c8a-8736-4fb6-ae2d-3a339e127b20");

    expect(result).toEqual(expect.objectContaining({ decision: "pending" }));
    expect(result.awardedPoints).toBeUndefined();
    expect(fetcher.mock.calls[2]?.[1]?.body).toBeInstanceOf(FormData);
    expect(new Headers(fetcher.mock.calls[2]?.[1]?.headers).has("content-type")).toBe(false);
    expect(fetcher.mock.calls[3]?.[1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ "Idempotency-Key": "0f154c8a-8736-4fb6-ae2d-3a339e127b20" }),
    }));
  });

  it("maps a recommended expedition with enriched stop reasons", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      id: "expedition-1",
      title: "부산 로컬 원정",
      regionCode: "6",
      keyword: "BTS",
      travelDate: "2026-08-22",
      dataUpdatedAt: "2026-08-22T03:00:00Z",
      stops: [{
        order: 1,
        distanceKm: 0,
        reasons: ["키워드 일치"],
        place: {
          id: "place-1", contentId: "101", nameKo: "감천문화마을",
          addressKo: "부산광역시 사하구", latitude: 35.0975, longitude: 129.0106,
          regionCode: "6", descriptionKo: "부산 산복도로의 문화마을",
          category: "culture", contentTypeId: "12",
          imageUrl: "https://images.example/101.jpg",
          imageUrls: ["https://images.example/101.jpg"],
          openTime: "09:00~18:00", restDate: "연중무휴", parking: "공영주차장",
          homepageUrl: "https://example.com/101", telephone: "051-000-0000",
          festivalStartDate: null, festivalEndDate: null,
          discoveryKeywords: ["BTS"], sourceOperations: ["searchKeyword2", "detailCommon2"],
          syncedAt: "2026-08-22T03:00:00Z",
        },
      }],
    }));

    const expedition = await createHttpServices(fetcher).tourism.getRecommendedExpedition({
      regionCode: "6", keyword: "BTS", travelDate: "2026-08-22", limit: 5,
    });

    expect(fetcher.mock.calls[0][0]).toContain("regionCode=6");
    expect(fetcher.mock.calls[0][0]).toContain("keyword=BTS");
    expect(expedition.stops[0].reasons).toEqual(["키워드 일치"]);
    expect(expedition.stops[0].place.imageUrls).toEqual(["https://images.example/101.jpg"]);
    expect(expedition.stops[0].place.openTime).toBe("09:00~18:00");
  });

  it("maps safe open-data status and rejects malformed expedition stops", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        label: "관광 OpenAPI", lastSuccessfulSyncAt: "2026-08-22T03:00:00Z",
        activePlaceCount: 100,
        operations: [{ operation: "areaBasedList2", lastSucceededAt: "2026-08-22T03:00:00Z", responseCount: 100 }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: "broken", title: "부산 로컬 원정", regionCode: "6", keyword: null,
        travelDate: "2026-08-22", dataUpdatedAt: "2026-08-22T03:00:00Z",
        stops: [{ order: 1, distanceKm: "near", reasons: [], place: null }],
      }));
    const tourism = createHttpServices(fetcher).tourism;

    await expect(tourism.getOpenDataStatus()).resolves.toEqual(expect.objectContaining({
      label: "관광 OpenAPI", activePlaceCount: 100,
    }));
    await expect(tourism.getRecommendedExpedition({
      regionCode: "6", travelDate: "2026-08-22", limit: 3,
    })).rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
  });
});
