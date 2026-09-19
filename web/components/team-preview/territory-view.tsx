"use client";

import { useMemo, useRef, useState } from "react";
import { MapFilters, filterAndOrderTerritories, type TerritoryFilter } from "@/components/team-preview/map-filters";
import { TacticalPanel } from "@/components/team-preview/tactical-panel";
import { TerritoryMap } from "@/components/team-preview/territory-map";
import { getPlayableExpedition, previewContent } from "@/features/team-preview/content";
import { useDemoSession } from "@/features/team-preview/demo-session-context";
import { t } from "@/features/team-preview/i18n";
import { summarizeTerritories } from "@/features/team-preview/territory-summary";
import type { MapConfig } from "@/lib/map-config";
import { ShareSheet } from "@/components/share/share-sheet";
import { buildShareCard } from "@/features/share/build-share-card";

export function TerritoryView({ mapConfig }: {
  mapConfig: MapConfig | null;
}) {
  const session = useDemoSession();
  const [filter, setFilter] = useState<TerritoryFilter>("my_fandom");
  const mapRef = useRef<HTMLDivElement>(null);
  const selectedArtist = session.state.artistConfirmed ? session.selectedArtist : null;
  const selectedTerritory = session.state.artistConfirmed ? session.selectedTerritory : null;
  const visibleTerritories = useMemo(() => selectedArtist
    ? filterAndOrderTerritories(session.state.territories, filter, selectedArtist.id)
    : session.state.territories,
  [filter, selectedArtist, session.state.territories]);
  const summary = useMemo(() => selectedArtist
    ? summarizeTerritories(session.state.territories, selectedArtist.id, previewContent.connections)
    : null, [selectedArtist, session.state.territories]);

  // Picking the selected territory again clears it and puts the panel away.
  // Paging passes follow: false: the card the reader is swiping stays put, so
  // pulling the page to the map below would drag it out from under them.
  const selectTerritory = (territoryId: string, { follow = true }: { follow?: boolean } = {}) => {
    const cleared = session.state.selectedTerritoryId === territoryId;
    session.dispatch({ type: "selectTerritory", territoryId: cleared ? null : territoryId });
    // A new selection acts on the map, so follow it there.
    if (!cleared && follow) mapRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  // A territory picked on the map may sit outside the current filter, which
  // would leave it selected with no card in the list beneath. Widen the filter
  // so the list shows it, and bring the tactical card into view.
  const selectFromMapSurface = (territoryId: string, source?: "map" | "list") => {
    if (source !== "map") return selectTerritory(territoryId);
    const clearing = session.state.selectedTerritoryId === territoryId;
    if (!clearing && !visibleTerritories.some((territory) => territory.id === territoryId)) setFilter("all");
    selectTerritory(territoryId, { follow: false });
    if (clearing) return;
    window.setTimeout(() => {
      // A full-screen map covers the page, so moving the page under it would
      // only surprise whoever closes it. The list and card still follow.
      if (document.querySelector(".preview-map-boundary.fullscreen")) return;
      // The panel mounts with the selection, so look for it on this frame.
      document.querySelector(".tactical-panel")?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    }, 60);
  };

  const changeFilter = (nextFilter: TerritoryFilter) => {
    setFilter(nextFilter);
    // A deliberate deselection outlives a filter change; only a selection that
    // the new filter hides is moved onto the first territory it does show.
    if (!selectedArtist || session.state.selectedTerritoryId === null) return;
    const nextTerritories = filterAndOrderTerritories(session.state.territories, nextFilter, selectedArtist.id);
    if (nextTerritories.length > 0 && !nextTerritories.some((territory) => territory.id === session.state.selectedTerritoryId)) {
      selectTerritory(nextTerritories[0].id);
    }
  };

  const openSummaryTerritory = (nextFilter: TerritoryFilter, territoryId: string | null) => {
    setFilter(nextFilter);
    if (territoryId) selectTerritory(territoryId);
    // The card acts on the map below it, so bring the map along.
    mapRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
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
      // The panel is the pager: arrows and dots walk the listed territories.
      const pageIndex = visibleTerritories.findIndex((candidate) => candidate.id === selectedTerritory.id);
      tacticalPanel = (
        <TacticalPanel
          session={session.state}
          artist={selectedArtist}
          territory={selectedTerritory}
          connection={connection}
          expedition={expedition}
          expeditionTerritory={expeditionTerritory}
          pageIndex={pageIndex}
          pageCount={visibleTerritories.length}
          onPage={(index) => {
            const next = visibleTerritories[index];
            if (next) selectTerritory(next.id, { follow: false });
          }}
          onStartExpedition={() => session.dispatch({ type: "openExpedition", expeditionId: expedition.id })}
        />
      );
    }
  }

  return (
    <div className="view territory-view">
      <h1 className="preview-page-title">{t(session.state.locale, "navTerritory")}</h1>
      {selectedArtist && summary ? (
        <section data-guide="territory-summary" className="territory-summary" aria-label={t(session.state.locale, "territorySummary")}>
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
      {selectedArtist && summary ? (
        <ShareSheet
          label={session.state.locale === "ko" ? "영토 현황 공유하기" : "Share territory status"}
          card={buildShareCard(
            "territory",
            {
              fandomName: selectedArtist.fandomName,
              ownedCount: summary.ownedCount,
              strongestTerritoryName: summary.strongestOwnedTerritoryId ? territoryName(summary.strongestOwnedTerritoryId) : null,
            },
            typeof window === "undefined" ? undefined : window.location.origin,
          )}
        />
      ) : null}
      <div className={tacticalPanel ? "preview-map-layout" : "preview-map-layout preview-map-layout--solo"} ref={mapRef}>
        <TerritoryMap
          filters={selectedArtist ? <MapFilters locale={session.state.locale} activeFilter={filter} onChange={changeFilter} /> : null}
          mapConfig={mapConfig}
          session={session.state}
          listedTerritories={visibleTerritories}
          activeFilter={filter}
          selectedTerritoryId={selectedTerritory?.id ?? null}
          onSelectTerritory={selectFromMapSurface}
        />
        {tacticalPanel}
      </div>
    </div>
  );
}
