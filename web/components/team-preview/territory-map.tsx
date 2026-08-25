"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type ExpressionSpecification, type GeoJSONSource, type GeoJSONSourceSpecification, type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { TerritoryList } from "@/components/team-preview/territory-list";
import { getPlayableExpedition, previewContent } from "@/features/team-preview/content";
import type { DemoSession } from "@/features/team-preview/demo-session";
import { t } from "@/features/team-preview/i18n";
import { ownerColor, strongholdColor, territoryBounds } from "@/features/team-preview/map-presentation";
import type { PreviewTerritory, TerritoryId } from "@/features/team-preview/types";
import { amazonLocationStyleUrl, type MapConfig } from "@/lib/map-config";
import type { TerritoryFilter } from "./map-filters";

interface TerritoryMapProps {
  mapConfig: MapConfig | null;
  session: DemoSession;
  listedTerritories?: readonly PreviewTerritory[];
  activeFilter?: TerritoryFilter;
  selectedTerritoryId: TerritoryId | null;
  onSelectTerritory: (territoryId: TerritoryId) => void;
}

const boundarySourceId = "preview-territory-boundaries";
const strongholdSourceId = "preview-strongholds";
const missionSourceId = "preview-missions";
const expeditionSourceId = "preview-selected-expedition";
const connectionSourceId = "preview-artist-connections";
const territoryLayerId = "preview-territory-fill";
const selectedLayerId = "preview-territory-selected";
const selectedOutlineLayerId = "preview-territory-selected-outline";
const nationalBounds = [[124.5, 32.8], [131.9, 38.9]] as [[number, number], [number, number]];
const ownerColors = Object.fromEntries(previewContent.artists.map((artist) => [artist.id, artist.color]));
const strongholdRadiusExpression: ExpressionSpecification = ["match", ["get", "stage"], "seed", 7, "tree", 11, "landmark", 16, 7];
const markerLabels = Object.fromEntries(previewContent.artists.map((artist) => [artist.id, artist.markerLabel]));

function pointCollection(territories: readonly PreviewTerritory[], availableLogoIds: ReadonlySet<string> = new Set()) {
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
      },
      geometry: {
        type: "Point" as const,
        coordinates: [territory.centroid.longitude, territory.centroid.latitude],
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

function connectionCollection(session: DemoSession) {
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
          geometry: { type: "Point" as const, coordinates: [territory.centroid.longitude, territory.centroid.latitude] },
        } : null;
      })
      .filter((feature) => feature !== null) : [],
  };
}

function missionCollection() {
  return {
    type: "FeatureCollection" as const,
    features: previewContent.places.map((place) => ({
      type: "Feature" as const,
      id: place.id,
      properties: { id: place.id, territoryId: place.territoryId },
      geometry: {
        type: "Point" as const,
        coordinates: [place.coordinates.longitude, place.coordinates.latitude],
      },
    })),
  };
}

