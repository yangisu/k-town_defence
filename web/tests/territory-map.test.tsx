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
  jumpTo: ReturnType<typeof vi.fn>;
  fitBounds: ReturnType<typeof vi.fn>;
  loadImage: ReturnType<typeof vi.fn>;
  hasImage: ReturnType<typeof vi.fn>;
  addImage: ReturnType<typeof vi.fn>;
  setFilter: ReturnType<typeof vi.fn>;
  setPaintProperty: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  emit: (event: string, value?: MapEvent) => void;
  emitLayer: (event: string, layer: string, value?: MapEvent) => void;
  canvas: { style: { cursor: string } };
  scrollZoom: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> };
  featureStates: { id: unknown; state: unknown }[];
  sourceSpecs: Map<string, { promoteId?: string; tolerance?: number; data?: unknown }>;
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
    jumpTo = vi.fn();
    fitBounds = vi.fn();
    loadImage = vi.fn(async () => ({ data: { width: 16, height: 16, data: new Uint8Array(16 * 16 * 4) } }));
    hasImage = vi.fn(() => false);
    addImage = vi.fn();
    setFilter = vi.fn();
    setPaintProperty = vi.fn();
    remove = vi.fn();
    scrollZoom = { enable: vi.fn(), disable: vi.fn() };
    dragPan = { enable: vi.fn(), disable: vi.fn() };

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

    canvas = { style: { cursor: "" } };
    getCanvas() { return this.canvas; }
    addControl() { return this; }
    sourceSpecs = new Map<string, { promoteId?: string; tolerance?: number; data?: unknown }>();
    addSource(id: string, specification?: { data?: unknown; promoteId?: string }) {
      this.sources.set(id, { setData: vi.fn(), initialData: specification?.data });
      this.sourceSpecs.set(id, specification ?? {});
      return this;
    }
    getSource(id: string) { return this.sources.get(id); }
    addLayer(layer: Record<string, unknown>) { this.layers.push(layer); return this; }
    getLayer(id: string) { return this.layers.find((layer) => layer.id === id); }
    getStyle() { return { layers: this.layers }; }
    featureStates: { id: unknown; state: unknown }[] = [];
    setFeatureState(target: { id: unknown }, state: unknown) { this.featureStates.push({ id: target.id, state }); return this; }
    getPaintProperty() { return undefined; }
    setLayoutProperty() { return this; }

    emit(event: string, value: MapEvent = {}) {
      for (const handler of this.handlers.get(event) ?? []) handler(value);
    }

    emitLayer(event: string, layer: string, value: MapEvent = {}) {
      for (const handler of this.layerHandlers.get(`${event}:${layer}`) ?? []) handler(value);
    }
  }

  class MockAttributionControl {}

  const maplibre = { Map: MockMap, AttributionControl: MockAttributionControl, setWorkerUrl: vi.fn() };
  return { ...maplibre, default: maplibre };
});

const config: MapConfig = {
  apiKey: "test-map-key",
  region: "ap-northeast-2",
  styleName: "Standard",
};

type GeolocationSuccess = (position: GeolocationPosition) => void;
type GeolocationFailure = (error: GeolocationPositionError) => void;

