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
import { StartPanel } from "@/components/team-preview/start-panel";
import { appReducer, initialAppState, type AppAction, type AppState } from "@/features/app-controller";
import { MembershipProvider } from "@/features/membership/membership-context";
import { DemoSessionProvider, useDemoSession } from "@/features/team-preview/demo-session-context";
import { getArtistHomeTerritories } from "@/features/team-preview/content";
import { rankFandoms } from "@/features/team-preview/game-rules";
import { t } from "@/features/team-preview/i18n";
import { MembershipGate } from "@/components/membership/membership-gate";
import type { AppServices, Place } from "@/lib/domain";
import { createServices, type ServiceMode } from "@/lib/service-factory";

interface ServiceViewsProps {
  mode: ServiceMode;
  services: AppServices;
  state: AppState;
  dispatch: Dispatch<AppAction>;
  checkInPlace: Place | null;
  setCheckInPlace: Dispatch<SetStateAction<Place | null>>;
  exploreAside?: ReactNode;
  exploreHeading?: string;
}

function ServiceViews({ mode, services, state, dispatch, checkInPlace, setCheckInPlace, exploreAside, exploreHeading }: ServiceViewsProps) {
  const explore = state.activeTab === "explore" ? (
    <>
      {exploreHeading ? <h1 className="preview-page-title">{exploreHeading}</h1> : null}
      <div className={exploreAside ? "team-preview-entry-layout" : undefined}>
        <ExploreView
          services={services}
          mode={mode}
          selectedRegionId={state.selectedRegionId}
          onSelectRegion={(regionId) => dispatch({ type: "selectRegion", regionId })}
          onOpenExpedition={(regionId, expeditionId) => dispatch({ type: "openExpedition", regionId, expeditionId })}
          onStartCheckIn={(place) => {
            setCheckInPlace(place);
            dispatch({ type: "startCheckIn", placeId: place.id });
          }}
        />
        {exploreAside}
      </div>
    </>
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

function DemoProduct({ services }: { services: AppServices }) {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const [checkInPlace, setCheckInPlace] = useState<Place | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [artistConfirmed, setArtistConfirmed] = useState(false);
  const session = useDemoSession();
  const ranked = rankFandoms(session.state.fandoms);
  const rank = ranked.find((entry) => entry.artistId === session.state.selectedArtistId)?.rank ?? null;

  const chooseArtist = (artistId: NonNullable<typeof session.state.selectedArtistId>) => {
    const homeTerritory = getArtistHomeTerritories(artistId)[0] ?? null;
    session.dispatch({ type: "selectArtist", artistId });
    if (homeTerritory) {
      session.dispatch({ type: "selectTerritory", territoryId: homeTerritory.id });
      dispatch({ type: "selectRegion", regionId: homeTerritory.id });
    }
    setArtistConfirmed(true);
    setDrawerOpen(false);
  };

  const resetDemo = () => {
    session.reset();
    dispatch({ type: "selectRegion", regionId: initialAppState.selectedRegionId });
    dispatch({ type: "changeTab", tab: initialAppState.activeTab });
    setCheckInPlace(null);
    setArtistConfirmed(false);
  };

  return (
    <AppShell
      activeTab={state.activeTab}
      locale={session.state.locale}
      fandomName={session.selectedArtist?.fandomName ?? null}
      rank={rank}
      onLocaleChange={(locale) => session.dispatch({ type: "setLocale", locale })}
      onTabChange={(tab) => dispatch({ type: "changeTab", tab })}
    >
      <ObjectiveStrip
        locale={session.state.locale}
        fandomName={session.selectedArtist?.fandomName ?? null}
        territoryName={session.selectedTerritory?.name[session.state.locale] ?? null}
        onReset={resetDemo}
      />
      <ServiceViews
        mode="demo"
        services={services}
        state={state}
        dispatch={dispatch}
        checkInPlace={checkInPlace}
        setCheckInPlace={setCheckInPlace}
        exploreHeading={t(session.state.locale, "navTerritory")}
        exploreAside={(
          <StartPanel
            locale={session.state.locale}
            artist={session.selectedArtist}
            recommendedTerritory={session.selectedTerritory}
            artistConfirmed={artistConfirmed}
            onChooseArtist={() => setDrawerOpen(true)}
          />
        )}
      />
      <ArtistDrawer
        open={drawerOpen}
        locale={session.state.locale}
        selectedArtistId={session.state.selectedArtistId}
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

export function KTownApp({ mode }: { mode: ServiceMode }) {
  const services = useMemo(() => createServices(mode), [mode]);

  if (mode === "demo") {
    return <DemoSessionProvider><DemoProduct services={services} /></DemoSessionProvider>;
  }

  return (
    <MembershipProvider service={services.membership}>
      <MembershipGate><IntegratedProduct services={services} /></MembershipGate>
    </MembershipProvider>
  );
}
