import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TerritoryMap } from "@/components/team-preview/territory-map";
import { previewContent } from "@/features/team-preview/content";
import { createInitialDemoSession } from "@/features/team-preview/demo-session";
import type { MapConfig } from "@/lib/map-config";

interface MapEvent {
  features?: Array<{ id?: string | number; properties?: Record<string, unknown> }>;
  error?: Error;
}

interface MapHarness {
  options: Record<string, unknown>;
  sources: Map<string, { setData: ReturnType<typeof vi.fn>; initialData?: unknown }>;
  layers: Array<Record<string, unknown>>;
  handlers: Map<string, Array<(event: MapEvent) => void>>;
  layerHandlers: Map<string, Array<(event: MapEvent) => void>>;
  flyTo: ReturnType<typeof vi.fn>;
  fitBounds: ReturnType<typeof vi.fn>;
  setFilter: ReturnType<typeof vi.fn>;
  setPaintProperty: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  emit: (event: string, value?: MapEvent) => void;
  emitLayer: (event: string, layer: string, value?: MapEvent) => void;
}

const mapHarness = vi.hoisted(() => ({ instances: [] as MapHarness[] }));

vi.mock("maplibre-gl", () => {
  class MockMap {
    options: Record<string, unknown>;
    sources = new Map<string, { setData: ReturnType<typeof vi.fn>; initialData?: unknown }>();
    layers: Array<Record<string, unknown>> = [];
    handlers = new Map<string, Array<(event: MapEvent) => void>>();
    layerHandlers = new Map<string, Array<(event: MapEvent) => void>>();
    flyTo = vi.fn();
    fitBounds = vi.fn();
    setFilter = vi.fn();
    setPaintProperty = vi.fn();
    remove = vi.fn();

    constructor(options: Record<string, unknown>) {
      this.options = options;
      mapHarness.instances.push(this);
    }

    on(event: string, layerOrHandler: string | ((value: MapEvent) => void), handler?: (value: MapEvent) => void) {
      if (typeof layerOrHandler === "string" && handler) {
        const key = `${event}:${layerOrHandler}`;
        this.layerHandlers.set(key, [...(this.layerHandlers.get(key) ?? []), handler]);
      } else if (typeof layerOrHandler === "function") {
        this.handlers.set(event, [...(this.handlers.get(event) ?? []), layerOrHandler]);
      }
      return this;
    }

    addControl() { return this; }
    addSource(id: string, specification?: { data?: unknown }) {
      this.sources.set(id, { setData: vi.fn(), initialData: specification?.data });
      return this;
    }
    getSource(id: string) { return this.sources.get(id); }
    addLayer(layer: Record<string, unknown>) { this.layers.push(layer); return this; }
    getLayer(id: string) { return this.layers.find((layer) => layer.id === id); }

    emit(event: string, value: MapEvent = {}) {
      for (const handler of this.handlers.get(event) ?? []) handler(value);
    }

    emitLayer(event: string, layer: string, value: MapEvent = {}) {
      for (const handler of this.layerHandlers.get(`${event}:${layer}`) ?? []) handler(value);
    }
  }

  class MockAttributionControl {}

  return { default: { Map: MockMap, AttributionControl: MockAttributionControl } };
});

const config: MapConfig = {
  apiKey: "test-map-key",
  region: "ap-northeast-2",
  styleName: "Standard",
};

