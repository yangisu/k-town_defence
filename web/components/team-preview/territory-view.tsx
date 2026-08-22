"use client";

import { useMemo, useState } from "react";
import { MapFilters, filterAndOrderTerritories, type TerritoryFilter } from "@/components/team-preview/map-filters";
import { StartPanel } from "@/components/team-preview/start-panel";
import { TacticalPanel } from "@/components/team-preview/tactical-panel";
import { TerritoryMap } from "@/components/team-preview/territory-map";
import { getExpeditionsForArtist, previewContent } from "@/features/team-preview/content";
import { useDemoSession } from "@/features/team-preview/demo-session-context";
import { t } from "@/features/team-preview/i18n";
import type { PreviewExpedition, PreviewTerritory, TerritoryId } from "@/features/team-preview/types";
import type { MapConfig } from "@/lib/map-config";

function distanceSquared(from: PreviewTerritory, to: PreviewTerritory) {
  const latitude = from.centroid.latitude - to.centroid.latitude;
  const longitude = from.centroid.longitude - to.centroid.longitude;
  return latitude * latitude + longitude * longitude;
}

function recommendedPlayableExpedition(
  selectedTerritory: PreviewTerritory,
  expeditions: readonly PreviewExpedition[],
  territories: readonly PreviewTerritory[],
) {
  const exact = expeditions.find((expedition) => expedition.territoryId === selectedTerritory.id);
  if (exact) return exact;

  return [...expeditions].sort((a, b) => {
    const aTerritory = territories.find((territory) => territory.id === a.territoryId)!;
    const bTerritory = territories.find((territory) => territory.id === b.territoryId)!;
    return Number(bTerritory.populationDecline) - Number(aTerritory.populationDecline)
      || distanceSquared(selectedTerritory, aTerritory) - distanceSquared(selectedTerritory, bTerritory)
      || aTerritory.name.ko.localeCompare(bTerritory.name.ko, "ko");
  })[0] ?? null;
}

export function TerritoryView({ mapConfig, onChooseArtist, onSelectTerritory, onOpenExpedition }: {
  mapConfig: MapConfig | null;
  onChooseArtist(): void;
  onSelectTerritory(territoryId: TerritoryId): void;
  onOpenExpedition(territoryId: TerritoryId, expeditionId: string): void;
}) {
  const session = useDemoSession();
  const [filter, setFilter] = useState<TerritoryFilter>("recommended");
  const selectedArtist = session.state.artistConfirmed ? session.selectedArtist : null;
  const selectedTerritory = session.state.artistConfirmed ? session.selectedTerritory : null;
  const visibleTerritories = useMemo(() => selectedArtist
    ? filterAndOrderTerritories(session.state.territories, filter, selectedArtist.id)
    : session.state.territories,
  [filter, selectedArtist, session.state.territories]);
  const mapSession = useMemo(() => ({ ...session.state, territories: visibleTerritories }), [session.state, visibleTerritories]);

  const selectTerritory = (territoryId: TerritoryId) => {
    session.dispatch({ type: "selectTerritory", territoryId });
    onSelectTerritory(territoryId);
  };

  const changeFilter = (nextFilter: TerritoryFilter) => {
    setFilter(nextFilter);
    if (!selectedArtist) return;
    const nextTerritories = filterAndOrderTerritories(session.state.territories, nextFilter, selectedArtist.id);
    if (nextTerritories.length > 0 && !nextTerritories.some((territory) => territory.id === session.state.selectedTerritoryId)) {
      selectTerritory(nextTerritories[0].id);
    }
  };

  let tacticalPanel = null;
  if (selectedArtist && selectedTerritory) {
    const connection = previewContent.connections.find((candidate) => (
      candidate.artistId === selectedArtist.id && candidate.territoryId === selectedTerritory.id
    )) ?? null;
    const expedition = recommendedPlayableExpedition(
      selectedTerritory,
      getExpeditionsForArtist(selectedArtist.id),
      session.state.territories,
    );
    const expeditionTerritory = expedition
      ? session.state.territories.find((territory) => territory.id === expedition.territoryId) ?? null
      : null;

    if (expedition && expeditionTerritory) {
      tacticalPanel = (
        <TacticalPanel
          session={session.state}
          artist={selectedArtist}
          territory={selectedTerritory}
          connection={connection}
          expedition={expedition}
          expeditionTerritory={expeditionTerritory}
          onStartExpedition={() => {
            session.dispatch({ type: "selectTerritory", territoryId: expedition.territoryId });
            onOpenExpedition(expedition.territoryId, expedition.id);
          }}
        />
      );
    }
  }

  return (
    <div className="view territory-view">
      <h1 className="preview-page-title">{t(session.state.locale, "navTerritory")}</h1>
      {selectedArtist ? <MapFilters locale={session.state.locale} activeFilter={filter} onChange={changeFilter} /> : null}
      <div className="preview-map-layout">
        <TerritoryMap
          mapConfig={mapConfig}
          session={mapSession}
          selectedTerritoryId={selectedTerritory?.id ?? null}
          onSelectTerritory={selectTerritory}
        />
        {tacticalPanel ?? (
          <StartPanel
            locale={session.state.locale}
            artist={selectedArtist}
            recommendedTerritory={selectedTerritory}
            artistConfirmed={session.state.artistConfirmed}
            onChooseArtist={onChooseArtist}
          />
        )}
      </div>
    </div>
  );
}
