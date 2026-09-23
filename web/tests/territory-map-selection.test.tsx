import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

type Handler = (event: { features?: { id?: string; properties?: Record<string, unknown> }[] }) => void;

const harness = vi.hoisted(() => ({
  layerHandlers: new Map<string, Handler[]>(),
  mapHandlers: new Map<string, ((event: unknown) => void)[]>(),
  renderedFeatures: [] as unknown[],
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
      } else if (typeof layerOrHandler === "function") {
        harness.mapHandlers.set(event, [...(harness.mapHandlers.get(event) ?? []), layerOrHandler as (event: unknown) => void]);
      }
      return this;
    }
    addControl() { return this; }
    addSource(id: string) { this.sources.set(id, { setData: vi.fn() }); return this; }
    getSource(id: string) { return this.sources.get(id); }
    addLayer(layer: { id: string }) { this.layers.push(layer); return this; }
    getLayer(id: string) { return this.layers.find((layer) => layer.id === id); }
    getStyle() { return { layers: this.layers }; }
    queryRenderedFeatures() { return harness.renderedFeatures; }
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


function clickOnMap(layerId: string, feature: { id?: string; properties?: Record<string, unknown> }) {
  for (const handler of harness.layerHandlers.get(`click:${layerId}`) ?? []) handler({ features: [feature] });
}

beforeEach(() => {
  harness.layerHandlers.clear();
  harness.mapHandlers.clear();
  harness.renderedFeatures.length = 0;
  harness.loadHandlers.length = 0;
  harness.fitBounds.mockClear();
  window.localStorage.clear();
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({
    ...createInitialDemoSession(),
    artistConfirmed: true,
    selectedArtistId: "bts",
    selectedTerritoryId: null,
    // A narrowed board, so there is something for the map to reach past. The
    // app opens on the whole board, where nothing is hidden to begin with.
    territoryFilter: "my_fandom",
  }));
  render(
    <DemoSessionProvider storage={window.localStorage}>
      <TerritoryView />
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

  // The picked territory joins the list so a card exists and reads as
  // selected, and the reader's filter is left exactly as they set it — widening
  // it to All used to lift every dimmed region on the map along with it.
  await waitFor(() => expect(within(screen.getByRole("list", { name: "지도와 같은 영토 목록" }))
    .getByRole("button", { name: new RegExp(`^${hiddenName}`) })).toHaveAttribute("aria-pressed", "true"));
  expect(screen.getByRole("button", { name: "소유 영토" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "false");
  expect(await screen.findByRole("complementary", { name: `${hiddenName} 전술 패널` })).toBeVisible();
  expect(previewContent.territories.length).toBeGreaterThan(0);
});

// The map used to have no way back: once anything was picked, some territory
// always wore the selected fill, and the reader could not return it to rest.
it("puts the selection down when the map is clicked past every territory", async () => {
  clickOnMap("preview-stronghold-symbols", { id: "daegu", properties: { id: "daegu" } });
  expect(await screen.findByRole("complementary", { name: "대구 전술 패널" })).toBeVisible();

  harness.renderedFeatures.length = 0;
  for (const handler of harness.mapHandlers.get("click") ?? []) handler({ point: { x: 4, y: 4 } });

  await waitFor(() => expect(screen.queryByRole("complementary", { name: "대구 전술 패널" })).not.toBeInTheDocument());
  expect(within(screen.getByRole("list", { name: "지도와 같은 영토 목록" }))
    .getByRole("button", { name: /^대구/ })).toHaveAttribute("aria-pressed", "false");
});

it("keeps the selection when the click lands on a territory", async () => {
  clickOnMap("preview-stronghold-symbols", { id: "daegu", properties: { id: "daegu" } });
  expect(await screen.findByRole("complementary", { name: "대구 전술 패널" })).toBeVisible();

  harness.renderedFeatures.push({ id: "daegu" });
  for (const handler of harness.mapHandlers.get("click") ?? []) handler({ point: { x: 4, y: 4 } });

  expect(await screen.findByRole("complementary", { name: "대구 전술 패널" })).toBeVisible();
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
