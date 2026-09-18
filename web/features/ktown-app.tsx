"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppShell } from "@/components/app-shell";
import { BackToLoginButton } from "@/components/demo-entry/back-to-login-button";
import { DemoSignOutProvider, useDemoSignOut } from "@/features/demo-entry/demo-sign-out";
import { ArtistDrawer } from "@/components/team-preview/artist-drawer";
import { ProfileSetup } from "@/components/team-preview/profile-setup";
import { TutorialOverlay } from "@/components/team-preview/tutorial-overlay";
import { hasSeenTutorial, markTutorialSeen } from "@/features/team-preview/tutorial-seen";
import { ObjectiveStrip } from "@/components/team-preview/objective-strip";
import { TerritoryView } from "@/components/team-preview/territory-view";
import { PreviewExpeditionView } from "@/components/team-preview/expedition-view";
import { RankingView } from "@/components/team-preview/ranking-view";
import { RecordView } from "@/components/team-preview/record-view";
import { useBodyScrollLock } from "@/components/ui/use-body-scroll-lock";
import { useModalFocus } from "@/components/ui/use-modal-focus";
import { MembershipProvider, useMembership } from "@/features/membership/membership-context";
import { DemoSessionProvider, useDemoSession } from "@/features/team-preview/demo-session-context";
import { previewContent } from "@/features/team-preview/content";
import { createRemoteDemoSessionStore } from "@/features/team-preview/remote-session-store";
import { t } from "@/features/team-preview/i18n";
import { MembershipGate } from "@/components/membership/membership-gate";
import type { AppServices, CheckInService } from "@/lib/domain";
import type { MapConfig } from "@/lib/map-config";
import { createServices, type ServiceMode } from "@/lib/service-factory";

