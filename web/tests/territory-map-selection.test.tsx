import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

type Handler = (event: { features?: { id?: string; properties?: Record<string, unknown> }[] }) => void;

const harness = vi.hoisted(() => ({
  layerHandlers: new Map<string, Handler[]>(),
  loadHandlers: [] as (() => void)[],
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
}));

vi.mock("maplibre-gl", () => {
  class MockMap {
    layers: { id: string }[] = [];
    sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
    canvas = { style: { cursor: "" } };
    constructor() { /* the harness collects handlers instead */ }
    on(event: string, layerOrHandler: string | Handler, handler?: Handler) {
      if (typeof layerOrHandler === "string" && handler) {
        const key = `${event}:${layerOrHandler}`;
        harness.layerHandlers.set(key, [...(harness.layerHandlers.get(key) ?? []), handler]);
      } else if (event === "load" && typeof layerOrHandler === "function") {
        harness.loadHandlers.push(layerOrHandler as () => void);
      }
      return this;
    }
    addControl() { return this; }
    addSource(id: string) { this.sources.set(id, { setData: vi.fn() }); return this; }
    getSource(id: string) { return this.sources.get(id); }
    addLayer(layer: { id: string }) { this.layers.push(layer); return this; }
    getLayer(id: string) { return this.layers.find((layer) => layer.id === id); }
    getStyle() { return { layers: this.layers }; }
    getPaintProperty() { return undefined; }
    setLayoutProperty() { return this; }
    getCanvas() { return this.canvas; }
    setFilter() { return this; }
    setPaintProperty() { return this; }
    fitBounds(...args: unknown[]) { harness.fitBounds(...args); return this; }
    flyTo(...args: unknown[]) { harness.flyTo(...args); return this; }
    jumpTo() { return this; }
    loadImage() { return Promise.reject(new Error("no image")); }
    hasImage() { return false; }
    addImage() { return this; }
    remove() { return this; }
    dragPan = { enable: vi.fn(), disable: vi.fn() };
  }
  const maplibre = { Map: MockMap, AttributionControl: class {}, setWorkerUrl: vi.fn() };
  return { ...maplibre, default: maplibre };
});

const { TerritoryView } = await import("@/components/team-preview/territory-view");
const { DemoSessionProvider } = await import("@/features/team-preview/demo-session-context");
const { createInitialDemoSession, DEMO_SESSION_KEY } = await import("@/features/team-preview/demo-session");

const mapConfig = { apiKey: "test-map-key", region: "ap-northeast-2", styleName: "Standard" };

function clickOnMap(layerId: string, feature: { id?: string; properties?: Record<string, unknown> }) {
  for (const handler of harness.layerHandlers.get(`click:${layerId}`) ?? []) handler({ features: [feature] });
}

beforeEach(() => {
  harness.layerHandlers.clear();
  harness.loadHandlers.length = 0;
  harness.fitBounds.mockClear();
  window.localStorage.clear();
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({
    ...createInitialDemoSession(),
    artistConfirmed: true,
    selectedArtistId: "bts",
    selectedTerritoryId: null,
  }));
  render(
    <DemoSessionProvider storage={window.localStorage}>
      <TerritoryView mapConfig={mapConfig} />
    </DemoSessionProvider>,
  );
  for (const handler of [...harness.loadHandlers]) handler();
});

it("selects a territory the current filter hides, straight from its marker", async () => {
  const { previewContent } = await import("@/features/team-preview/content");
  const { filterAndOrderTerritories } = await import("@/components/team-preview/map-filters");
  const session = createInitialDemoSession();
  const listed = filterAndOrderTerritories(session.territories, "my_fandom", "bts").map((territory) => territory.id);
  const hidden = session.territories.find((territory) => !listed.includes(territory.id))!;
  const hiddenName = hidden.name.ko;

  const list = await screen.findByRole("list", { name: "지도와 같은 영토 목록" });
  expect(within(list).queryByRole("button", { name: new RegExp(`^${hiddenName}`) })).not.toBeInTheDocument();

  clickOnMap("preview-stronghold-symbols", { id: hidden.id, properties: { id: hidden.id } });

  // The filter widens to All so a card exists, that card reads as selected,
  // and the tactical card opens on the territory that was picked.
  await waitFor(() => expect(screen.getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "true"));
  expect(within(screen.getByRole("list", { name: "지도와 같은 영토 목록" }))
    .getByRole("button", { name: new RegExp(`^${hiddenName}`) })).toHaveAttribute("aria-pressed", "true");
  expect(await screen.findByRole("complementary", { name: `${hiddenName} 전술 패널` })).toBeVisible();
  expect(previewContent.territories.length).toBeGreaterThan(0);
});

it("moves the map to a territory picked through a connection pin", async () => {
  // A connection pin carries its territory in a property, not as its id.
  clickOnMap("preview-artist-connection-pins", {
    id: "bts-daegu-suga",
    properties: { id: "bts-daegu-suga", territoryId: "daegu" },
  });

  expect(await screen.findByRole("complementary", { name: "대구 전술 패널" })).toBeVisible();
  await waitFor(() => expect(harness.fitBounds.mock.calls.length + harness.flyTo.mock.calls.length).toBeGreaterThan(0));
});
