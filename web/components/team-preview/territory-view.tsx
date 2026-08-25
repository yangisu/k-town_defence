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

  const openSummaryTerritory = (nextFilter: TerritoryFilter, territoryId: string | null) => {
    setFilter(nextFilter);
    if (territoryId) selectTerritory(territoryId);
  };

  const territoryName = (territoryId: string | null | undefined) => territoryId
    ? session.state.territories.find((territory) => territory.id === territoryId)?.name[session.state.locale] ?? "—"
    : "—";

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
          <div className="territory-summary-grid">
            <button type="button" onClick={() => openSummaryTerritory("my_fandom", summary.strongestOwnedTerritoryId)}>
              <span>{t(session.state.locale, "summaryOwned")}</span>
              <strong>{summary.ownedCount}</strong>
              <small>{session.state.locale === "ko" ? "내 영토만 지도에서 보기" : "Show only my territories"}</small>
            </button>
            <button type="button" onClick={() => openSummaryTerritory("my_fandom", summary.strongestOwnedTerritoryId)} disabled={!summary.strongestOwnedTerritoryId}>
              <span>{t(session.state.locale, "summaryStrongest")}</span>
              <strong>{summary.strongestOwnedTerritoryId ? territoryName(summary.strongestOwnedTerritoryId) : t(session.state.locale, "noOwnedTerritory")}</strong>
              <small>{session.state.locale === "ko" ? "선택하고 지도로 이동" : "Select and move the map"}</small>
            </button>
            <button type="button" onClick={() => openSummaryTerritory("contested", summary.nearestContestedTerritoryId)} disabled={!summary.nearestContestedTerritoryId}>
              <span>{session.state.locale === "ko" ? "내 거점에서 가까운 접전지" : "Contested territory near my base"}</span>
              <strong>{territoryName(summary.nearestContestedTerritoryId)}</strong>
              <small>{summary.nearestContestedAnchorTerritoryId
                ? `${territoryName(summary.nearestContestedAnchorTerritoryId)} ${session.state.locale === "ko" ? "거점 기준" : "base"} · ${session.state.locale === "ko" ? "약" : "about"} ${summary.nearestContestedDistanceKm ?? "—"}km`
                : session.state.locale === "ko" ? "대표 연결 지역 기준" : "Based on the representative connected region"}</small>
            </button>
            <button className="territory-summary-action" type="button" onClick={() => openSummaryTerritory("contested", summary.recommendation?.territoryId ?? null)} disabled={!summary.recommendation}>
              <span>{t(session.state.locale, "summaryRecommendation")}</span>
              <strong>{summary.recommendation
                ? `${t(session.state.locale, summary.recommendation.kind === "defend" ? "recommendDefend" : "recommendCapture")} · ${territoryName(summary.recommendation.territoryId)}`
                : "—"}</strong>
              <small>{summary.recommendation
                ? summary.recommendation.kind === "defend"
                  ? session.state.locale === "ko" ? `${summary.recommendation.pointsRequired}P 우위 · 방어가 가장 시급해요` : `${summary.recommendation.pointsRequired}P lead · Most urgent defense`
                  : session.state.locale === "ko" ? `${summary.recommendation.pointsRequired}P 필요 · 가장 쉽게 탈환할 수 있어요` : `${summary.recommendation.pointsRequired}P needed · Easiest capture opportunity`
                : ""}</small>
            </button>
          </div>
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