function mockGeolocation({ deny = false }: { deny?: boolean } = {}) {
  let success: GeolocationSuccess | null = null;
  let failure: GeolocationFailure | null = null;
  const geolocation: Geolocation = {
    getCurrentPosition: vi.fn(),
    watchPosition: vi.fn((onSuccess: GeolocationSuccess, onFailure?: GeolocationFailure) => {
      success = onSuccess;
      failure = onFailure ?? null;
      if (deny) failure?.({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
      return 1;
    }),
    clearWatch: vi.fn(),
  };
  vi.stubGlobal("navigator", { ...globalThis.navigator, geolocation });
  return {
    emitPosition: (latitude: number, longitude: number, accuracy = 20) => {
      success?.({ coords: { latitude, longitude, accuracy } as GeolocationCoordinates, timestamp: Date.now() });
    },
  };
}

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
  expect((mapRegion as HTMLElement).style.minHeight).toBe("");
  expect(mapHarness.instances[0].options.style).toBe(
    "https://maps.geo.ap-northeast-2.amazonaws.com/v2/styles/Standard/descriptor?key=test-map-key&color-scheme=Light",
  );

  mapHarness.instances[0].emit("load");
  expect(mapHarness.instances[0].flyTo).not.toHaveBeenCalled();
  expect(mapHarness.instances[0].fitBounds).not.toHaveBeenCalled();
  mapHarness.instances[0].emitLayer("click", "preview-territory-fill", {
    features: [{ id: "daegu", properties: { id: "daegu" } }],
  });
  expect(onSelectTerritory).toHaveBeenLastCalledWith("daegu", "map");

  const list = screen.getByRole("list", { name: "지도와 같은 영토 목록" });
  await user.click(within(list).getByRole("button", { name: /^대구/ }));
  expect(onSelectTerritory).toHaveBeenLastCalledWith("daegu", "list");

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
  expect(mapHarness.instances[0].setFilter).toHaveBeenCalledWith(
    "preview-territory-selected",
    ["==", ["id"], ""],
  );
  expect(mapHarness.instances[0].setFilter).toHaveBeenCalledWith(
    "preview-territory-selected-outline",
    ["==", ["id"], ""],
  );
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
  expect(onSelectTerritory).toHaveBeenCalledWith("yeongwol", "list");
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
  expect(screen.getByRole("link", { name: "통계청 SGIS" })).toBeVisible();
  expect(screen.getByRole("link", { name: "admdongkor" })).toBeVisible();

  const list = screen.getByRole("list", { name: "지도와 같은 영토 목록" });
  await user.click(within(list).getByRole("button", { name: /^부산/ }));
  expect(onSelectTerritory).toHaveBeenCalledWith("busan", "list");

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

it("keeps configured boundary and click layers equivalent to the filtered territory list", () => {
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

  expect(map.layers.find((layer) => layer.id === "preview-territory-fill")?.filter)
    .toEqual(yeongwolBoundaryFilter);
  expect(map.layers.find((layer) => layer.id === "preview-territory-outline")?.filter)
    .toEqual(yeongwolBoundaryFilter);

  map.emitLayer("click", "preview-territory-fill", { features: [{ id: "busan" }] });
  expect(onSelectTerritory).not.toHaveBeenCalled();
  map.emitLayer("click", "preview-territory-fill", { features: [{ id: "yeongwol" }] });
  expect(onSelectTerritory).toHaveBeenCalledWith("yeongwol", "map");

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
  expect(map.setFilter).toHaveBeenCalledWith("preview-territory-fill", busanBoundaryFilter);
  expect(map.setFilter).toHaveBeenCalledWith("preview-territory-outline", busanBoundaryFilter);
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

it("renders translucent territory ownership with artist identity inside each stronghold marker", () => {
  const session = createInitialDemoSession();
  render(
    <TerritoryMap
      mapConfig={config}
      session={session}
      selectedTerritoryId="busan"
      onSelectTerritory={() => undefined}
    />,
  );
  mapHarness.instances[0].emit("load");

  const fill = mapHarness.instances[0].layers.find((layer) => layer.id === "preview-territory-fill");
  const strongholds = mapHarness.instances[0].layers.find((layer) => layer.id === "preview-stronghold-symbols");
  const identities = mapHarness.instances[0].layers.find((layer) => layer.id === "preview-stronghold-identities");
  const source = mapHarness.instances[0].sources.get("preview-strongholds")?.initialData as {
    features: Array<{ properties: { artistLabel: string; logoId: string | null } }>;
  };

  expect(fill?.paint).toEqual(expect.objectContaining({ "fill-opacity": expect.any(Array) }));
  expect(strongholds?.paint).toEqual(expect.objectContaining({ "circle-opacity": 0.68 }));
  expect(identities).toEqual(expect.objectContaining({
    type: "symbol",
    layout: expect.objectContaining({
      "icon-image": ["get", "logoId"],
      "text-field": ["case", ["==", ["get", "logoId"], ""], ["get", "artistLabel"], ""],
    }),
  }));
  expect(source.features.every((feature) => feature.properties.artistLabel.length > 0)).toBe(true);
});

it("fills the selected territory above the base fill and uses fandom-colored stronghold rings", () => {
  const session = createInitialDemoSession();
  render(
    <TerritoryMap
      mapConfig={config}
      session={session}
      selectedTerritoryId="gunpo"
      onSelectTerritory={() => undefined}
    />,
  );
  const map = mapHarness.instances[0];
  map.emit("load");

  const layerIds = map.layers.map((layer) => layer.id);
  expect(layerIds.indexOf("preview-territory-fill"))
    .toBeLessThan(layerIds.indexOf("preview-territory-selected"));
  expect(layerIds.indexOf("preview-territory-selected"))
    .toBeLessThan(layerIds.indexOf("preview-territory-outline"));
  expect(layerIds.indexOf("preview-territory-selected-outline"))
    .toBeLessThan(layerIds.indexOf("preview-stronghold-symbols"));
  expect(map.layers.find((layer) => layer.id === "preview-territory-selected")).toMatchObject({
    type: "fill",
    filter: ["==", ["id"], "gunpo"],
    paint: { "fill-color": ["get", "ownerColor"], "fill-opacity": 0.38 },
  });
  expect(map.layers.find((layer) => layer.id === "preview-territory-selected-outline")).toMatchObject({
    type: "line",
    filter: ["==", ["id"], "gunpo"],
    paint: { "line-color": "#16231d", "line-width": 4 },
  });
  expect(map.layers.find((layer) => layer.id === "preview-stronghold-symbols")?.paint).toEqual(expect.objectContaining({
    "circle-stroke-color": ["get", "ownerColor"],
    "circle-stroke-width": 2,
  }));
});

it("uses an immediate camera transition when reduced motion is requested and polygon bounds are unavailable", () => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
  const initial = {
    ...createInitialDemoSession(),
    artistConfirmed: true,
    selectedArtistId: "bts" as const,
    selectedTerritoryId: null,
  };
  const { rerender } = render(
    <TerritoryMap mapConfig={config} session={initial} selectedTerritoryId={null} onSelectTerritory={() => undefined} />,
  );
  const map = mapHarness.instances[0];
  map.emit("load");

  rerender(
    <TerritoryMap
      mapConfig={config}
      session={{ ...initial, selectedTerritoryId: "daegu" }}
      selectedTerritoryId="daegu"
      onSelectTerritory={() => undefined}
    />,
  );

  expect(map.jumpTo).toHaveBeenCalledWith({ center: [128.6014, 35.8714], zoom: 8 });
  expect(map.flyTo).not.toHaveBeenCalled();
});

it("keeps nationwide ownership on semantic layers while filtering the accessible list and resetting the camera", async () => {
  const geoJson = JSON.parse(readFileSync(resolve(process.cwd(), "public/data/preview-territories.geojson"), "utf8"));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => geoJson }));
  const expectedOwnerColors = {
    busan: "#7c5ce0", daegu: "#7c5ce0", gwangju: "#59a85f", gunpo: "#f25da5", seongnam: "#f25da5",
    geoje: "#d66d55", suwon: "#4c66d6", gyeongju: "#d66d55", daejeon: "#e0384a", seoul: "#8e2f6f",
    yongin: "#2e9d78", goyang: "#2e9d78", incheon: "#e0384a", jeju: "#e0384a", ulsan: "#f28a45",
    siheung: "#f28a45", cheonan: "#3a9edb", pohang: "#3a9edb", wonju: "#59a85f", chuncheon: "#4b9de0",
    uijeongbu: "#8e2f6f", namyangju: "#45a9ad", yeongwol: "#7c5ce0",
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
  expect(map.layers.find((layer) => layer.id === "preview-selected-fandom-outline")?.paint)
    // The fandom's own colour marks its territories; white is the coast. This
    // edge rests at full strength, so hover has to answer in weight.
    .toEqual({
      "line-color": ["get", "ownerColor"],
      "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 4.2, 1.6],
      "line-width-transition": { duration: 180, delay: 0 },
    });
  // A halo in the fandom's own colour vanishes into its own fill, so the
  // reader's territories glow white and everyone else's glow their colour.
  expect((map.layers.find((layer) => layer.id === "preview-territory-glow")?.paint as Record<string, unknown>)?.["line-color"])
    .toEqual(["case", ["==", ["get", "ownerArtistId"], "bts"], "#ffffff", ["get", "ownerColor"]]);
  expect(map.layers.find((layer) => layer.id === "preview-territory-selected"))
    .toMatchObject({ type: "fill", paint: { "fill-color": ["get", "ownerColor"], "fill-opacity": 0.38 } });
  expect(map.layers.find((layer) => layer.id === "preview-territory-selected-outline"))
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
  expect(map.fitBounds).not.toHaveBeenCalled();

  rerender(
    <TerritoryMap
      mapConfig={config}
      session={{ ...session, selectedTerritoryId: "daegu" }}
      listedTerritories={session.territories}
      activeFilter="all"
      selectedTerritoryId="daegu"
      onSelectTerritory={() => undefined}
    />,
  );
  await waitFor(() => expect(map.fitBounds).toHaveBeenLastCalledWith(
    [[128.3507, 35.6068], [128.9001, 36.327]],
    { padding: 56, maxZoom: 9, duration: 700 },
  ));

  const allOpacity = map.setPaintProperty.mock.calls
    .filter(([layer, property]) => layer === "preview-territory-fill" && property === "fill-opacity")
    .at(-1)?.[2];
  // Ours is laid on thickly, everyone else's stays background.
  expect(allOpacity).toEqual(expect.arrayContaining([
    "busan", 0.74,
    "daegu", 0.74,
    "yeongwol", 0.74,
    "gwangju", 0.46,
  ]));

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
    [[126.6479, 35.0524], [127.0215, 35.259]],
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
    [[128.7936, 34.9942], [129.3045, 35.3879]],
    { padding: 32, maxZoom: 9, duration: 0 },
  ));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: initialInnerWidth });
  // One reset now sits on the map corner at every width.
  const resets = screen.getAllByRole("button", { name: "전국 보기" });
  expect(resets).toHaveLength(1);
  await userEvent.setup().click(resets[0]);
  expect(map.fitBounds).toHaveBeenLastCalledWith([[124.5, 32.8], [131.9, 38.9]], { duration: 0 });
});

