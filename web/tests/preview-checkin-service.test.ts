import { expect, it, vi } from "vitest";
import { createPreviewCheckInService } from "@/features/ktown-app";
import { previewContent } from "@/features/team-preview/content";
import { createDemoServices } from "@/lib/demo-services";

it("resolves a preview stop to its PostgreSQL place id before creating a real check-in", async () => {
  const previewPlace = previewContent.places[0];
  const services = createDemoServices();
  const create = vi.fn(async (placeId: string) => ({
    id: "session-1",
    placeId,
    expiresAt: "2026-09-14T01:00:00Z",
  }));
  const listPlaces = vi.fn(async () => [{
    id: "10000000-0000-4000-8000-000000000099",
    regionId: previewPlace.territoryId,
    nameKo: previewPlace.name.ko,
    category: previewPlace.category,
    categoryLabel: "관광지",
    description: "",
    address: previewPlace.address.ko,
    transit: "",
    dwellMinutes: previewPlace.dwellMinutes,
    points: previewPlace.visitBase,
  }]);
  const bridge = createPreviewCheckInService({
    ...services,
    tourism: { ...services.tourism, listPlaces },
    checkIn: { ...services.checkIn, create },
  });

  await expect(bridge.create(previewPlace.id, { verificationMode: "demo" })).resolves.toMatchObject({ id: "session-1" });
  expect(listPlaces).toHaveBeenCalledWith({
    regionId: previewPlace.territoryId,
    query: previewPlace.name.ko,
  });
  expect(create).toHaveBeenCalledWith("10000000-0000-4000-8000-000000000099", { verificationMode: "demo" });
});

it("does not fake an approval when the preview stop is absent from PostgreSQL", async () => {
  const previewPlace = previewContent.places[0];
  const services = createDemoServices();
  const bridge = createPreviewCheckInService({
    ...services,
    tourism: { ...services.tourism, listPlaces: vi.fn(async () => []) },
  });

  await expect(bridge.create(previewPlace.id)).rejects.toThrow("LIVE_PLACE_NOT_FOUND");
});

it("passes a persisted expedition stop directly to the backend check-in service", async () => {
  const services = createDemoServices();
  const placeId = "10000000-0000-4000-8000-000000000123";
  const options = { verificationMode: "demo" as const, expeditionId: "20000000-0000-4000-8000-000000000123" };
  const create = vi.fn(async (id: string) => ({
    id: "session-live",
    placeId: id,
    expiresAt: "2026-09-14T01:00:00Z",
  }));
  const listPlaces = vi.fn(services.tourism.listPlaces);
  const bridge = createPreviewCheckInService({
    ...services,
    tourism: { ...services.tourism, listPlaces },
    checkIn: { ...services.checkIn, create },
  });

  await expect(bridge.create(placeId, options)).resolves.toMatchObject({ id: "session-live", placeId });
  expect(listPlaces).not.toHaveBeenCalled();
  expect(create).toHaveBeenCalledWith(placeId, options);
});
