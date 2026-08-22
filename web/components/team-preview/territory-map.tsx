"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type ExpressionSpecification, type FilterSpecification, type GeoJSONSource, type GeoJSONSourceSpecification, type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { TerritoryList } from "@/components/team-preview/territory-list";
import { getPlayableExpedition, previewContent } from "@/features/team-preview/content";
import type { DemoSession } from "@/features/team-preview/demo-session";
import { t } from "@/features/team-preview/i18n";
import type { PreviewTerritory, TerritoryId } from "@/features/team-preview/types";
import { amazonLocationStyleUrl, type MapConfig } from "@/lib/map-config";

interface TerritoryMapProps {
  mapConfig: MapConfig | null;
  session: DemoSession;
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

function pointCollection(territories: readonly PreviewTerritory[]) {
  return {
    type: "FeatureCollection" as const,
    features: territories.map((territory) => ({
      type: "Feature" as const,
      id: territory.id,
      properties: {
        id: territory.id,
        ownerArtistId: territory.ownerArtistId,
        ownerColor: previewContent.artists.find((artist) => artist.id === territory.ownerArtistId)?.color ?? "#7559ff",
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
      previewContent.artists.find((artist) => artist.id === territory.ownerArtistId)?.color ?? "#7559ff",
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
    boundaries: ["in", ["id"], ["literal", territoryIds]] as FilterSpecification,
    missions: ["in", ["get", "territoryId"], ["literal", territoryIds]] as FilterSpecification,
  };
}

export function TerritoryMap({ mapConfig, session, selectedTerritoryId, onSelectTerritory }: TerritoryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const sessionRef = useRef(session);
  const selectedTerritoryIdRef = useRef(selectedTerritoryId);
  const onSelectTerritoryRef = useRef(onSelectTerritory);
  const [mapError, setMapError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    sessionRef.current = session;
    selectedTerritoryIdRef.current = selectedTerritoryId;
    onSelectTerritoryRef.current = onSelectTerritory;
  }, [onSelectTerritory, selectedTerritoryId, session]);

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
      const visibleFilters = visibleLayerFilters(sessionRef.current.territories);
      map.addSource(boundarySourceId, {
        type: "geojson",
        data: "/data/preview-territories.geojson",
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
        filter: visibleFilters.boundaries,
        paint: { "fill-color": ownerColorExpression(sessionRef.current.territories), "fill-opacity": 0.24 },
      });
      map.addLayer({
        id: selectedLayerId,
        type: "fill",
        source: boundarySourceId,
        filter: ["==", ["id"], selectedTerritoryIdRef.current ?? ""],
        paint: { "fill-color": "#ff6b35", "fill-opacity": 0.58 },
      });
      map.addLayer({
        id: "preview-territory-outline",
        type: "line",
        source: boundarySourceId,
        filter: visibleFilters.boundaries,
        paint: { "line-color": "#fffef9", "line-width": 1.4 },
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
        filter: visibleFilters.missions,
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
        type: "symbol",
        source: strongholdSourceId,
        layout: {
          "text-field": ["match", ["get", "stage"], "landmark", "◆", "tree", "▲", "●"],
          "text-size": 17,
          "text-allow-overlap": true,
        },
        paint: { "text-color": ["get", "ownerColor"], "text-halo-color": "#fffef9", "text-halo-width": 1.5 },
      });

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
  }, [mapConfig, mapError, retryKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    updateGeoJsonSource(map, strongholdSourceId, pointCollection(session.territories));
    updateGeoJsonSource(map, connectionSourceId, connectionCollection(session));
    if (map.getLayer(territoryLayerId)) {
      map.setPaintProperty(territoryLayerId, "fill-color", ownerColorExpression(session.territories));
    }
    const visibleFilters = visibleLayerFilters(session.territories);
    if (map.getLayer(territoryLayerId)) map.setFilter(territoryLayerId, visibleFilters.boundaries);
    if (map.getLayer("preview-territory-outline")) map.setFilter("preview-territory-outline", visibleFilters.boundaries);
    if (map.getLayer("preview-mission-points")) map.setFilter("preview-mission-points", visibleFilters.missions);
  }, [session]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const territory = selectedTerritoryId
      ? session.territories.find((candidate) => candidate.id === selectedTerritoryId)
      : undefined;
    if (territory) {
      map.flyTo({ center: [territory.centroid.longitude, territory.centroid.latitude], zoom: 8 });
    }
    if (map.getLayer(selectedLayerId)) {
      map.setFilter(selectedLayerId, ["==", ["id"], selectedTerritoryId ?? ""]);
    }
    updateGeoJsonSource(map, expeditionSourceId, expeditionCollection(session, selectedTerritoryId));
  }, [selectedTerritoryId, session]);

  const retry = () => {
    setMapError(false);
    setRetryKey((current) => current + 1);
  };

  return (
    <section className="preview-map-boundary">
      {mapConfig && !mapError ? (
        <div
          ref={containerRef}
          className="preview-territory-map"
          role="region"
          aria-label={session.locale === "ko" ? "대한민국 팬덤 영토 지도" : "Korea fandom territory map"}
          style={{ minHeight: "32rem", width: "100%" }}
        />
      ) : (
        <div className="preview-map-configuration" role="status">
          <strong>{t(session.locale, "mapConfigError")}</strong>
          {mapError ? <button type="button" onClick={retry}>{t(session.locale, "retry")}</button> : null}
        </div>
      )}
      <p className="preview-map-attribution">
        Map © <a href="https://aws.amazon.com/location/" target="_blank" rel="noreferrer">Amazon Location Service</a>
        {" · "}Boundaries © <a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">geoBoundaries</a>
      </p>
      <TerritoryList
        territories={session.territories}
        locale={session.locale}
        selectedArtistId={session.artistConfirmed ? session.selectedArtistId : null}
        selectedTerritoryId={selectedTerritoryId}
        onSelectTerritory={onSelectTerritory}
      />
    </section>
  );
}