it("locate-me button requests permission and feeds a real position into the my-location source", async () => {
  const user = userEvent.setup();
  const { emitPosition } = mockGeolocation();
  render(
    <TerritoryMap
      mapConfig={config}
      session={createInitialDemoSession()}
      selectedTerritoryId="busan"
      onSelectTerritory={() => undefined}
    />,
  );
  const map = mapHarness.instances[0];
  map.emit("load");
  expect(map.sources.get("my-location")).toBeDefined();

  await user.click(screen.getByLabelText("내 위치로 이동"));
  emitPosition(37.5665, 126.978);

  await waitFor(() => expect(map.sources.get("my-location")?.setData).toHaveBeenCalledWith(
    expect.objectContaining({ features: [expect.objectContaining({
      geometry: { type: "Point", coordinates: [126.978, 37.5665] },
    })] }),
  ));
  expect(map.flyTo).toHaveBeenCalledWith({ center: [126.978, 37.5665], zoom: 14 });
});

it("denied location permission shows an inline hint instead of throwing", async () => {
  const user = userEvent.setup();
  mockGeolocation({ deny: true });
  render(
    <TerritoryMap
      mapConfig={config}
      session={createInitialDemoSession()}
      selectedTerritoryId="busan"
      onSelectTerritory={() => undefined}
    />,
  );
  mapHarness.instances[0].emit("load");

  await user.click(screen.getByLabelText("내 위치로 이동"));

  expect(await screen.findByText("위치 권한이 필요해요. 브라우저 설정에서 허용해 주세요.")).toBeVisible();
});

