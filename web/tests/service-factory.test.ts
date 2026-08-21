import { expect, it, vi } from "vitest";
import { createServices } from "@/lib/service-factory";

it("keeps demo mode usable without a backend", async () => {
  const services = createServices("demo");

  await expect(services.tourism.listRegions()).resolves.toHaveLength(5);
});

it("uses the HTTP adapter only in integrated mode", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  const services = createServices("integrated", fetcher);

  await services.tourism.listPlaces({});

  expect(fetcher).toHaveBeenCalledOnce();
});