beforeEach(() => {
  mapHarness.instances.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("uses Amazon Location and keeps map selection equivalent to the territory list", async () => {
  const user = userEvent.setup();
  const onSelectTerritory = vi.fn();
  const session = createInitialDemoSession();
  const { rerender } = render(
    <TerritoryMap
      mapConfig={config}
      session={session}
      selectedTerritoryId="busan"
      onSelectTerritory={onSelectTerritory}
    />,
  );

  const mapRegion = screen.getByRole("region", { name: "대한민국 팬덤 영토 지도" });
  expect((mapRegion as HTMLElement).style.minHeight).toBe("32rem");
  expect(mapHarness.instances[0].options.style).toBe(
    "https://maps.geo.ap-northeast-2.amazonaws.com/v2/styles/Standard/descriptor?key=test-map-key",
  );

  mapHarness.instances[0].emit("load");
  mapHarness.instances[0].emitLayer("click", "preview-territory-fill", {
    features: [{ id: "daegu", properties: { id: "daegu" } }],
  });
  expect(onSelectTerritory).toHaveBeenLastCalledWith("daegu");

  const list = screen.getByRole("list", { name: "지도와 같은 영토 목록" });
  await user.click(within(list).getByRole("button", { name: /^대구/ }));
  expect(onSelectTerritory).toHaveBeenLastCalledWith("daegu");

  rerender(
    <TerritoryMap
      mapConfig={config}
      session={{ ...session, selectedTerritoryId: "daegu" }}
      selectedTerritoryId="daegu"
      onSelectTerritory={onSelectTerritory}
    />,
  );
  expect(mapHarness.instances[0].flyTo).toHaveBeenCalledWith(expect.objectContaining({
    center: [128.6014, 35.8714],
  }));

  rerender(
    <TerritoryMap
      mapConfig={config}
      session={{ ...session, selectedTerritoryId: null }}
      selectedTerritoryId={null}
      onSelectTerritory={onSelectTerritory}
    />,
  );
  expect(mapHarness.instances[0].setFilter).toHaveBeenLastCalledWith(
    "preview-territory-selected",
    ["==", ["id"], ""],
  );
  expect(mapHarness.instances[0].sources.get("preview-selected-expedition")?.setData)
    .toHaveBeenLastCalledWith(expect.objectContaining({ features: [] }));
});

it("shows a real operable territory list when map configuration is missing", async () => {
  const user = userEvent.setup();
  const onSelectTerritory = vi.fn();
  render(
    <TerritoryMap
      mapConfig={null}
      session={createInitialDemoSession()}
      selectedTerritoryId={null}
      onSelectTerritory={onSelectTerritory}
    />,
  );

  expect(screen.getByText("지도를 연결하려면 Amazon Location 설정이 필요해요")).toBeVisible();
  expect(screen.queryByRole("region", { name: "대한민국 팬덤 영토 지도" })).not.toBeInTheDocument();
  expect(document.querySelector(".map-grid")).not.toBeInTheDocument();
  expect(screen.queryByText(/KOREA\s*EXPEDITION/)).not.toBeInTheDocument();

  const list = screen.getByRole("list", { name: "지도와 같은 영토 목록" });
  expect(within(list).getAllByRole("button")).toHaveLength(previewContent.territories.length);
  await user.click(within(list).getByRole("button", { name: /^영월/ }));
  expect(onSelectTerritory).toHaveBeenCalledWith("yeongwol");
});

it("localizes the configured map and missing-configuration controls in English", () => {
  const englishSession = { ...createInitialDemoSession(), locale: "en" as const };
  const onSelectTerritory = vi.fn();
  const { rerender } = render(
    <TerritoryMap
      mapConfig={config}
      session={englishSession}
      selectedTerritoryId="busan"
      onSelectTerritory={onSelectTerritory}
    />,
  );

  expect(screen.getByRole("region", { name: "Korea fandom territory map" })).toBeVisible();
  expect(screen.queryByRole("region", { name: "대한민국 팬덤 영토 지도" })).not.toBeInTheDocument();

  rerender(
    <TerritoryMap
      mapConfig={null}
      session={englishSession}
      selectedTerritoryId="busan"
      onSelectTerritory={onSelectTerritory}
    />,
  );
  expect(screen.getByText("Amazon Location configuration is required to connect the map")).toBeVisible();
  expect(screen.queryByText("지도를 연결하려면 Amazon Location 설정이 필요해요")).not.toBeInTheDocument();
});

it("localizes map failure recovery in English", async () => {
  render(
    <TerritoryMap
      mapConfig={config}
      session={{ ...createInitialDemoSession(), locale: "en" }}
      selectedTerritoryId="busan"
      onSelectTerritory={() => undefined}
    />,
  );

  mapHarness.instances[0].emit("error", { error: new Error("style failed") });

  expect(await screen.findByText("Amazon Location configuration is required to connect the map")).toBeVisible();
  expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
});

it("recovers from a map style error without losing attribution or territory controls", async () => {
  const user = userEvent.setup();
  const onSelectTerritory = vi.fn();
  render(
    <TerritoryMap
      mapConfig={config}
      session={createInitialDemoSession()}
      selectedTerritoryId="busan"
      onSelectTerritory={onSelectTerritory}
    />,
  );

  mapHarness.instances[0].emit("error", { error: new Error("style failed") });
  expect(await screen.findByText("지도를 연결하려면 Amazon Location 설정이 필요해요")).toBeVisible();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Amazon Location Service" })).toBeVisible();
  expect(screen.getByRole("link", { name: "geoBoundaries" })).toBeVisible();

  const list = screen.getByRole("list", { name: "지도와 같은 영토 목록" });
  await user.click(within(list).getByRole("button", { name: /^부산/ }));
  expect(onSelectTerritory).toHaveBeenCalledWith("busan");

  await user.click(screen.getByRole("button", { name: "다시 시도" }));
  await waitFor(() => expect(mapHarness.instances).toHaveLength(2));
  expect(screen.getByRole("region", { name: "대한민국 팬덤 영토 지도" })).toBeVisible();
});

it("keeps GeoJSON feature IDs identical to preview territory IDs", () => {
  const file = readFileSync(resolve(process.cwd(), "public/data/preview-territories.geojson"), "utf8");
  const geoJson = JSON.parse(file) as {
    features: Array<{ id: string; properties: { id: string }; geometry: { type: string; coordinates: unknown } }>;
  };
  const featureIds = geoJson.features.map((feature) => feature.id);
  const previewIds = previewContent.territories.map((territory) => territory.id);

  expect(new Set(featureIds)).toEqual(new Set(previewIds));
  expect(featureIds).toHaveLength(new Set(featureIds).size);
  expect(geoJson.features.every((feature) => ["Polygon", "MultiPolygon"].includes(feature.geometry.type))).toBe(true);
  expect(geoJson.features.every((feature) => feature.properties.id === feature.id)).toBe(true);
  expect(geoJson.features.every((feature) => {
    const polygons = feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
    if (!Array.isArray(polygons) || polygons.length === 0) return false;
    return polygons.every((polygon) => Array.isArray(polygon) && polygon.length > 0 && polygon.every((ring) => {
      if (!Array.isArray(ring) || ring.length < 4) return false;
      const validPositions = ring.every((position) => Array.isArray(position)
        && position.length >= 2
        && typeof position[0] === "number"
        && Number.isFinite(position[0])
        && position[0] >= -180
        && position[0] <= 180
        && typeof position[1] === "number"
        && Number.isFinite(position[1])
        && position[1] >= -90
        && position[1] <= 90);
      const first = ring[0] as unknown[];
      const last = ring.at(-1) as unknown[];
      return validPositions && first[0] === last[0] && first[1] === last[1];
    }));
  })).toBe(true);
});

it("keeps configured boundary, click, and mission layers equivalent to the filtered territory list", () => {
  const onSelectTerritory = vi.fn();
  const completeSession = createInitialDemoSession();
  const yeongwolSession = {
    ...completeSession,
    artistConfirmed: true,
    selectedArtistId: "bts" as const,
    selectedTerritoryId: "yeongwol",
    territories: completeSession.territories.filter((territory) => territory.id === "yeongwol"),
  };
  const { rerender } = render(
    <TerritoryMap
      mapConfig={config}
      session={yeongwolSession}
      selectedTerritoryId="yeongwol"
      onSelectTerritory={onSelectTerritory}
    />,
  );

  const map = mapHarness.instances[0];
  map.emit("load");
  const yeongwolBoundaryFilter = ["in", ["id"], ["literal", ["yeongwol"]]];
  const yeongwolMissionFilter = ["in", ["get", "territoryId"], ["literal", ["yeongwol"]]];

  expect(map.layers.find((layer) => layer.id === "preview-territory-fill")?.filter)
    .toEqual(yeongwolBoundaryFilter);
  expect(map.layers.find((layer) => layer.id === "preview-territory-outline")?.filter)
    .toEqual(yeongwolBoundaryFilter);
  expect(map.layers.find((layer) => layer.id === "preview-mission-points")?.filter)
    .toEqual(yeongwolMissionFilter);

  map.emitLayer("click", "preview-territory-fill", { features: [{ id: "busan" }] });
  expect(onSelectTerritory).not.toHaveBeenCalled();
  map.emitLayer("click", "preview-territory-fill", { features: [{ id: "yeongwol" }] });
  expect(onSelectTerritory).toHaveBeenCalledWith("yeongwol");

  const busanSession = {
    ...completeSession,
    artistConfirmed: true,
    selectedArtistId: "bts" as const,
    selectedTerritoryId: "busan",
    territories: completeSession.territories.filter((territory) => territory.id === "busan"),
  };
  rerender(
    <TerritoryMap
      mapConfig={config}
      session={busanSession}
      selectedTerritoryId="busan"
      onSelectTerritory={onSelectTerritory}
    />,
  );

  const busanBoundaryFilter = ["in", ["id"], ["literal", ["busan"]]];
  const busanMissionFilter = ["in", ["get", "territoryId"], ["literal", ["busan"]]];
  expect(map.setFilter).toHaveBeenCalledWith("preview-territory-fill", busanBoundaryFilter);
  expect(map.setFilter).toHaveBeenCalledWith("preview-territory-outline", busanBoundaryFilter);
  expect(map.setFilter).toHaveBeenCalledWith("preview-mission-points", busanMissionFilter);
});

it("encodes owner fandom colors and selected-artist connection pins in configured MapLibre data", () => {
  const session = {
    ...createInitialDemoSession(),
    artistConfirmed: true,
    selectedArtistId: "bts" as const,
    selectedTerritoryId: "busan",
  };
  render(
    <TerritoryMap
      mapConfig={config}
      session={session}
      selectedTerritoryId="busan"
      onSelectTerritory={() => undefined}
    />,
  );

  const map = mapHarness.instances[0];
  map.emit("load");
  const fill = map.layers.find((layer) => layer.id === "preview-territory-fill");
  expect(JSON.stringify((fill?.paint as Record<string, unknown>)?.["fill-color"])).toContain("#7c5ce0");
  expect(JSON.stringify((fill?.paint as Record<string, unknown>)?.["fill-color"])).toContain("#f25da5");

  const strongholds = map.sources.get("preview-strongholds")?.initialData as {
    features: Array<{ properties: Record<string, unknown> }>;
  };
  expect(strongholds.features.find((feature) => feature.properties.id === "busan")?.properties.ownerColor)
    .toBe("#7c5ce0");

  const connections = map.sources.get("preview-artist-connections")?.initialData as {
    features: Array<{ properties: Record<string, unknown> }>;
  } | undefined;
  expect(connections?.features.length).toBeGreaterThan(0);
  expect(connections?.features.every((feature) => feature.properties.artistId === "bts")).toBe(true);
  expect(map.layers.some((layer) => layer.id === "preview-artist-connection-pins")).toBe(true);
});

it("replaces connection pins when the selected artist changes without a territory mutation", () => {
  const initialSession = createInitialDemoSession();
  const btsSession = {
    ...initialSession,
    artistConfirmed: true,
    selectedArtistId: "bts" as const,
    selectedTerritoryId: "busan",
  };
  const { rerender } = render(
    <TerritoryMap
      mapConfig={config}
      session={btsSession}
      selectedTerritoryId="busan"
      onSelectTerritory={() => undefined}
    />,
  );
  const map = mapHarness.instances[0];
  map.emit("load");

  rerender(
    <TerritoryMap
      mapConfig={config}
      session={{ ...btsSession, selectedArtistId: "blackpink" }}
      selectedTerritoryId="busan"
      onSelectTerritory={() => undefined}
    />,
  );

  const latestConnections = map.sources.get("preview-artist-connections")?.setData.mock.calls.at(-1)?.[0] as {
    features: Array<{ properties: Record<string, unknown> }>;
  } | undefined;
  expect(latestConnections?.features.length).toBeGreaterThan(0);
  expect(latestConnections?.features.every((feature) => feature.properties.artistId === "blackpink")).toBe(true);
});

it("recolors a captured boundary and stronghold without recreating the map", () => {
  const session = {
    ...createInitialDemoSession(),
    artistConfirmed: true,
    selectedArtistId: "bts" as const,
    selectedTerritoryId: "busan",
  };
  const { rerender } = render(
    <TerritoryMap
      mapConfig={config}
      session={session}
      selectedTerritoryId="busan"
      onSelectTerritory={() => undefined}
    />,
  );
  const map = mapHarness.instances[0];
  map.emit("load");
  const captured = {
    ...session,
    territories: session.territories.map((territory) => territory.id === "busan"
      ? { ...territory, ownerArtistId: "blackpink" as const }
      : territory),
  };

  rerender(
    <TerritoryMap
      mapConfig={config}
      session={captured}
      selectedTerritoryId="busan"
      onSelectTerritory={() => undefined}
    />,
  );

  expect(map.setPaintProperty).toHaveBeenCalledWith(
    "preview-territory-fill",
    "fill-color",
    expect.any(Array),
  );
  const lastColorExpression = map.setPaintProperty.mock.calls
    .filter(([layer, property]) => layer === "preview-territory-fill" && property === "fill-color")
    .at(-1)?.[2];
  expect(JSON.stringify(lastColorExpression)).toMatch(/busan.*#f25da5/);
  const latestStrongholds = map.sources.get("preview-strongholds")?.setData.mock.calls.at(-1)?.[0] as {
    features: Array<{ properties: Record<string, unknown> }>;
  };
  expect(latestStrongholds.features.find((feature) => feature.properties.id === "busan")?.properties.ownerColor)
    .toBe("#f25da5");
});

it("keeps nationwide ownership on semantic layers while filtering the accessible list and resetting the camera", async () => {
  const geoJson = JSON.parse(readFileSync(resolve(process.cwd(), "public/data/preview-territories.geojson"), "utf8"));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => geoJson }));
  const expectedOwnerColors = {
    busan: "#7c5ce0", daegu: "#7c5ce0", gwangju: "#59a85f", gunpo: "#f25da5", seongnam: "#f25da5",
    geoje: "#d66d55", suwon: "#4c66d6", gyeongju: "#d66d55", daejeon: "#d2468d", seoul: "#d960a8",
    yongin: "#2e9d78", goyang: "#2e9d78", incheon: "#d2468d", jeju: "#d2468d", ulsan: "#f28a45",
    siheung: "#f28a45", cheonan: "#3a9edb", pohang: "#3a9edb", wonju: "#59a85f", chuncheon: "#4b9de0",
    uijeongbu: "#d960a8", namyangju: "#45a9ad", yeongwol: "#7c5ce0",
  } as const;
  const session = {
    ...createInitialDemoSession(),
    artistConfirmed: true,
    selectedArtistId: "bts" as const,
    selectedTerritoryId: "busan",
  };
  const { rerender } = render(
    <TerritoryMap
      mapConfig={config}
      session={session}
      listedTerritories={session.territories.filter((territory) => territory.id === "busan")}
      activeFilter="my_fandom"
      selectedTerritoryId="busan"
      onSelectTerritory={() => undefined}
    />,
  );

  const map = mapHarness.instances[0];
  map.emit("load");
  const fill = map.layers.find((layer) => layer.id === "preview-territory-fill");
  const strongholds = map.layers.find((layer) => layer.id === "preview-stronghold-symbols");
  expect(fill?.filter).toBeUndefined();
  expect(strongholds).toMatchObject({ type: "circle" });
  expect((strongholds?.paint as Record<string, unknown>)?.["circle-radius"])
    .toEqual(["match", ["get", "stage"], "seed", 7, "tree", 11, "landmark", 16, 7]);
  expect(map.layers.find((layer) => layer.id === "preview-selected-fandom-outline")?.filter)
    .toEqual(["==", ["get", "ownerArtistId"], "bts"]);
  expect(map.layers.find((layer) => layer.id === "preview-territory-selected"))
    .toMatchObject({ type: "line", paint: { "line-color": "#16231d", "line-width": 4 } });
  expect(JSON.stringify((fill?.paint as Record<string, unknown>)?.["fill-color"])).toMatch(/#7c5ce0.*#f25da5/);

  await waitFor(() => expect(map.sources.get("preview-territory-boundaries")?.setData).toHaveBeenCalled());
  const boundaryCollection = map.sources.get("preview-territory-boundaries")?.setData.mock.calls.at(-1)?.[0] as {
    features: Array<{ id: string; properties: { ownerArtistId: string; ownerColor: string } }>;
  };
  expect(new Set(boundaryCollection.features.map((feature) => feature.id))).toEqual(new Set(Object.keys(expectedOwnerColors)));
  expect(boundaryCollection.features).toHaveLength(23);
  expect(Object.fromEntries(boundaryCollection.features.map((feature) => [feature.id, feature.properties.ownerColor])))
    .toEqual(expectedOwnerColors);
  expect(map.fitBounds).toHaveBeenLastCalledWith(
    [[128.9504, 35.0436], [129.1993, 35.2708]],
    { padding: { top: 56, right: 420, bottom: 56, left: 56 }, maxZoom: 9, duration: 700 },
  );

  rerender(
    <TerritoryMap
      mapConfig={config}
      session={{ ...session, selectedTerritoryId: "daegu" }}
      listedTerritories={session.territories.filter((territory) => territory.id === "daegu")}
      activeFilter="all"
      selectedTerritoryId="daegu"
      onSelectTerritory={() => undefined}
    />,
  );
  await waitFor(() => expect(map.fitBounds).toHaveBeenLastCalledWith(
    [[128.4813, 35.7683], [128.7623, 36.0093]],
    { padding: { top: 56, right: 420, bottom: 56, left: 56 }, maxZoom: 9, duration: 700 },
  ));

  const initialInnerWidth = window.innerWidth;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 640 });
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  rerender(
    <TerritoryMap
      mapConfig={config}
      session={{ ...session, selectedTerritoryId: "gwangju" }}
      listedTerritories={session.territories.filter((territory) => territory.id === "gwangju")}
      activeFilter="all"
      selectedTerritoryId="gwangju"
      onSelectTerritory={() => undefined}
    />,
  );
  await waitFor(() => expect(map.fitBounds).toHaveBeenLastCalledWith(
    [[126.8229, 35.1501], [127.0058, 35.2546]],
    { padding: 32, maxZoom: 9, duration: 700 },
  ));

  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
  rerender(
    <TerritoryMap
      mapConfig={config}
      session={{ ...session, selectedTerritoryId: "busan" }}
      listedTerritories={session.territories.filter((territory) => territory.id === "busan")}
      activeFilter="all"
      selectedTerritoryId="busan"
      onSelectTerritory={() => undefined}
    />,
  );
  await waitFor(() => expect(map.fitBounds).toHaveBeenLastCalledWith(
    [[128.9504, 35.0436], [129.1993, 35.2708]],
    { padding: 32, maxZoom: 9, duration: 0 },
  ));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: initialInnerWidth });
  await userEvent.setup().click(screen.getByRole("button", { name: "전국 보기" }));
  expect(map.fitBounds).toHaveBeenLastCalledWith([[124.5, 32.8], [131.9, 38.9]], { duration: 0 });
});
