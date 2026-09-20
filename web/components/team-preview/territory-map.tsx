"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import * as maplibregl from "maplibre-gl";
import type { ExpressionSpecification, GeoJSONSource, GeoJSONSourceSpecification, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "maplibre-gl/dist/maplibre-gl-shared.mjs?url";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { TerritoryList } from "@/components/team-preview/territory-list";
import { useBodyScrollLock } from "@/components/ui/use-body-scroll-lock";
import { ChevronRight, LocateFixed, Maximize, RotateCcw, X } from "@/components/ui/icons";
import { getPlayableExpedition, previewContent } from "@/features/team-preview/content";
import type { DemoSession } from "@/features/team-preview/demo-session";
import { t } from "@/features/team-preview/i18n";
import { useLiveLocation, type LiveLocationPosition } from "@/features/map/use-live-location";
import { ownerColor, strongholdColor, territoryBounds } from "@/features/team-preview/map-presentation";
import type { PreviewTerritory, TerritoryId } from "@/features/team-preview/types";
import { mapStyleUrl, type MapConfig } from "@/lib/map-config";
import type { TerritoryFilter } from "./map-filters";

interface TerritoryMapProps {
  filters?: ReactNode;
  mapConfig: MapConfig | null;
  session: DemoSession;
  listedTerritories?: readonly PreviewTerritory[];
  activeFilter?: TerritoryFilter;
  selectedTerritoryId: TerritoryId | null;
  /** Bumped by the page to frame the selected territory again, so a second
   *  click on the map re-centres instead of doing nothing. */
  recentreToken?: number;
  /** The map reports where the pick came from: a polygon on the map needs the
   *  list and card brought to the reader, a list card does not. */
  onSelectTerritory: (territoryId: TerritoryId, source?: "map" | "list") => void;
}

const boundarySourceId = "preview-territory-boundaries";
const nationSourceId = "preview-nation";
const strongholdSourceId = "preview-strongholds";
const connectionSourceId = "preview-artist-connections";
const myLocationSourceId = "my-location";
const myLocationLayerId = "my-location-dot";
const territoryLayerId = "preview-territory-fill";
const selectedLayerId = "preview-territory-selected";
const selectedOutlineLayerId = "preview-territory-selected-outline";
const nationalBounds = [[124.5, 32.8], [131.9, 38.9]] as [[number, number], [number, number]];

// maplibre-gl v6 locates its worker via `new URL(..., import.meta.url)`, a
// form Vite doesn't statically detect, so the worker 404s in a production
// build and every vector layer silently fails to render (the style and
// sprites still load fine over plain fetches, so nothing looks wrong until
// you check for actual map content). Pointing it at Vite's own bundled
// worker asset fixes that.
maplibregl.setWorkerUrl(maplibreWorkerUrl);
const ownerColors = Object.fromEntries(previewContent.artists.map((artist) => [artist.id, artist.color]));
const strongholdRadiusExpression: ExpressionSpecification = ["match", ["get", "stage"], "seed", 7, "tree", 11, "landmark", 16, 7];
const markerLabels = Object.fromEntries(previewContent.artists.map((artist) => [artist.id, artist.markerLabel]));

/**
 * The world stays on the map, but only as setting: its colours are washed
 * halfway to white and its borders and labels are hidden, so the only lines
 * and the strongest colours belong to the country this game is played in.
 */
function softenHex(hex: string, towardsWhite = 0.74) {
  const value = hex.trim().replace("#", "");
  const full = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
  if (full.length !== 6 || /[^0-9a-f]/i.test(full)) return null;
  const channels = [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16));
  const mixed = channels.map((channel) => Math.round(channel + (255 - channel) * towardsWhite));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** A style may hand its colours over as a bare hex or buried in an
 *  expression — a country palette keyed off a property, say — so walk it. */
function softenPaintValue(value: unknown): unknown {
  if (typeof value === "string") return softenHex(value) ?? undefined;
  if (Array.isArray(value)) {
    let changed = false;
    const walked = value.map((item) => {
      const next = softenPaintValue(item);
      if (next === undefined) return item;
      changed = true;
      return next;
    });
    return changed ? walked : undefined;
  }
  return undefined;
}

function neutraliseBaseMap(map: MapLibreMap) {
  if (typeof map.getStyle !== "function") return;
  const style = map.getStyle();
  for (const layer of style?.layers ?? []) {
    if (layer.id.startsWith("preview-") || layer.id.startsWith("my-location")) continue;
    if (typeof map.setPaintProperty !== "function" || typeof map.setLayoutProperty !== "function") return;
    try {
      if (layer.type === "line" || layer.type === "symbol") {
        // Country borders and place labels belong to the scenery.
        map.setLayoutProperty(layer.id, "visibility", "none");
        continue;
      }
      const property = layer.type === "background" ? "background-color" : layer.type === "fill" ? "fill-color" : null;
      if (!property) continue;
      const softened = softenPaintValue(map.getPaintProperty(layer.id, property));
      // A paint value is whatever the style put there; MapLibre validates it.
      if (softened !== undefined) map.setPaintProperty(layer.id, property, softened as never);
    } catch {
      // A style may not accept every property; the rest still softens.
    }
  }
}

/**
 * The data's centroid is a representative point, not the middle of the shape
 * that gets drawn, so markers drifted off their territory. Take the centre of
 * the largest ring's bounding box instead, which sits under the body of the
 * shape a reader sees.
 */
function shapeCentres(collection: { features: unknown[] }) {
  const centres = new Map<string, { longitude: number; latitude: number }>();
  for (const feature of collection.features) {
    const candidate = feature as {
      id?: string | number;
      properties?: { id?: string };
      geometry?: { type?: string; coordinates?: unknown };
    };
    const id = String(candidate.id ?? candidate.properties?.id ?? "");
    const bounds = territoryBounds(feature);
    if (!id || !bounds) continue;
    centres.set(id, {
      longitude: (bounds[0][0] + bounds[1][0]) / 2,
      latitude: (bounds[0][1] + bounds[1][1]) / 2,
    });
  }
  return centres;
}

function pointCollection(territories: readonly PreviewTerritory[], availableLogoIds: ReadonlySet<string> = new Set(), centres: ReadonlyMap<string, { longitude: number; latitude: number }> = new Map(), selectedArtistId: string | null = null, locale: "ko" | "en" = "ko") {
  return {
    type: "FeatureCollection" as const,
    features: territories.map((territory) => ({
      type: "Feature" as const,
      id: territory.id,
      properties: {
        id: territory.id,
        ownerArtistId: territory.ownerArtistId,
        ownerColor: strongholdColor(territory.ownerArtistId, territory.strongholdStage, ownerColors),
        artistLabel: markerLabels[territory.ownerArtistId] ?? territory.ownerArtistId.slice(0, 2).toUpperCase(),
        logoId: availableLogoIds.has(territory.ownerArtistId) ? `artist-logo-${territory.ownerArtistId}` : "",
        stage: territory.strongholdStage,
        name: territory.name[locale],
        // Zoomed out, markers overlap; ours has to win that pile-up.
        mine: territory.ownerArtistId === selectedArtistId ? 1 : 0,
      },
      geometry: {
        type: "Point" as const,
        coordinates: (() => {
          const centre = centres.get(territory.id) ?? territory.centroid;
          return [centre.longitude, centre.latitude];
        })(),
      },
    })),
  };
}

function ownerColorExpression(territories: readonly PreviewTerritory[]): ExpressionSpecification {
  return [
    "match",
    ["id"],
    ...territories.flatMap((territory) => [
      territory.id,
      ownerColor(territory.ownerArtistId, ownerColors),
    ]),
    "#7559ff",
  ] as ExpressionSpecification;
}

function connectionCollection(session: DemoSession, centres: ReadonlyMap<string, { longitude: number; latitude: number }> = new Map()) {
  const artistId = session.artistConfirmed ? session.selectedArtistId : null;
  const artist = previewContent.artists.find((candidate) => candidate.id === artistId);
  return {
    type: "FeatureCollection" as const,
    features: artist ? previewContent.connections
      .filter((connection) => connection.artistId === artist.id)
      .map((connection) => {
        const territory = session.territories.find((candidate) => candidate.id === connection.territoryId);
        return territory ? {
          type: "Feature" as const,
          id: connection.id,
          properties: { id: connection.id, artistId: artist.id, territoryId: territory.id, artistColor: artist.color },
          geometry: { type: "Point" as const, coordinates: [(centres.get(territory.id) ?? territory.centroid).longitude, (centres.get(territory.id) ?? territory.centroid).latitude] },
        } : null;
      })
      .filter((feature) => feature !== null) : [],
  };
}

function myLocationCollection(position: LiveLocationPosition | null) {
  return {
    type: "FeatureCollection" as const,
    features: position ? [{
      type: "Feature" as const,
      properties: {},
      geometry: { type: "Point" as const, coordinates: [position.longitude, position.latitude] },
    }] : [],
  };
}

function updateGeoJsonSource(map: MapLibreMap, sourceId: string, data: GeoJSONSourceSpecification["data"]) {
  (map.getSource(sourceId) as GeoJSONSource | undefined)?.setData(data);
}

function visibleLayerFilters(territories: readonly PreviewTerritory[]) {
  const territoryIds = territories.map((territory) => territory.id);
  return {
    boundaries: ["in", ["id"], ["literal", territoryIds]] as const,
  };
}

/**
 * Every territory wears its owner's colour. Ours is laid on thickly so the
 * fandom's holdings read at a glance; everyone else's is washed out enough to
 * stay background. A territory the filter hides keeps the faintest tint, so
 * the country still reads as a whole.
 */
function filterOpacityExpression(territories: readonly PreviewTerritory[], selectedArtistId: string | null): ExpressionSpecification {
  return [
    "match",
    ["id"],
    ...territories.flatMap((territory) => [territory.id, territory.ownerArtistId === selectedArtistId ? 0.74 : 0.46]),
    0.18,
  ] as ExpressionSpecification;
}

function ownerBoundaryCollection(collection: { type: string; features: unknown[] }, territories: readonly PreviewTerritory[]) {
  const owners = new Map(territories.map((territory) => [territory.id, territory.ownerArtistId]));
  return {
    ...collection,
    features: collection.features.map((feature) => {
      const candidate = feature as { id?: string | number; properties?: Record<string, unknown> };
      const id = String(candidate.id ?? candidate.properties?.id ?? "");
      const ownerArtistId = owners.get(id) ?? null;
      return {
        ...candidate,
        properties: {
          ...candidate.properties,
          ownerArtistId,
          ownerColor: ownerArtistId ? ownerColor(ownerArtistId, ownerColors) : null,
        },
      };
    }),
  };
}

export function TerritoryMap({ filters, mapConfig, session, recentreToken = 0, listedTerritories: requestedTerritories, activeFilter = "all", selectedTerritoryId, onSelectTerritory }: TerritoryMapProps) {
  const listedTerritories = requestedTerritories ?? session.territories;
  const usesListedTerritories = requestedTerritories !== undefined;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const sessionRef = useRef(session);
  const selectedTerritoryIdRef = useRef(selectedTerritoryId);
  const onSelectTerritoryRef = useRef(onSelectTerritory);
  const listedTerritoriesRef = useRef(listedTerritories);
  const recentreTokenRef = useRef(0);
  const cameraSelectionRef = useRef(selectedTerritoryId);
  const [mapError, setMapError] = useState(false);
  const [listExpanded, setListExpanded] = useState(false);
  const [mapFocused, setMapFocused] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const { position: myPosition, status: myLocationStatus, requestPermission: requestMyLocation } = useLiveLocation();
  const myPositionRef = useRef(myPosition);
  const hasCenteredOnMyLocationRef = useRef(false);

  const toggleList = () => {
    const next = !listExpanded;
    setListExpanded(next);
    // Expanding reveals rows below the fold, so follow them by about two cards.
    if (next) window.scrollBy?.({ top: 210, behavior: "smooth" });
  };
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    sessionRef.current = session;
    selectedTerritoryIdRef.current = selectedTerritoryId;
    onSelectTerritoryRef.current = onSelectTerritory;
    listedTerritoriesRef.current = listedTerritories;
  }, [listedTerritories, onSelectTerritory, selectedTerritoryId, session]);

  useEffect(() => {
    myPositionRef.current = myPosition;
  }, [myPosition]);

  const [boundsByTerritoryId, setBoundsByTerritoryId] = useState<Map<string, [[number, number], [number, number]]>>(new Map());
  const boundaryCollectionRef = useRef<{ type: string; features: unknown[] } | null>(null);
  const shapeCentresRef = useRef<ReadonlyMap<string, { longitude: number; latitude: number }>>(new Map());
  const availableLogoIdsRef = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    fetch("/data/preview-territories.geojson")
      .then((response) => response.ok ? response.json() : null)
      .then((collection: { features?: unknown[] } | null) => {
        if (!active || !collection?.features) return;
        boundaryCollectionRef.current = { type: "FeatureCollection", features: collection.features };
        shapeCentresRef.current = shapeCentres(boundaryCollectionRef.current);
        setBoundsByTerritoryId(new Map(collection.features.map((feature) => {
          const candidate = feature as { id?: string | number; properties?: { id?: string } };
          return [String(candidate.id ?? candidate.properties?.id ?? ""), territoryBounds(feature)] as const;
        }).filter((entry): entry is readonly [string, [[number, number], [number, number]]] => entry[1] !== null)));
        const map = mapRef.current;
        if (map) {
          updateGeoJsonSource(map, boundarySourceId, ownerBoundaryCollection(boundaryCollectionRef.current, sessionRef.current.territories));
          updateGeoJsonSource(map, strongholdSourceId, pointCollection(sessionRef.current.territories, availableLogoIdsRef.current, shapeCentresRef.current, sessionRef.current.selectedArtistId, sessionRef.current.locale));
          updateGeoJsonSource(map, connectionSourceId, connectionCollection(sessionRef.current, shapeCentresRef.current));
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!mapConfig || mapError || !containerRef.current) return;

    let active = true;
    let styleLoaded = false;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyleUrl(mapConfig),
      center: [127.8, 36.3],
      // The game is played in one country, so the view stays over it.
      maxBounds: [[122.5, 31.5], [133.5, 40.2]],
      zoom: 6.2,
      // A finger belongs to the page until it is put on the map, but a mouse
      // wheel should just zoom — a narrow window is not a touch screen.
      cooperativeGestures: window.matchMedia?.("(pointer: coarse)").matches ?? false,
      dragPan: false,
      scrollZoom: false,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({
      compact: true,
      customAttribution: '<a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">geoBoundaries</a>',
    }), "bottom-right");

    map.on("error", (event) => {
      const error = event.error;
      console.error("Amazon Location map error", error);
      if (active && !styleLoaded) setMapError(true);
    });

    map.on("load", () => {
      if (!active) return;
      styleLoaded = true;
      neutraliseBaseMap(map);
      // The country this game is played in: a pale ground under the fandom
      // colours, and the only white outline on the map.
      map.addSource(nationSourceId, {
        type: "geojson",
        data: "/data/korea-outline.geojson",
      });
      map.addSource(boundarySourceId, {
        type: "geojson",
        // MapLibre drops a feature id it cannot read as a number, which left
        // every ["id"] expression — fill colour, opacity, the selected
        // highlight — falling through to its default.
        promoteId: "id",
        data: boundaryCollectionRef.current
          ? ownerBoundaryCollection(boundaryCollectionRef.current, sessionRef.current.territories)
          : "/data/preview-territories.geojson",
      });
      map.addSource(strongholdSourceId, {
        type: "geojson",
        promoteId: "id",
        data: pointCollection(sessionRef.current.territories, availableLogoIdsRef.current, shapeCentresRef.current, sessionRef.current.selectedArtistId, sessionRef.current.locale),
      });
      map.addSource(connectionSourceId, {
        type: "geojson",
        data: connectionCollection(sessionRef.current, shapeCentresRef.current),
      });
      map.addSource(myLocationSourceId, {
        type: "geojson",
        data: myLocationCollection(myPositionRef.current),
      });

      map.addLayer({
        id: "preview-nation-fill",
        type: "fill",
        source: nationSourceId,
        paint: { "fill-color": "#ded0ff", "fill-opacity": 1 },
      });
      map.addLayer({
        id: "preview-nation-edge",
        type: "line",
        source: nationSourceId,
        // A white line on a pale sea needs something to sit against.
        paint: { "line-color": "#8f7fd4", "line-width": 3.4, "line-blur": 1.4, "line-opacity": 0.55 },
      });
      map.addLayer({
        id: "preview-nation-outline",
        type: "line",
        source: nationSourceId,
        paint: { "line-color": "#ffffff", "line-width": 1.4 },
      });
      map.addLayer({
        id: territoryLayerId,
        type: "fill",
        source: boundarySourceId,
        // A filter key set to undefined makes MapLibre reject the whole layer, so
        // spread it in only when the page is not already listing the territories.
        ...(usesListedTerritories ? {} : { filter: visibleLayerFilters(sessionRef.current.territories).boundaries }),
        paint: { "fill-color": ownerColorExpression(sessionRef.current.territories), "fill-opacity": filterOpacityExpression(listedTerritoriesRef.current, sessionRef.current.selectedArtistId) },
      });
      map.addLayer({
        id: selectedLayerId,
        type: "fill",
        source: boundarySourceId,
        filter: ["==", ["id"], selectedTerritoryIdRef.current ?? ""],
        paint: { "fill-color": ["get", "ownerColor"], "fill-opacity": 0.38 },
      });
      map.addLayer({
        id: "preview-territory-outline",
        type: "line",
        source: boundarySourceId,
        // A filter key set to undefined makes MapLibre reject the whole layer, so
        // spread it in only when the page is not already listing the territories.
        ...(usesListedTerritories ? {} : { filter: visibleLayerFilters(sessionRef.current.territories).boundaries }),
        // Quiet enough that white stays the country's own line.
        paint: { "line-color": "#16231d", "line-width": 0.6, "line-opacity": 0.22 },
      });
      map.addLayer({
        id: "preview-selected-fandom-outline",
        type: "line",
        source: boundarySourceId,
        filter: ["==", ["get", "ownerArtistId"], sessionRef.current.selectedArtistId ?? ""],
        // White belongs to the reader's own fandom, which is what tells them
        // at a glance which territories are theirs.
        paint: { "line-color": "#fffef9", "line-width": 2.6 },
      });
      map.addLayer({
        id: selectedOutlineLayerId,
        type: "line",
        source: boundarySourceId,
        filter: ["==", ["id"], selectedTerritoryIdRef.current ?? ""],
        paint: { "line-color": "#16231d", "line-width": 4 },
      });
      map.addLayer({
        id: "preview-artist-connection-pins",
        type: "circle",
        source: connectionSourceId,
        paint: {
          "circle-color": ["get", "artistColor"],
          "circle-radius": 7,
          "circle-stroke-color": "#fffef9",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "preview-stronghold-symbols",
        type: "circle",
        source: strongholdSourceId,
        layout: { "circle-sort-key": ["get", "mine"] },
        paint: {
          "circle-color": ["get", "ownerColor"],
          "circle-radius": strongholdRadiusExpression,
          "circle-stroke-color": ["get", "ownerColor"],
          "circle-stroke-width": 2,
          "circle-opacity": 0.68,
        },
      });
      map.addLayer({
        id: "preview-stronghold-identities",
        type: "symbol",
        source: strongholdSourceId,
        layout: {
          "symbol-sort-key": ["-", 0, ["get", "mine"]],
          "icon-image": ["get", "logoId"],
          "icon-size": ["match", ["get", "stage"], "seed", 0.12, "tree", 0.18, "landmark", 0.24, 0.12],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "text-field": ["case", ["==", ["get", "logoId"], ""], ["get", "artistLabel"], ""],
          "text-size": ["match", ["get", "stage"], "seed", 7, "tree", 8, "landmark", 9, 7],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#fffef9",
          "text-halo-color": "rgba(22,35,29,.5)",
          "text-halo-width": 0.7,
          "text-opacity": 0.96,
        },
      });

      map.addLayer({
        id: "preview-territory-names",
        type: "symbol",
        source: strongholdSourceId,
        // Zoomed out the names would pile onto the markers, so they wait until
        // there is room, sit under the marker, and drop out when they collide.
        minzoom: 7.2,
        layout: {
          "text-field": ["get", "name"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 7.2, 10, 10, 13],
          "text-offset": [0, 1.9],
          "text-anchor": "top",
          "text-allow-overlap": false,
          "text-optional": true,
        },
        paint: {
          "text-color": "#16231d",
          "text-halo-color": "#fffef9",
          "text-halo-width": 1.6,
        },
      });
      map.addLayer({
        id: myLocationLayerId,
        type: "circle",
        source: myLocationSourceId,
        paint: {
          "circle-color": "#3fa9ff",
          "circle-radius": 7,
          "circle-stroke-color": "#fffef9",
          "circle-stroke-width": 2,
        },
      });

      for (const artist of previewContent.artists.filter((candidate) => candidate.logoPath)) {
        const logoId = `artist-logo-${artist.id}`;
        map.loadImage(artist.logoPath!).then((image) => {
          if (!active || map.hasImage(logoId)) return;
          map.addImage(logoId, image.data);
          availableLogoIdsRef.current.add(artist.id);
          updateGeoJsonSource(map, strongholdSourceId, pointCollection(sessionRef.current.territories, availableLogoIdsRef.current, shapeCentresRef.current, sessionRef.current.selectedArtistId, sessionRef.current.locale));
        }).catch(() => undefined);
      }

      // Every marker a reader can aim at picks its territory, just like the area
      // under it, and the cursor says so. Connection pins and mission points
      // carry their territory in a property rather than as the feature id.
      const pickableLayerIds = [
        territoryLayerId,
        "preview-stronghold-symbols",
        "preview-stronghold-identities",
        "preview-artist-connection-pins",
      ];
      for (const layerId of pickableLayerIds) {
        if (!map.getLayer(layerId)) continue;
        map.on("click", layerId, (event) => {
          const feature = event.features?.[0];
          const territoryId = String(
            feature?.properties?.territoryId ?? feature?.id ?? feature?.properties?.id ?? "",
          );
          if (sessionRef.current.territories.some((territory) => territory.id === territoryId)) {
            onSelectTerritoryRef.current(territoryId, "map");
          }
        });
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });
      }
    });

    return () => {
      active = false;
      map.remove();
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [mapConfig, mapError, retryKey, usesListedTerritories]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    updateGeoJsonSource(map, strongholdSourceId, pointCollection(session.territories, availableLogoIdsRef.current, shapeCentresRef.current, session.selectedArtistId, session.locale));
    if (boundaryCollectionRef.current) {
      updateGeoJsonSource(map, boundarySourceId, ownerBoundaryCollection(boundaryCollectionRef.current, session.territories));
    }
    updateGeoJsonSource(map, connectionSourceId, connectionCollection(session, shapeCentresRef.current));
    if (map.getLayer(territoryLayerId)) {
      map.setPaintProperty(territoryLayerId, "fill-color", ownerColorExpression(session.territories));
    }
    if (map.getLayer("preview-selected-fandom-outline")) {
      map.setFilter("preview-selected-fandom-outline", ["==", ["get", "ownerArtistId"], session.selectedArtistId ?? ""]);
    }
    if (!usesListedTerritories) {
      const filters = visibleLayerFilters(session.territories);
      if (map.getLayer(territoryLayerId)) map.setFilter(territoryLayerId, filters.boundaries);
      if (map.getLayer("preview-territory-outline")) map.setFilter("preview-territory-outline", filters.boundaries);    }
  }, [session, usesListedTerritories]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer(territoryLayerId)) {
      map.setPaintProperty(territoryLayerId, "fill-opacity", filterOpacityExpression(listedTerritories, session.selectedArtistId));
    }
  }, [activeFilter, listedTerritories, session.selectedArtistId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const cameraRequested = cameraSelectionRef.current !== selectedTerritoryId
      || recentreTokenRef.current !== recentreToken;
    cameraSelectionRef.current = selectedTerritoryId;
    recentreTokenRef.current = recentreToken;
    const bounds = selectedTerritoryId ? boundsByTerritoryId.get(selectedTerritoryId) : null;
    if (cameraRequested && bounds) {
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      const compact = window.innerWidth < 768;
      map.fitBounds(bounds, {
        padding: compact ? 32 : 56,
        maxZoom: 9,
        duration: reducedMotion ? 0 : 700,
      });
    } else if (cameraRequested) {
      const territory = selectedTerritoryId
        ? session.territories.find((candidate) => candidate.id === selectedTerritoryId)
        : null;
      if (territory) {
        const camera = { center: [territory.centroid.longitude, territory.centroid.latitude] as [number, number], zoom: 8 };
        const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
        if (reducedMotion) map.jumpTo(camera);
        else map.flyTo(camera);
      }
    }
    if (map.getLayer(selectedLayerId)) {
      map.setFilter(selectedLayerId, ["==", ["id"], selectedTerritoryId ?? ""]);
    }
    if (map.getLayer(selectedOutlineLayerId)) {
      map.setFilter(selectedOutlineLayerId, ["==", ["id"], selectedTerritoryId ?? ""]);
    }
  }, [boundsByTerritoryId, recentreToken, selectedTerritoryId, session]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !myPosition) return;
    updateGeoJsonSource(map, myLocationSourceId, myLocationCollection(myPosition));
    if (!hasCenteredOnMyLocationRef.current) {
      hasCenteredOnMyLocationRef.current = true;
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      const camera = { center: [myPosition.longitude, myPosition.latitude] as [number, number], zoom: 14 };
      if (reducedMotion) map.jumpTo(camera);
      else map.flyTo(camera);
    }
  }, [myPosition]);

  const locateMe = () => {
    const map = mapRef.current;
    if (myLocationStatus === "active" && myPosition && map) {
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      const camera = { center: [myPosition.longitude, myPosition.latitude] as [number, number], zoom: 14 };
      if (reducedMotion) map.jumpTo(camera);
      else map.flyTo(camera);
      return;
    }
    requestMyLocation();
  };

  const retry = () => {
    setMapError(false);
    setRetryKey((current) => current + 1);
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (mapFocused) {
      map.dragPan?.enable();
      map.scrollZoom?.enable();
    } else {
      map.dragPan?.disable();
      map.scrollZoom?.disable();
    }
  }, [mapFocused, mapError, retryKey]);

  // A click outside hands the pointer back to the page.
  useEffect(() => {
    if (!mapFocused) return;
    const release = (event: MouseEvent) => {
      if (event.target instanceof Node && containerRef.current?.contains(event.target)) return;
      setMapFocused(false);
    };
    document.addEventListener("pointerdown", release);
    return () => document.removeEventListener("pointerdown", release);
  }, [mapFocused]);

  useBodyScrollLock(fullscreen);

  // The map keeps its own size, so it has to be told when the box changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const frame = window.requestAnimationFrame(() => map.resize?.());
    return () => window.cancelAnimationFrame(frame);
  }, [fullscreen, mapError, retryKey]);

  const resetNationalView = () => {
    const map = mapRef.current;
    if (!map) return;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    map.fitBounds(nationalBounds, { duration: reducedMotion ? 0 : 700 });
  };

  return (
    <section className={fullscreen ? "preview-map-boundary fullscreen" : "preview-map-boundary"}>
      {mapConfig && !mapError ? (
        <div
          ref={containerRef}
          data-guide="territory-map"
          className={mapFocused ? "preview-territory-map focused" : "preview-territory-map"}
          onPointerDown={() => setMapFocused(true)}
          // A mouse over the map is already aiming at it, so the wheel should
          // zoom without a click first. A finger is not: on a touch screen the
          // page keeps the gesture until the map is tapped.
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") setMapFocused(true);
          }}
          role="region"
          aria-label={session.locale === "ko" ? "대한민국 팬덤 영토 지도" : "Korea fandom territory map"}
        >
          <div className="preview-map-tools">
            <button
              type="button"
              aria-label={t(session.locale, myLocationStatus === "locating" ? "locating" : "locateMe")}
              aria-pressed={myLocationStatus === "active"}
              onClick={locateMe}
            >
              <LocateFixed size={16} strokeWidth={2.4} aria-hidden="true" />
            </button>
            <button type="button" aria-label={t(session.locale, "nationalView")} onClick={resetNationalView}>
              <RotateCcw size={16} strokeWidth={2.4} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="preview-map-fullscreen"
              aria-label={t(session.locale, fullscreen ? "mapExitFullscreen" : "mapFullscreen")}
              onClick={() => setFullscreen((open) => !open)}
            >
              {fullscreen
                ? <X size={16} strokeWidth={2.4} aria-hidden="true" />
                : <Maximize size={16} strokeWidth={2.4} aria-hidden="true" />}
            </button>
          </div>
          {myLocationStatus === "denied" || myLocationStatus === "unavailable" ? (
            <p className="preview-map-location-hint" role="status">
              {t(session.locale, myLocationStatus === "denied" ? "locationDenied" : "locationUnavailable")}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="preview-map-configuration" role="status">
          <strong>{t(session.locale, "mapUnavailable")}</strong>
          <span>{t(session.locale, "mapConfigError")}</span>
          {mapError ? <button type="button" onClick={retry}>{t(session.locale, "retry")}</button> : null}
        </div>
      )}
      <p className="preview-map-attribution">
        Map © <a href="https://aws.amazon.com/location/" target="_blank" rel="noreferrer">Amazon Location Service</a>
        {" · "}Boundaries © <a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">geoBoundaries</a>
      </p>
      <div className="preview-map-actions">
        {filters}
      </div>
      {listedTerritories.length > 0 ? (
        <button
          type="button"
          className={listExpanded ? "territory-list-toggle expanded" : "territory-list-toggle"}
          aria-expanded={listExpanded}
          aria-controls="preview-territory-list"
          aria-label={t(session.locale, listExpanded ? "territoryListCollapse" : "territoryListExpand")}
          onClick={toggleList}
        >
          <ChevronRight size={17} strokeWidth={2.8} aria-hidden="true" />
        </button>
      ) : null}
      <TerritoryList
        id="preview-territory-list"
        collapsed={!listExpanded}
        territories={listedTerritories}
        locale={session.locale}
        selectedArtistId={session.artistConfirmed ? session.selectedArtistId : null}
        selectedTerritoryId={selectedTerritoryId}
        onSelectTerritory={(territoryId) => onSelectTerritory(territoryId, "list")}
      />
    </section>
  );
}
