"use client";

import { useMemo, useReducer, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { AppShell } from "@/components/app-shell";
import { ExploreView } from "@/components/explore/explore-view";
import { ExpeditionView } from "@/components/expedition/expedition-view";
import { CheckInFlow } from "@/components/check-in/check-in-flow";
import { BattleView } from "@/components/battle/battle-view";
import { JourneyView } from "@/components/journey/journey-view";
import { ArtistDrawer } from "@/components/team-preview/artist-drawer";
import { ProfileMenu } from "@/components/team-preview/profile-menu";
import { ProfileSetup } from "@/components/team-preview/profile-setup";
import { ObjectiveStrip } from "@/components/team-preview/objective-strip";
import { TerritoryView } from "@/components/team-preview/territory-view";
import { PreviewExpeditionView } from "@/components/team-preview/expedition-view";
import { RankingView } from "@/components/team-preview/ranking-view";
import { RecordView } from "@/components/team-preview/record-view";
import { useModalFocus } from "@/components/ui/use-modal-focus";
import { appReducer, initialAppState, openExpedition, type AppAction, type AppState } from "@/features/app-controller";
import { MembershipProvider } from "@/features/membership/membership-context";
import { DemoSessionProvider, useDemoSession } from "@/features/team-preview/demo-session-context";
import { t } from "@/features/team-preview/i18n";
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
  demoExpedition?: ReactNode;
  demoBattle?: ReactNode;
  demoJourney?: ReactNode;
}

function ServiceViews({ mode, services, state, dispatch, checkInPlace, setCheckInPlace, demoExplore, demoExpedition, demoBattle, demoJourney }: ServiceViewsProps) {
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
        mode === "demo" && demoExpedition ? demoExpedition : (
          <ExpeditionView
            expeditionId={state.selectedExpeditionId}
            services={services}
            onStartCheckIn={(place) => {
              setCheckInPlace(place);
              dispatch({ type: "startCheckIn", placeId: place.id });
            }}
            onBack={() => dispatch({ type: "changeTab", tab: "explore" })}
          />
        )
      ) : null}
      {state.activeTab === "battle"
        ? mode === "demo" && demoBattle
          ? demoBattle
          : <BattleView service={services.battle} selectedRegionId={state.selectedRegionId} />
        : null}
      {state.activeTab === "journey"
        ? mode === "demo" && demoJourney
          ? demoJourney
          : <JourneyView service={services.battle} />
        : null}
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const resetDialogRef = useRef<HTMLDivElement>(null);
  const resetTitleRef = useRef<HTMLHeadingElement>(null);
  const session = useDemoSession();
  const selectedArtist = session.state.artistConfirmed ? session.selectedArtist : null;
  const selectedTerritory = session.state.artistConfirmed ? session.selectedTerritory : null;

  const chooseArtist = (artistId: NonNullable<typeof session.state.selectedArtistId>) => {
    session.dispatch({ type: "changeProfile", artistId });
    setDrawerOpen(false);
  };

  const resetDemo = () => {
    session.reset();
    setDrawerOpen(false);
    setResetOpen(false);
  };
  useModalFocus(resetOpen, resetDialogRef, resetTitleRef, () => setResetOpen(false));

  if (!session.hydrated) return <p role="status">{t(session.state.locale, "loading")}</p>;

  return (
    <>
      <AppShell
        variant="demo"
        activeTab={session.state.activeTab}
        locale={session.state.locale}
        interactionDisabled={resetOpen}
        navigationDisabled={!session.state.artistConfirmed}
        profileControl={selectedArtist ? (
          <ProfileMenu
            locale={session.state.locale}
            fandomName={selectedArtist.fandomName}
            onOpen={() => setDrawerOpen(true)}
          />
        ) : null}
        onLocaleChange={(locale) => session.dispatch({ type: "setLocale", locale })}
        onTabChange={(tab) => session.dispatch({ type: "changeTab", tab })}
        statusContent={selectedArtist ? (
          <ObjectiveStrip
            locale={session.state.locale}
            fandomName={selectedArtist?.fandomName ?? null}
            territoryName={selectedTerritory?.name[session.state.locale] ?? null}
            onReset={() => setResetOpen(true)}
          />
        ) : null}
      >
        {!session.state.artistConfirmed ? (
          <ProfileSetup locale={session.state.locale} onConfirm={chooseArtist} />
        ) : null}
        {session.state.artistConfirmed && session.state.activeTab === "explore" ? (
            <TerritoryView
              key={session.state.artistConfirmed ? `artist:${session.state.selectedArtistId}` : "unconfirmed"}
              mapConfig={mapConfig}
              onChooseArtist={() => setDrawerOpen(true)}
            />
        ) : null}
        {session.state.artistConfirmed && session.state.activeTab === "expedition" ? (
            <PreviewExpeditionView
              expeditionId={session.state.selectedExpeditionId}
              checkInService={services.checkIn}
              onBack={() => undefined}
            />
        ) : null}
        {session.state.artistConfirmed && session.state.activeTab === "battle" ? (
            <RankingView
              locale={session.state.locale}
              fandoms={session.state.fandoms}
              territories={session.state.territories}
              selectedArtistId={session.state.artistConfirmed ? session.state.selectedArtistId : null}
            />
        ) : null}
        {session.state.artistConfirmed && session.state.activeTab === "journey" ? <RecordView locale={session.state.locale} session={session.state} /> : null}
        <ArtistDrawer
          open={drawerOpen}
          locale={session.state.locale}
          selectedArtistId={session.state.artistConfirmed ? session.state.selectedArtistId : null}
          onClose={() => setDrawerOpen(false)}
          onSelect={chooseArtist}
        />
      </AppShell>
      {resetOpen && typeof document !== "undefined" ? createPortal(
        <div className="reset-dialog-overlay">
          <div className="reset-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-dialog-title" ref={resetDialogRef}>
            <h2 id="reset-dialog-title" tabIndex={-1} ref={resetTitleRef}>{t(session.state.locale, "resetConfirmTitle")}</h2>
            <p>{t(session.state.locale, "resetConfirmBody")}</p>
            <div>
              <button type="button" onClick={() => setResetOpen(false)}>{t(session.state.locale, "resetCancel")}</button>
              <button type="button" onClick={resetDemo}>{t(session.state.locale, "resetConfirmAction")}</button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
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