function DemoProduct({ services, mapConfig, profileLocked = false, mode = "demo" }: { services: AppServices; mapConfig: MapConfig | null; profileLocked?: boolean; mode?: ServiceMode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideChecked, setGuideChecked] = useState(false);
  const resetDialogRef = useRef<HTMLDivElement>(null);
  const resetTitleRef = useRef<HTMLHeadingElement>(null);
  const session = useDemoSession();
  const signOut = useDemoSignOut();
  const selectedArtist = session.state.artistConfirmed ? session.selectedArtist : null;

  const chooseArtist = (artistId: NonNullable<typeof session.state.selectedArtistId>) => {
    session.dispatch({ type: "changeProfile", artistId });
    setDrawerOpen(false);
  };
  const confirmArtist = (artistId: NonNullable<typeof session.state.selectedArtistId>) => {
    session.dispatch({ type: "selectArtist", artistId });
    // Choosing a first fandom always opens the guide: it is the moment the
    // territory page appears, and a dismissal earlier in the tab was about a
    // page this visitor had not reached yet.
    setGuideChecked(true);
    setGuideOpen(true);
  };

  const closeGuide = () => {
    setGuideOpen(false);
    try {
      markTutorialSeen(window.sessionStorage);
    } catch {
      // Nothing to remember when storage is blocked.
    }
  };

  const resetDemo = () => {
    session.reset();
    setDrawerOpen(false);
    setResetOpen(false);
  };
  // The guide explains the territory page, so it waits for a fandom instead
  // of greeting a visitor who is still choosing one.
  useEffect(() => {
    if (guideChecked || !session.state.artistConfirmed) return;
    setGuideChecked(true);
    try {
      if (!hasSeenTutorial(window.sessionStorage)) setGuideOpen(true);
    } catch {
      // Blocked storage only means the guide greets this visit too.
    }
  }, [guideChecked, session.state.artistConfirmed]);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [session.state.activeTab, session.state.artistConfirmed]);
  useModalFocus(resetOpen, resetDialogRef, resetTitleRef, () => setResetOpen(false));
  useBodyScrollLock(resetOpen);

  if (!session.hydrated) return <p role="status">{t(session.state.locale, "loading")}</p>;

  return (
    <>
      <AppShell
        variant="demo"
        activeTab={session.state.activeTab}
        locale={session.state.locale}
        interactionDisabled={resetOpen}
        navigationHidden={!session.state.artistConfirmed}
        backControl={!session.state.artistConfirmed ? <BackToLoginButton locale={session.state.locale} /> : null}
        onLocaleChange={(locale) => session.dispatch({ type: "setLocale", locale })}
        onTabChange={(tab) => session.dispatch({ type: "changeTab", tab })}
        statusContent={(
          <ObjectiveStrip
            locale={session.state.locale}
            fandomName={selectedArtist?.fandomName ?? null}
            fandomColor={selectedArtist?.color ?? null}
            onChangeArtist={profileLocked ? undefined : () => setDrawerOpen(true)}
          />
        )}
      >
        {!session.state.artistConfirmed ? (
          <ProfileSetup locale={session.state.locale} onConfirm={confirmArtist} />
        ) : null}
        {session.state.artistConfirmed && session.state.activeTab === "explore" ? (
            <TerritoryView
              key={session.state.artistConfirmed ? `artist:${session.state.selectedArtistId}` : "unconfirmed"}
              mapConfig={mapConfig}
            />
        ) : null}
        {session.state.artistConfirmed && session.state.activeTab === "expedition" ? (
            <PreviewExpeditionView
              expeditionId={session.state.selectedExpeditionId}
              checkInService={services.checkIn}
              checkInMode={mode}
              onBack={() => undefined}
            />
        ) : null}
        {session.state.artistConfirmed && session.state.activeTab === "battle" ? (
            <RankingView
              locale={session.state.locale}
              fandoms={session.state.fandoms}
              territories={session.state.territories}
              selectedArtistId={session.state.artistConfirmed ? session.state.selectedArtistId : null}
              onInspectTerritory={(territoryId) => session.dispatch({ type: "selectTerritory", territoryId })}
            />
        ) : null}
        {session.state.artistConfirmed && session.state.activeTab === "journey" ? (
          <RecordView
            locale={session.state.locale}
            session={session.state}
            onExploreTerritories={() => session.dispatch({ type: "changeTab", tab: "explore" })}
            onChangeArtist={profileLocked ? undefined : () => setDrawerOpen(true)}
            onSignOut={signOut ?? undefined}
            onReset={() => setResetOpen(true)}
            onReplayGuide={() => setGuideOpen(true)}
          />
        ) : null}
        {!profileLocked ? (
          <ArtistDrawer
            open={drawerOpen}
            locale={session.state.locale}
            selectedArtistId={session.state.artistConfirmed ? session.state.selectedArtistId : null}
            onClose={() => setDrawerOpen(false)}
            onSelect={chooseArtist}
          />
        ) : null}
      </AppShell>
      {guideOpen ? <TutorialOverlay locale={session.state.locale} onClose={closeGuide} /> : null}
      {resetOpen && typeof document !== "undefined" ? createPortal(
        <div className="reset-dialog-overlay">
          <div className="reset-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-dialog-title" ref={resetDialogRef}>
            <h2 id="reset-dialog-title" tabIndex={-1} ref={resetTitleRef}>{t(session.state.locale, "resetConfirmTitle")}</h2>
            <p>{t(session.state.locale, "resetConfirmBody")}</p>
            <div className="reset-dialog-actions">
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

export function createPreviewCheckInService(services: AppServices): CheckInService {
  return {
    ...services.checkIn,
    async create(previewPlaceId) {
      const previewPlace = previewContent.places.find((place) => place.id === previewPlaceId);
      if (!previewPlace) throw new Error("PREVIEW_PLACE_NOT_FOUND");
      const places = await services.tourism.listPlaces({
        regionId: previewPlace.territoryId,
        query: previewPlace.name.ko,
      });
      const expected = previewPlace.name.ko.replace(/\s+/g, "").toLocaleLowerCase("ko");
      const place = places.find((candidate) => (
        candidate.nameKo.replace(/\s+/g, "").toLocaleLowerCase("ko") === expected
      ));
      if (!place) throw new Error("LIVE_PLACE_NOT_FOUND");
      return services.checkIn.create(place.id);
    },
  };
}

function IntegratedModernProduct({ services, mapConfig }: { services: AppServices; mapConfig: MapConfig | null }) {
  const membership = useMembership();
  const session = useDemoSession();
  const uiServices = useMemo(() => ({ ...services, checkIn: createPreviewCheckInService(services) }), [services]);
  const { dispatch, hydrated, state } = session;
  const signOut = useCallback(() => {
    window.location.href = "/api/auth/signout";
  }, []);

  useEffect(() => {
    if (!hydrated || !membership.membership) return;
    const fandom = membership.fandoms.find((item) => item.id === membership.membership?.fandomId);
    const artist = previewContent.artists.find((item) => item.fandomName === fandom?.name);
    if (!artist || (state.artistConfirmed && state.selectedArtistId === artist.id)) return;
    dispatch({
      type: state.artistConfirmed ? "changeProfile" : "selectArtist",
      artistId: artist.id,
    });
  }, [dispatch, hydrated, membership.fandoms, membership.membership, state.artistConfirmed, state.selectedArtistId]);

  return (
    <DemoSignOutProvider value={signOut}>
      <DemoProduct services={uiServices} mapConfig={mapConfig} profileLocked mode="integrated" />
    </DemoSignOutProvider>
  );
}

export function KTownApp({ mode, mapConfig }: { mode: ServiceMode; mapConfig: MapConfig | null }) {
  const services = useMemo(() => createServices(mode), [mode]);
  const remoteStore = useMemo(() => createRemoteDemoSessionStore(), []);

  if (mode === "demo") {
    return <DemoSessionProvider><DemoProduct services={services} mapConfig={mapConfig} /></DemoSessionProvider>;
  }

  return (
    <MembershipProvider service={services.membership}>
      <MembershipGate>
        <DemoSessionProvider remote={remoteStore}>
          <IntegratedModernProduct services={services} mapConfig={mapConfig} />
        </DemoSessionProvider>
      </MembershipGate>
    </MembershipProvider>
  );
}
