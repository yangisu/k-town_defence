"use client";

import { useMemo, useReducer, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { AppShell } from "@/components/app-shell";
import { ExploreView } from "@/components/explore/explore-view";
import { ExpeditionView } from "@/components/expedition/expedition-view";
import { CheckInFlow } from "@/components/check-in/check-in-flow";
import { BattleView } from "@/components/battle/battle-view";
import { JourneyView } from "@/components/journey/journey-view";
import { ArtistDrawer } from "@/components/team-preview/artist-drawer";
import { ObjectiveStrip } from "@/components/team-preview/objective-strip";
import { TerritoryView } from "@/components/team-preview/territory-view";
import { appReducer, initialAppState, openExpedition, type AppAction, type AppState } from "@/features/app-controller";
import { MembershipProvider } from "@/features/membership/membership-context";
import { DemoSessionProvider, useDemoSession } from "@/features/team-preview/demo-session-context";
import { getArtistHomeTerritories } from "@/features/team-preview/content";
import { rankFandoms } from "@/features/team-preview/game-rules";
import { MembershipGate } from "@/components/membership/membership-gate";
import type { AppServices, Place } from "@/lib/domain";
import type { MapConfig } from "@/lib/map-config";
import { createServices, type ServiceMode } from "@/lib/service-factory";

interface ServiceViewsProps {
  mode: ServiceMode;
  services: AppServices;
  state: AppState;
  dispatch: Dispatch<AppAction>;
  checkInPlace: Place | null;
  setCheckInPlace: Dispatch<SetStateAction<Place | null>>;
  demoExplore?: ReactNode;
}

function ServiceViews({ mode, services, state, dispatch, checkInPlace, setCheckInPlace, demoExplore }: ServiceViewsProps) {
  const explore = state.activeTab === "explore" ? (
    mode === "demo" && demoExplore ? demoExplore : (
        <ExploreView
          services={services}
          mode={mode}
          selectedRegionId={state.selectedRegionId}
          onSelectRegion={(regionId) => dispatch({ type: "selectRegion", regionId })}
          onOpenExpedition={(regionId, expeditionId) => dispatch(openExpedition(regionId, expeditionId))}
          onStartCheckIn={(place) => {
            setCheckInPlace(place);
            dispatch({ type: "startCheckIn", placeId: place.id });
          }}
        />
    )
  ) : null;

  return (
    <>
      {explore}
      {state.activeTab === "expedition" ? (
        <ExpeditionView
          expeditionId={state.selectedExpeditionId}
          services={services}
          onStartCheckIn={(place) => {
            setCheckInPlace(place);
            dispatch({ type: "startCheckIn", placeId: place.id });
          }}
          onBack={() => dispatch({ type: "changeTab", tab: "explore" })}
        />
      ) : null}
      {state.activeTab === "battle" ? <BattleView service={services.battle} selectedRegionId={state.selectedRegionId} /> : null}
      {state.activeTab === "journey" ? <JourneyView service={services.battle} /> : null}
      {checkInPlace ? (
        <CheckInFlow
          place={checkInPlace}
          service={services.checkIn}
          mode={mode}
          onClose={() => {
            setCheckInPlace(null);
            dispatch({ type: "closeCheckIn" });
          }}
        />
      ) : null}
    </>
  );
}

function DemoProduct({ services, mapConfig }: { services: AppServices; mapConfig: MapConfig | null }) {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const [checkInPlace, setCheckInPlace] = useState<Place | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const session = useDemoSession();
  const ranked = rankFandoms(session.state.fandoms);
  const selectedArtist = session.state.artistConfirmed ? session.selectedArtist : null;
  const selectedTerritory = session.state.artistConfirmed ? session.selectedTerritory : null;
  const rank = session.state.artistConfirmed
    ? ranked.find((entry) => entry.artistId === session.state.selectedArtistId)?.rank ?? null
    : null;

  const chooseArtist = (artistId: NonNullable<typeof session.state.selectedArtistId>) => {
    const homeTerritory = getArtistHomeTerritories(artistId)[0] ?? null;
    session.dispatch({ type: "selectArtist", artistId });
    if (homeTerritory) {
      session.dispatch({ type: "selectTerritory", territoryId: homeTerritory.id });
      dispatch({ type: "selectRegion", regionId: homeTerritory.id });
    }
    setDrawerOpen(false);
  };

  const resetDemo = () => {
    session.reset();
    dispatch({ type: "selectRegion", regionId: initialAppState.selectedRegionId });
    dispatch({ type: "changeTab", tab: initialAppState.activeTab });
    setCheckInPlace(null);
  };

  return (
    <AppShell
      variant="demo"
      activeTab={state.activeTab}
      locale={session.state.locale}
      fandomName={selectedArtist?.fandomName ?? null}
      rank={rank}
      onLocaleChange={(locale) => session.dispatch({ type: "setLocale", locale })}
      onTabChange={(tab) => dispatch({ type: "changeTab", tab })}
    >
      <ObjectiveStrip
        locale={session.state.locale}
        fandomName={selectedArtist?.fandomName ?? null}
        territoryName={selectedTerritory?.name[session.state.locale] ?? null}
        onReset={resetDemo}
      />
      <ServiceViews
        mode="demo"
        services={services}
        state={state}
        dispatch={dispatch}
        checkInPlace={checkInPlace}
        setCheckInPlace={setCheckInPlace}
        demoExplore={(
          <TerritoryView
            key={session.state.artistConfirmed ? `artist:${session.state.selectedArtistId}` : "unconfirmed"}
            mapConfig={mapConfig}
            onChooseArtist={() => setDrawerOpen(true)}
            onSelectTerritory={(territoryId) => dispatch({ type: "selectRegion", regionId: territoryId })}
            onOpenExpedition={(territoryId, expeditionId) => dispatch(openExpedition(territoryId, expeditionId))}
          />
        )}
      />
      <ArtistDrawer
        open={drawerOpen}
        locale={session.state.locale}
        selectedArtistId={session.state.artistConfirmed ? session.state.selectedArtistId : null}
        onClose={() => setDrawerOpen(false)}
        onSelect={chooseArtist}
      />
    </AppShell>
  );
}

function IntegratedProduct({ services }: { services: AppServices }) {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const [checkInPlace, setCheckInPlace] = useState<Place | null>(null);

  return (
    <AppShell
      variant="integrated"
      activeTab={state.activeTab}
      locale="ko"
      fandomName={null}
      rank={null}
      onLocaleChange={() => undefined}
      onTabChange={(tab) => dispatch({ type: "changeTab", tab })}
    >
      <ServiceViews
        mode="integrated"
        services={services}
        state={state}
        dispatch={dispatch}
        checkInPlace={checkInPlace}
        setCheckInPlace={setCheckInPlace}
      />
    </AppShell>
  );
}

export function KTownApp({ mode, mapConfig }: { mode: ServiceMode; mapConfig: MapConfig | null }) {
  const services = useMemo(() => createServices(mode), [mode]);

  if (mode === "demo") {
    return <DemoSessionProvider><DemoProduct services={services} mapConfig={mapConfig} /></DemoSessionProvider>;
  }

  return (
    <MembershipProvider service={services.membership}>
      <MembershipGate><IntegratedProduct services={services} /></MembershipGate>
    </MembershipProvider>
  );
}