it("picks a territory from its stronghold marker and points the cursor at it", async () => {
  const onSelectTerritory = vi.fn();
  render(
    <TerritoryMap
      mapConfig={config}
      session={createInitialDemoSession()}
      selectedTerritoryId={null}
      onSelectTerritory={onSelectTerritory}
    />,
  );

  const map = mapHarness.instances[0];
  map.emit("load");

  // The marker is what a reader aims at, so it selects the same territory the
  // area under it would, and reports the map as the source.
  map.emitLayer("click", "preview-stronghold-symbols", { features: [{ id: "busan" }] });
  expect(onSelectTerritory).toHaveBeenCalledWith("busan", "map");

  map.emitLayer("mousemove", "preview-stronghold-symbols", { features: [{ id: "busan" }] });
  expect(map.canvas.style.cursor).toBe("pointer");
  // Hover is a feature state, which is what the paint expressions read.
  expect(map.featureStates).toContainEqual({ id: "busan", state: { hover: true } });
  map.emitLayer("mouseleave", "preview-stronghold-symbols");
  expect(map.canvas.style.cursor).toBe("");
});

it("never hands MapLibre a filter key without a filter", async () => {
  render(
    <TerritoryMap
      mapConfig={config}
      session={createInitialDemoSession()}
      listedTerritories={createInitialDemoSession().territories.slice(0, 3)}
      selectedTerritoryId={null}
      onSelectTerritory={() => undefined}
    />,
  );
  mapHarness.instances[0].emit("load");

  // `filter: undefined` fails MapLibre's style validation, which drops the
  // whole layer — the territory fill included, so nothing on the map could be
  // clicked and no boundary was drawn.
  for (const layer of mapHarness.instances[0].layers) {
    if (!("filter" in layer)) continue;
    expect(Array.isArray(layer.filter), `${layer.id} filter`).toBe(true);
  }
});

