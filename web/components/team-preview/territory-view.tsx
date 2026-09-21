"use client";

import { useMemo, useRef, useState } from "react";
import { MapFilters, filterAndOrderTerritories, type TerritoryFilter } from "@/components/team-preview/map-filters";
import { TacticalPanel } from "@/components/team-preview/tactical-panel";
import { TerritoryMap } from "@/components/team-preview/territory-map";
import { getPlayableExpedition, previewContent } from "@/features/team-preview/content";
import { useDemoSession } from "@/features/team-preview/demo-session-context";
import { isGuideRunning } from "@/features/team-preview/guide-running";
import { t } from "@/features/team-preview/i18n";
import { summarizeTerritories } from "@/features/team-preview/territory-summary";
import type { MapConfig } from "@/lib/map-config";
import { ShareSheet } from "@/components/share/share-sheet";
import { buildShareCard } from "@/features/share/build-share-card";
import type { AppServices, LiveExpedition, PersistedExpedition } from "@/lib/domain";
import { territoryRegionCodes } from "@/lib/adapters/expedition";
import { RouteRecommendationPicker } from "@/components/team-preview/route-recommendation-picker";

type ExpeditionRecoveryStatus = "ready" | "loading" | "error";

export function TerritoryView({ mapConfig, services, integrated = false, expeditionRecoveryStatus = "ready", onRetryExpeditionRecovery, onLiveExpedition }: {
  mapConfig: MapConfig | null;
  services?: AppServices;
  integrated?: boolean;
  expeditionRecoveryStatus?: ExpeditionRecoveryStatus;
  onRetryExpeditionRecovery?: () => void;
  onLiveExpedition?: (expedition: PersistedExpedition) => void;
}) {
  const session = useDemoSession();
  // The filter is part of where the reader is, so it lives in the session and
  // survives leaving this page — it used to snap back to "my fandom" every
  // time the view remounted, which is every trip through an expedition.
  const filter = session.state.territoryFilter;
  const setFilter = (next: TerritoryFilter) => session.dispatch({ type: "setTerritoryFilter", filter: next });
  // Bumped when the map is asked to frame the territory it already has.
  const [recentre, setRecentre] = useState(0);
  const [expeditionStartPending, setExpeditionStartPending] = useState(false);
  const [expeditionStartError, setExpeditionStartError] = useState(false);
  const [routeRecommendation, setRouteRecommendation] = useState<LiveExpedition | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const selectedArtist = session.state.artistConfirmed ? session.selectedArtist : null;
  const selectedTerritory = session.state.artistConfirmed ? session.selectedTerritory : null;
  // The filter decides the list, and a territory picked on the map joins it at
  // the end rather than widening the filter. Widening used to lift every dimmed
  // region on the map to full strength on the first map click, and nothing put
  // them back; now only the picked one lights up.
  const visibleTerritories = useMemo(() => {
    if (!selectedArtist) return session.state.territories;
    const filtered = filterAndOrderTerritories(session.state.territories, filter, selectedArtist.id);
    const selectedId = session.state.selectedTerritoryId;
    if (!selectedId || filtered.some((territory) => territory.id === selectedId)) return filtered;
    const picked = session.state.territories.find((territory) => territory.id === selectedId);
    return picked ? [...filtered, picked] : filtered;
  }, [filter, selectedArtist, session.state.selectedTerritoryId, session.state.territories]);
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
    if (!cleared && follow && !isGuideRunning()) mapRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  // A territory picked on the map may sit outside the current filter. Its card
  // joins the list above (see visibleTerritories) instead of the filter being
  // thrown away, so the reader keeps the view they chose.
  const selectFromMapSurface = (territoryId: string, source?: "map" | "list") => {
    if (source !== "map") return selectTerritory(territoryId);
    // Aiming at a place on the map means "show me this", never "put it away":
    // a second click re-centres it instead of clearing the card.
    if (session.state.selectedTerritoryId !== territoryId) {
      selectTerritory(territoryId, { follow: false });
    } else {
      setRecentre((count) => count + 1);
    }
    if (isGuideRunning()) return;
    window.setTimeout(() => {
      // A full-screen map covers the page, so moving the page under it would
      // only surprise whoever closes it. The list and card still follow.
      if (document.querySelector(".preview-map-boundary.fullscreen")) return;
      // The panel mounts with the selection, so look for it on this frame.
      document.querySelector(".tactical-panel")?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    }, 60);
  };

  // A filter decides what the list shows, never what is chosen. A territory
  // the reader picked stays picked until they pick another one, here or on the
  // map, even while the filter hides its card.
  const changeFilter = (nextFilter: TerritoryFilter) => setFilter(nextFilter);

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
          startDisabled={integrated && (expeditionRecoveryStatus !== "ready" || expeditionStartPending)}
          startPending={expeditionStartPending}
          onPage={(index) => {
            const next = visibleTerritories[index];
            if (next) selectTerritory(next.id, { follow: false });
          }}
          onStartExpedition={() => {
            if (!integrated || !services || isGuideRunning()) {
              session.dispatch({
                type: "openRecommendedExpedition",
                expeditionId: expedition.id,
                territoryId: expedition.territoryId,
              });
              return;
            }
            const regionCode = territoryRegionCodes[expedition.territoryId];
            if (!regionCode) {
              setExpeditionStartError(true);
              return;
            }
            setExpeditionStartError(false);
            setExpeditionStartPending(true);
            const routeKey = selectedArtist.id === "bts" && expedition.territoryId === "busan" ? "bts-busan" : undefined;
            const filter = {
              regionCode,
              keyword: selectedArtist.artistName.ko,
              travelDate: new Date().toISOString().slice(0, 10),
              limit: 5 as const,
              routeKey,
            };
            void services.tourism.getRecommendedExpedition(filter).then((recommendation) => {
              if (routeKey) {
                setRouteRecommendation(recommendation);
                return null;
              }
              return services.expeditions.start(recommendation.id, { ...filter, travelDate: recommendation.travelDate });
            }).then((persisted) => {
              if (!persisted) return;
              onLiveExpedition?.(persisted);
              session.dispatch({
                type: "openRecommendedExpedition",
                expeditionId: expedition.id,
                territoryId: expedition.territoryId,
              });
            }).catch(() => {
              setExpeditionStartError(true);
            }).finally(() => {
              setExpeditionStartPending(false);
            });
          }}
        />
      );
    }
  }

  return (
    <div className="view territory-view">
      <h1 className="preview-page-title">{t(session.state.locale, "navTerritory")}</h1>
      {/* The summary cards are gone. Every one of them restated what the
          filter, the list and the map below already say, and the last of them
          — a single recommended move — was a fifth opinion on a page whose
          whole job is letting the reader form their own. */}
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
      {integrated && expeditionRecoveryStatus === "loading" ? (
        <p className="expedition-service-message" role="status" aria-live="polite">
          {session.state.locale === "ko" ? "진행 중인 원정을 확인하고 있어요." : "Checking your current expedition."}
        </p>
      ) : null}
      {integrated && expeditionRecoveryStatus === "error" ? (
        <div className="expedition-service-message expedition-service-message--error" role="alert">
          <span>{session.state.locale === "ko"
            ? "진행 중인 원정을 확인하지 못했어요. 중복 원정을 막기 위해 새 원정 시작을 잠시 막았어요."
            : "We could not check your current expedition. Starting a new one is paused to prevent duplicates."}</span>
          {onRetryExpeditionRecovery ? (
            <button type="button" onClick={onRetryExpeditionRecovery}>
              {session.state.locale === "ko" ? "다시 시도" : "Try again"}
            </button>
          ) : null}
        </div>
      ) : null}
      {expeditionStartError ? (
        <p className="expedition-service-message expedition-service-message--error" role="alert">
          {session.state.locale === "ko"
            ? "원정을 시작하지 못했어요. 잠시 후 다시 시도해 주세요."
            : "We could not start the expedition. Please try again shortly."}
        </p>
      ) : null}
      {integrated && routeRecommendation && services && selectedArtist && selectedTerritory ? (
        <RouteRecommendationPicker
          key={routeRecommendation.id}
          recommendation={routeRecommendation}
          locale={session.state.locale}
          pending={expeditionStartPending}
          onStart={(selectedRecommendationPlaceIds) => {
            if (!routeRecommendation.routeKey || !routeRecommendation.routeVersion) {
              setExpeditionStartError(true);
              return;
            }
            setExpeditionStartError(false);
            setExpeditionStartPending(true);
            void services.expeditions.start(routeRecommendation.id, {
              regionCode: routeRecommendation.regionCode,
              keyword: routeRecommendation.keyword,
              travelDate: routeRecommendation.travelDate,
              limit: 5,
              routeKey: routeRecommendation.routeKey,
            }, selectedRecommendationPlaceIds, routeRecommendation.routeVersion).then((persisted) => {
              setRouteRecommendation(null);
              onLiveExpedition?.(persisted);
              const selected = getPlayableExpedition(selectedArtist.id, selectedTerritory.id);
              if (selected) session.dispatch({ type: "openRecommendedExpedition", expeditionId: selected.id, territoryId: selected.territoryId });
            }).catch(() => setExpeditionStartError(true)).finally(() => setExpeditionStartPending(false));
          }}
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
          recentreToken={recentre}
          onSelectTerritory={selectFromMapSurface}
          onClearSelection={() => session.dispatch({ type: "selectTerritory", territoryId: null })}
        />
        {tacticalPanel}
      </div>
    </div>
  );
}