function expeditionCollection(session: DemoSession, selectedTerritoryId: TerritoryId | null) {
  const expedition = session.selectedArtistId && selectedTerritoryId
    ? getPlayableExpedition(session.selectedArtistId, selectedTerritoryId)
    : null;
  const coordinates = expedition?.stopIds
    .map((stopId) => previewContent.places.find((place) => place.id === stopId))
    .filter((place) => place !== undefined)
    .map((place) => [place.coordinates.longitude, place.coordinates.latitude]) ?? [];

  return {
    type: "FeatureCollection" as const,
    features: coordinates.length >= 2 ? [{
      type: "Feature" as const,
      properties: { expeditionId: expedition!.id },
      geometry: { type: "LineString" as const, coordinates },
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
    missions: ["in", ["get", "territoryId"], ["literal", territoryIds]] as const,
  };
}

function filterOpacityExpression(territories: readonly PreviewTerritory[], selectedArtistId: string | null): ExpressionSpecification {
  return [
    "match",
    ["id"],
    ...territories.flatMap((territory) => [territory.id, territory.ownerArtistId === selectedArtistId ? 0.28 : 0.16]),
    0.06,
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

export function TerritoryMap({ mapConfig, session, listedTerritories: requestedTerritories, activeFilter = "all", selectedTerritoryId, onSelectTerritory }: TerritoryMapProps) {
  const listedTerritories = requestedTerritories ?? session.territories;
  const usesListedTerritories = requestedTerritories !== undefined;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const sessionRef = useRef(session);
  const selectedTerritoryIdRef = useRef(selectedTerritoryId);
  const onSelectTerritoryRef = useRef(onSelectTerritory);
  const listedTerritoriesRef = useRef(listedTerritories);
  const cameraSelectionRef = useRef(selectedTerritoryId);
  const [mapError, setMapError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    sessionRef.current = session;
    selectedTerritoryIdRef.current = selectedTerritoryId;
    onSelectTerritoryRef.current = onSelectTerritory;
    listedTerritoriesRef.current = listedTerritories;
  }, [listedTerritories, onSelectTerritory, selectedTerritoryId, session]);

  const [boundsByTerritoryId, setBoundsByTerritoryId] = useState<Map<string, [[number, number], [number, number]]>>(new Map());
  const boundaryCollectionRef = useRef<{ type: string; features: unknown[] } | null>(null);
  const availableLogoIdsRef = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    fetch("/data/preview-territories.geojson")
      .then((response) => response.ok ? response.json() : null)
      .then((collection: { features?: unknown[] } | null) => {
        if (!active || !collection?.features) return;
        boundaryCollectionRef.current = { type: "FeatureCollection", features: collection.features };
        setBoundsByTerritoryId(new Map(collection.features.map((feature) => {
          const candidate = feature as { id?: string | number; properties?: { id?: string } };
          return [String(candidate.id ?? candidate.properties?.id ?? ""), territoryBounds(feature)] as const;
        }).filter((entry): entry is readonly [string, [[number, number], [number, number]]] => entry[1] !== null)));
        const map = mapRef.current;
        if (map) updateGeoJsonSource(map, boundarySourceId, ownerBoundaryCollection(boundaryCollectionRef.current, sessionRef.current.territories));
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
      style: amazonLocationStyleUrl(mapConfig),
      center: [127.8, 36.3],
      zoom: 6.2,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({
      compact: true,
      customAttribution: '<a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">geoBoundaries</a>',
    }));

    map.on("error", () => {
      if (active && !styleLoaded) setMapError(true);
    });

    map.on("load", () => {
      if (!active) return;
      styleLoaded = true;
      map.addSource(boundarySourceId, {
        type: "geojson",
        data: boundaryCollectionRef.current
          ? ownerBoundaryCollection(boundaryCollectionRef.current, sessionRef.current.territories)
          : "/data/preview-territories.geojson",
      });
      map.addSource(strongholdSourceId, {
        type: "geojson",
        data: pointCollection(sessionRef.current.territories),
      });
      map.addSource(missionSourceId, {
        type: "geojson",
        data: missionCollection(),
      });
      map.addSource(expeditionSourceId, {
        type: "geojson",
        data: expeditionCollection(sessionRef.current, selectedTerritoryIdRef.current),
      });
      map.addSource(connectionSourceId, {
        type: "geojson",
        data: connectionCollection(sessionRef.current),
      });

      map.addLayer({
        id: territoryLayerId,
        type: "fill",
        source: boundarySourceId,
        filter: usesListedTerritories ? undefined : visibleLayerFilters(sessionRef.current.territories).boundaries,
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
        filter: usesListedTerritories ? undefined : visibleLayerFilters(sessionRef.current.territories).boundaries,
        paint: { "line-color": "#fffef9", "line-width": 1.4 },
      });
      map.addLayer({
        id: "preview-selected-fandom-outline",
        type: "line",
        source: boundarySourceId,
        filter: ["==", ["get", "ownerArtistId"], sessionRef.current.selectedArtistId ?? ""],
        paint: { "line-color": ["get", "ownerColor"], "line-width": 2.5 },
      });
      map.addLayer({
        id: selectedOutlineLayerId,
        type: "line",
        source: boundarySourceId,
        filter: ["==", ["id"], selectedTerritoryIdRef.current ?? ""],
        paint: { "line-color": "#16231d", "line-width": 4 },
      });
      map.addLayer({
        id: "preview-expedition-line",
        type: "line",
        source: expeditionSourceId,
        paint: { "line-color": "#ff6b35", "line-width": 4, "line-dasharray": [1.5, 1] },
      });
      map.addLayer({
        id: "preview-mission-points",
        type: "circle",
        source: missionSourceId,
        filter: usesListedTerritories ? undefined : visibleLayerFilters(sessionRef.current.territories).missions,
        paint: {
          "circle-color": "#dfff59",
          "circle-radius": 4,
          "circle-stroke-color": "#16231d",
          "circle-stroke-width": 1.5,
        },
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

      for (const artist of previewContent.artists.filter((candidate) => candidate.logoPath)) {
        const logoId = `artist-logo-${artist.id}`;
        map.loadImage(artist.logoPath!).then((image) => {
          if (!active || map.hasImage(logoId)) return;
          map.addImage(logoId, image.data);
          availableLogoIdsRef.current.add(artist.id);
          updateGeoJsonSource(map, strongholdSourceId, pointCollection(sessionRef.current.territories, availableLogoIdsRef.current));
        }).catch(() => undefined);
      }

      map.on("click", territoryLayerId, (event) => {
        const feature = event.features?.[0];
        const territoryId = String(feature?.id ?? feature?.properties?.id ?? "");
        if (sessionRef.current.territories.some((territory) => territory.id === territoryId)) {
          onSelectTerritoryRef.current(territoryId);
        }
      });
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
    updateGeoJsonSource(map, strongholdSourceId, pointCollection(session.territories, availableLogoIdsRef.current));
    if (boundaryCollectionRef.current) {
      updateGeoJsonSource(map, boundarySourceId, ownerBoundaryCollection(boundaryCollectionRef.current, session.territories));
    }
    updateGeoJsonSource(map, connectionSourceId, connectionCollection(session));
    if (map.getLayer(territoryLayerId)) {
      map.setPaintProperty(territoryLayerId, "fill-color", ownerColorExpression(session.territories));
    }
    if (map.getLayer("preview-selected-fandom-outline")) {
      map.setFilter("preview-selected-fandom-outline", ["==", ["get", "ownerArtistId"], session.selectedArtistId ?? ""]);
    }
    if (!usesListedTerritories) {
      const filters = visibleLayerFilters(session.territories);
      if (map.getLayer(territoryLayerId)) map.setFilter(territoryLayerId, filters.boundaries);
      if (map.getLayer("preview-territory-outline")) map.setFilter("preview-territory-outline", filters.boundaries);
      if (map.getLayer("preview-mission-points")) map.setFilter("preview-mission-points", filters.missions);
    }
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
    const cameraRequested = cameraSelectionRef.current !== selectedTerritoryId;
    cameraSelectionRef.current = selectedTerritoryId;
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
    updateGeoJsonSource(map, expeditionSourceId, expeditionCollection(session, selectedTerritoryId));
  }, [boundsByTerritoryId, selectedTerritoryId, session]);

  const retry = () => {
    setMapError(false);
    setRetryKey((current) => current + 1);
  };

  const resetNationalView = () => {
    const map = mapRef.current;
    if (!map) return;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    map.fitBounds(nationalBounds, { duration: reducedMotion ? 0 : 700 });
  };

  return (
    <section className="preview-map-boundary">
      {mapConfig && !mapError ? (
        <div
          ref={containerRef}
          className="preview-territory-map"
          role="region"
          aria-label={session.locale === "ko" ? "대한민국 팬덤 영토 지도" : "Korea fandom territory map"}
        />
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
      {selectedTerritoryId ? <div className="preview-map-actions"><button type="button" onClick={resetNationalView}>{t(session.locale, "nationalView")}</button></div> : null}
      <TerritoryList
        territories={listedTerritories}
        locale={session.locale}
        selectedArtistId={session.artistConfirmed ? session.selectedArtistId : null}
        selectedTerritoryId={selectedTerritoryId}
        onSelectTerritory={onSelectTerritory}
      />
    </section>
  );
}
