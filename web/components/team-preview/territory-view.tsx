"use client";

import { useMemo, useState } from "react";
import { MapFilters, filterAndOrderTerritories, type TerritoryFilter } from "@/components/team-preview/map-filters";
import { StartPanel } from "@/components/team-preview/start-panel";
import { TacticalPanel } from "@/components/team-preview/tactical-panel";
import { TerritoryMap } from "@/components/team-preview/territory-map";
import { getPlayableExpedition, previewContent } from "@/features/team-preview/content";
import { useDemoSession } from "@/features/team-preview/demo-session-context";
import { t } from "@/features/team-preview/i18n";
import { summarizeTerritories } from "@/features/team-preview/territory-summary";
import type { MapConfig } from "@/lib/map-config";

export function TerritoryView({ mapConfig, onChooseArtist }: {
  mapConfig: MapConfig | null;
  onChooseArtist(): void;
}) {
  const session = useDemoSession();
  const [filter, setFilter] = useState<TerritoryFilter>("my_fandom");
  const selectedArtist = session.state.artistConfirmed ? session.selectedArtist : null;
  const selectedTerritory = session.state.artistConfirmed ? session.selectedTerritory : null;
  const visibleTerritories = useMemo(() => selectedArtist
    ? filterAndOrderTerritories(session.state.territories, filter, selectedArtist.id)
    : session.state.territories,
  [filter, selectedArtist, session.state.territories]);
  const summary = useMemo(() => selectedArtist
    ? summarizeTerritories(session.state.territories, selectedArtist.id, previewContent.connections)
    : null, [selectedArtist, session.state.territories]);

  const selectTerritory = (territoryId: string) => {
    session.dispatch({ type: "selectTerritory", territoryId });
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
    const expedition = getPlayableExpedition(selectedArtist.id, selectedTerritory.id);
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
          onChangeArtist={onChooseArtist}
          onStartExpedition={() => session.dispatch({ type: "openExpedition", expeditionId: expedition.id })}
        />
      );
    }
  }

  return (
    <div className="view territory-view">
      <h1 className="preview-page-title">{t(session.state.locale, "navTerritory")}</h1>
      {selectedArtist ? <MapFilters locale={session.state.locale} activeFilter={filter} onChange={changeFilter} /> : null}
      {selectedArtist && summary ? (
        <section className="territory-summary" aria-label={t(session.state.locale, "territorySummary")}>
          <dl>
            <div><dt>{t(session.state.locale, "summaryOwned")}</dt><dd>{summary.ownedCount}</dd></div>
            <div><dt>{t(session.state.locale, "summaryStrongest")}</dt><dd>{summary.strongestOwnedTerritoryId
              ? session.state.territories.find((territory) => territory.id === summary.strongestOwnedTerritoryId)?.name[session.state.locale]
              : t(session.state.locale, "noOwnedTerritory")}</dd></div>
            <div><dt>{t(session.state.locale, "summaryNearestContested")}</dt><dd>{summary.nearestContestedTerritoryId
              ? session.state.territories.find((territory) => territory.id === summary.nearestContestedTerritoryId)?.name[session.state.locale]
              : "—"}</dd></div>
            <div><dt>{t(session.state.locale, "summaryRecommendation")}</dt><dd>{summary.recommendation
              ? `${t(session.state.locale, summary.recommendation.kind === "defend" ? "recommendDefend" : "recommendCapture")} · ${session.state.territories.find((territory) => territory.id === summary.recommendation?.territoryId)?.name[session.state.locale]}`
              : "—"}</dd></div>
          </dl>
        </section>
      ) : null}
      <div className="preview-map-layout">
        <TerritoryMap
          mapConfig={mapConfig}
          session={session.state}
          listedTerritories={visibleTerritories}
          activeFilter={filter}
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