it("promotes the territory id so the owner colours and highlight resolve", async () => {
  render(
    <TerritoryMap
      mapConfig={config}
      session={createInitialDemoSession()}
      selectedTerritoryId={null}
      onSelectTerritory={() => undefined}
    />,
  );
  mapHarness.instances[0].emit("load");

  // MapLibre drops a feature id it cannot read as a number, which left every
  // ["id"] expression — fill colour, opacity, the selected highlight — falling
  // through to its default, so every territory came out the same purple.
  const source = mapHarness.instances[0].sourceSpecs.get("preview-territory-boundaries");
  expect(source?.promoteId).toBe("id");
  expect(mapHarness.instances[0].sourceSpecs.get("preview-strongholds")?.promoteId).toBe("id");

  // The coastline belongs to two sources at once, and MapLibre simplifies each
  // one separately: identical coordinates tiled into different vertices, so the
  // national outline and the region edges above it drew apart. Both keep every
  // vertex, so the two trace the same line.
  expect(source?.tolerance).toBe(0);
  expect(mapHarness.instances[0].sourceSpecs.get("preview-nation")?.tolerance).toBe(0);
});

it("draws the country this game is played in, and only its outline in white", async () => {
  render(
    <TerritoryMap
      mapConfig={config}
      session={createInitialDemoSession()}
      selectedTerritoryId={null}
      onSelectTerritory={() => undefined}
    />,
  );
  mapHarness.instances[0].emit("load");

  const layers = mapHarness.instances[0].layers;
  const ground = layers.find((layer) => layer.id === "preview-nation-fill");
  const outline = layers.find((layer) => layer.id === "preview-nation-outline");
  expect(ground).toMatchObject({ type: "fill", source: "preview-nation" });
  expect(outline).toMatchObject({ type: "line", paint: { "line-color": "#ffffff" } });
  // The ground sits under everything this product draws on top of it.
  expect(layers.indexOf(ground!)).toBeLessThan(layers.findIndex((layer) => layer.id === "preview-territory-fill"));
});

it("names each territory once there is room for the name", async () => {
  render(
    <TerritoryMap
      mapConfig={config}
      session={createInitialDemoSession()}
      selectedTerritoryId={null}
      onSelectTerritory={() => undefined}
    />,
  );
  mapHarness.instances[0].emit("load");

  const names = mapHarness.instances[0].layers.find((layer) => layer.id === "preview-territory-names");
  expect(names).toMatchObject({ type: "symbol", source: "preview-strongholds" });
  // Zoomed out the names would pile onto the markers, so they wait for room
  // and drop out rather than overlap.
  expect(names?.minzoom).toBeGreaterThan(6.2);
  expect(names?.layout).toMatchObject({ "text-allow-overlap": false, "text-optional": true });
});

it("hands the wheel to the map only once the reader clicks it", async () => {
  const user = userEvent.setup();
  render(
    <TerritoryMap
      mapConfig={config}
      session={createInitialDemoSession()}
      selectedTerritoryId={null}
      onSelectTerritory={() => undefined}
    />,
  );
  const map = mapHarness.instances[0];
  map.emit("load");

  // Until then the page keeps its own scrolling.
  expect(map.scrollZoom.enable).not.toHaveBeenCalled();

  await user.click(screen.getByRole("region", { name: "대한민국 팬덤 영토 지도" }));
  expect(map.scrollZoom.enable).toHaveBeenCalled();

  // Clicking away gives it back.
  await user.click(document.body);
  expect(map.scrollZoom.disable).toHaveBeenCalled();
});
