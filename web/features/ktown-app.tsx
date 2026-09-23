"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AppShell } from "@/components/app-shell";
import { BackToLoginButton } from "@/components/demo-entry/back-to-login-button";
import { DemoSignOutProvider, useDemoSignOut } from "@/features/demo-entry/demo-sign-out";
import { ArtistDrawer } from "@/components/team-preview/artist-drawer";
import { ProfileSetup } from "@/components/team-preview/profile-setup";
import { DemoBrandTransition } from "@/components/demo-entry/demo-brand-transition";
import { hasSeenBrandWelcome, markBrandWelcomeSeen } from "@/features/team-preview/brand-welcome";
import { TutorialOverlay } from "@/components/team-preview/tutorial-overlay";
import type { GuideStep } from "@/features/team-preview/guide-steps";
import { forgetTutorial, hasSeenTutorial, markTutorialSeen } from "@/features/team-preview/tutorial-seen";
import { ObjectiveStrip } from "@/components/team-preview/objective-strip";
import { TerritoryView } from "@/components/team-preview/territory-view";
import { PreviewExpeditionView } from "@/components/team-preview/expedition-view";
import { RankingView } from "@/components/team-preview/ranking-view";
import { RecordView } from "@/components/team-preview/record-view";
import { useBodyScrollLock } from "@/components/ui/use-body-scroll-lock";
import { useModalFocus } from "@/components/ui/use-modal-focus";
import { MembershipProvider, useMembership } from "@/features/membership/membership-context";
import { DemoSessionProvider, useDemoSession } from "@/features/team-preview/demo-session-context";
import type { DemoSession as DemoSessionState } from "@/features/team-preview/demo-session";
import type { ArtistId, ArtistProfile } from "@/features/team-preview/types";
import { artistProfileForFandom } from "@/features/team-preview/fandom-artists";
import { getPlayableExpedition, previewContent } from "@/features/team-preview/content";
import { isGuideRunning } from "@/features/team-preview/guide-running";
import { createRemoteDemoSessionStore } from "@/features/team-preview/remote-session-store";
import { t } from "@/features/team-preview/i18n";
import { MembershipGate, membershipErrorCopy } from "@/components/membership/membership-gate";
import type { AppServices, CheckInService, PersistedExpedition } from "@/lib/domain";
import type { MapConfig } from "@/lib/map-config";
import { createServices, type ServiceMode } from "@/lib/service-factory";
import { createDemoServices } from "@/lib/demo-services";
import { mapTerritorySnapshots } from "@/lib/adapters/territory";

function DemoProduct({ services, mapConfig, profileLocked = false, mode = "demo", checkInMode, practiceCheckInService, roster, onAddArtist, onLeaveSeason, onChangeFandom, choosingArtist = false, choiceNotice, accountId }: {
  services: AppServices;
  mapConfig: MapConfig | null;
  profileLocked?: boolean;
  mode?: ServiceMode;
  checkInMode?: "demo" | "integrated";
  /** The artists to offer, which in a season is the fandoms it actually holds
   *  — including the ones members named themselves. Offering the whole preview
   *  catalog instead let a reader pick one with no fandom behind it, which
   *  closed the drawer and did nothing at all. */
  roster?: ArtistProfile[];
  /** Adds an artist the season does not carry yet, then joins its fandom. */
  onAddArtist?: (name: string, artistName: string) => Promise<void>;
  /** Clears the season membership as part of a reset, so the fandom picker
   *  comes back instead of the old fandom returning from the server. */
  onLeaveSeason?: () => Promise<void>;
  /** Used for the guide's practice check-in instead of `services.checkIn`.
   *  The guide can walk a reader through any territory, but the live catalog
   *  only has real places for Busan (see `hasLiveExpeditionData`), so a
   *  practice run that hit the real backend would get stuck on a place it
   *  cannot find. Practice never counts for score anyway, so it runs fully
   *  local instead of depending on live data coverage. */
  practiceCheckInService?: CheckInService;
  /** Integrated mode changes a fandom through the season membership rather
   *  than the local session, and the API may refuse mid-season. */
  onChangeFandom?: (artistId: NonNullable<DemoSessionState["selectedArtistId"]>) => void;
  /** The season has no fandom for this member yet, whatever the session
   *  remembers, so the first-run picker shows — the same one the demo opens
   *  with, rather than a separate form of its own. */
  choosingArtist?: boolean;
  /** Why the last choice did not go through, or that it is being saved. */
  choiceNotice?: string | null;
  /** Whose run this is, where there is an account: the guide is greeted once
   *  per reader, and a reset does not make them a new one. */
  accountId?: string | null;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Leaving a fandom cannot be undone from the UI, so it is asked before it is
  // done. Holding the artist id here is what makes the question specific.
  const [leavingArtistId, setLeavingArtistId] = useState<ArtistId | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideChecked, setGuideChecked] = useState(false);
  const [liveExpedition, setLiveExpedition] = useState<PersistedExpedition | null>(null);
  const [expeditionRecoveryStatus, setExpeditionRecoveryStatus] = useState<"ready" | "loading" | "error">(
    mode === "integrated" ? "loading" : "ready",
  );
  const [expeditionRecoveryAttempt, setExpeditionRecoveryAttempt] = useState(0);
  // The session as it stood when the guide opened, so the practice run it
  // walks the reader through can be undone in full when it closes.
  const guideSnapshot = useRef<DemoSessionState | null>(null);
  const resetDialogRef = useRef<HTMLDivElement>(null);
  const resetTitleRef = useRef<HTMLHeadingElement>(null);
  const leaveDialogRef = useRef<HTMLDivElement>(null);
  const leaveTitleRef = useRef<HTMLHeadingElement>(null);
  const session = useDemoSession();
  const signOut = useDemoSignOut();
  const artistConfirmed = session.state.artistConfirmed && !choosingArtist;
  const selectedArtist = artistConfirmed ? session.selectedArtist : null;

  useEffect(() => {
    if (mode !== "integrated") return;
    let active = true;
    void services.expeditions.current()
      .then((expedition) => {
        if (!active) return;
        setLiveExpedition(expedition);
        setExpeditionRecoveryStatus("ready");
      })
      .catch(() => {
        if (active) setExpeditionRecoveryStatus("error");
      });
    return () => {
      active = false;
    };
  }, [expeditionRecoveryAttempt, mode, services]);

  const canChangeArtist = !profileLocked || Boolean(onChangeFandom);
  const chooseArtist = (artistId: NonNullable<typeof session.state.selectedArtistId>) => {
    if (onChangeFandom) onChangeFandom(artistId);
    else session.dispatch({ type: "changeProfile", artistId });
    setDrawerOpen(false);
  };
  const confirmArtist = (artistId: NonNullable<typeof session.state.selectedArtistId>) => {
    // The fandom is the season membership's, so it is joined there; the
    // session follows once the server has it, and the guide with it.
    if (onChangeFandom) {
      onChangeFandom(artistId);
      return;
    }
    session.dispatch({ type: "selectArtist", artistId });
    // Choosing a first fandom is when the territory page appears, so the guide
    // opens here — but only for a visitor who has never finished it. Coming
    // back through a link is not a new account.
    setGuideChecked(true);
    try {
      if (!hasSeenTutorial(window.localStorage, accountId)) openGuide();
    } catch {
      openGuide();
    }
  };

  const openGuide = () => setGuideOpen(true);

  // The guide describes controls that only exist on a particular tab, and the
  // tactical panel only renders once a territory is chosen. Put the page into
  // that state so a replay from My Record explains the real screen.
  const prepareGuideStep = useCallback((step: GuideStep) => {
    if (step.awaits === "territory") {
      // The reader is about to choose one, so clear any earlier choice and, on
      // a phone, open the list that holds the card they need to tap.
      if (session.state.activeTab !== step.tab) session.dispatch({ type: "changeTab", tab: step.tab });
      if (session.state.selectedTerritoryId) session.dispatch({ type: "selectTerritory", territoryId: null });
      document.querySelector<HTMLButtonElement>(".territory-list-toggle[aria-expanded='false']")?.click();
      return;
    }
    // Asking someone to press Start Expedition while a route is already
    // running answers itself: the step saw the route and moved straight on.
    // Clearing it first means the press is theirs to make.
    if (step.awaits === "expedition") {
      if (session.state.activeTab !== step.tab) session.dispatch({ type: "changeTab", tab: step.tab });
      if (session.state.activeExpeditionId) session.dispatch({ type: "endExpedition" });
      if (!session.state.selectedTerritoryId) {
        const first = session.state.territories[0];
        if (first) session.dispatch({ type: "selectTerritory", territoryId: first.id });
      }
      return;
    }
    // The expedition chapter needs a route open. The reader starts it
    // themselves on the step before; this only covers a replay that jumps
    // straight in, and picks the route for whatever territory they are on.
    if (step.tab === "expedition") {
      if (session.state.activeExpeditionId) {
        if (session.state.activeTab !== "expedition") session.dispatch({ type: "changeTab", tab: "expedition" });
        return;
      }
      // The closing step has no target and comes after the route was ended on
      // purpose; opening a fresh one under it would undo what it just said.
      if (!step.target) return;
      const territoryId = session.state.selectedTerritoryId ?? session.state.territories[0]?.id ?? null;
      const artistId = session.state.selectedArtistId;
      const route = territoryId && artistId ? getPlayableExpedition(artistId, territoryId) : null;
      if (route && territoryId) {
        session.dispatch({ type: "openRecommendedExpedition", expeditionId: route.id, territoryId });
      }
      return;
    }
    if (session.state.activeTab !== step.tab) session.dispatch({ type: "changeTab", tab: step.tab });
    if (!step.needsTerritory || session.state.selectedTerritoryId) return;
    const first = session.state.territories[0];
    if (first) session.dispatch({ type: "selectTerritory", territoryId: first.id });
  }, [session]);

  const closeGuide = () => {
    setGuideOpen(false);
    session.seal(null);
    // The guide has the reader walk a real check-in, so it hands the session
    // back exactly as it found it: the practice points, the route it started
    // and the territory it picked are all put back. Nothing done inside the
    // tutorial counts.
    const before = guideSnapshot.current;
    guideSnapshot.current = null;
    if (before) session.dispatch({ type: "hydrate", state: before });
    try {
      markTutorialSeen(window.localStorage, accountId);
    } catch {
      // Nothing to remember when storage is blocked.
    }
  };

  // Taken once the guide is actually up, not when it is asked for: confirming
  // a first fandom asks in the same breath as choosing one, and the state at
  // that moment has no fandom on it yet.
  useEffect(() => {
    if (!guideOpen) return;
    guideSnapshot.current ??= session.state;
    // The guide points at the first card in the list, so it needs a list. The
    // reader's own slice comes back with everything else when it closes.
    if (session.state.territoryFilter !== "all") session.dispatch({ type: "setTerritoryFilter", filter: "all" });
    // Storage and the server keep seeing the state the guide opened on, so a
    // practice check-in reaches neither — not even if the tab is closed
    // mid-tutorial — while the choice that opened the guide still persists.
    session.seal(guideSnapshot.current);
  }, [guideOpen, session]);

  // A seal outlives the guide only if this leaves the screen still holding
  // one. Unsealing on unmount alone — never on a re-render, which would lift
  // it mid-tutorial.
  const sealRef = useRef(session.seal);
  useEffect(() => { sealRef.current = session.seal; }, [session]);
  useEffect(() => () => sealRef.current(null), []);

  const resetDemo = () => {
    // The demo is asked for from the top, greeting included. An account's
    // reset clears the run, not the reader: they have already been greeted,
    // and being shown the guide again is not what they asked for.
    if (!accountId) forgetTutorial(window.localStorage);
    setGuideChecked(false);
    session.reset();
    // In a season the fandom is held by the server, not by this session, so
    // clearing only the session left the membership to put it straight back —
    // and the reset appeared to do nothing at all.
    void onLeaveSeason?.();
    setDrawerOpen(false);
    setResetOpen(false);
  };
  // The guide explains the territory page, so it waits for a fandom instead
  // of greeting a visitor who is still choosing one.
  useEffect(() => {
    if (guideChecked || !artistConfirmed) return;
    setGuideChecked(true);
    try {
      if (!hasSeenTutorial(window.localStorage, accountId)) openGuide();
    } catch {
      // Blocked storage only means the guide greets this visit too.
    }
  }, [accountId, guideChecked, artistConfirmed]);
  useEffect(() => {
    // Changing tab normally means starting at the top, but the guide decides
    // where each of its steps sits and this snapped the page away from it.
    if (isGuideRunning()) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [session.state.activeTab, artistConfirmed]);
  useModalFocus(resetOpen, resetDialogRef, resetTitleRef, () => setResetOpen(false));
  useBodyScrollLock(resetOpen);
  useModalFocus(leavingArtistId !== null, leaveDialogRef, leaveTitleRef, () => setLeavingArtistId(null));
  useBodyScrollLock(leavingArtistId !== null);

  if (!session.hydrated) return <p role="status">{t(session.state.locale, "loading")}</p>;
  if (session.territoryError) return <main className="membership-gate"><section className="membership-card"><h1>영토 정보를 불러오지 못했어요</h1><button onClick={() => window.location.reload()}>다시 시도</button></section></main>;

  return (
    <>
      <AppShell
        variant="demo"
        activeTab={session.state.activeTab}
        locale={session.state.locale}
        interactionDisabled={resetOpen}
        navigationHidden={!artistConfirmed}
        backControl={!artistConfirmed ? <BackToLoginButton locale={session.state.locale} /> : null}
        onLocaleChange={(locale) => session.dispatch({ type: "setLocale", locale })}
        onTabChange={(tab) => session.dispatch({ type: "changeTab", tab })}
        statusContent={artistConfirmed ? (
          // Before a fandom exists the strip had nothing to show but an
          // instruction the screen behind it already gives.
          <ObjectiveStrip
            locale={session.state.locale}
            fandomName={selectedArtist?.fandomName ?? null}
            fandomColor={selectedArtist?.color ?? null}
            onChangeArtist={canChangeArtist ? () => setDrawerOpen(true) : undefined}
          />
        ) : null}
      >
        {!artistConfirmed ? (
          <ProfileSetup locale={session.state.locale} roster={roster} onAddArtist={onAddArtist} notice={choiceNotice} onConfirm={confirmArtist} />
        ) : null}
        {artistConfirmed && session.state.activeTab === "explore" ? (
            <TerritoryView
              key={artistConfirmed ? `artist:${session.state.selectedArtistId}` : "unconfirmed"}
              mapConfig={mapConfig}
              services={services}
              integrated={mode === "integrated"}
              expeditionRecoveryStatus={expeditionRecoveryStatus}
              onRetryExpeditionRecovery={() => {
                setExpeditionRecoveryStatus("loading");
                setExpeditionRecoveryAttempt((attempt) => attempt + 1);
              }}
              onLiveExpedition={setLiveExpedition}
            />
        ) : null}
        {artistConfirmed && session.state.activeTab === "expedition" ? (
            <PreviewExpeditionView
              expeditionId={session.state.selectedExpeditionId}
              checkInService={mode === "integrated" && guideOpen && practiceCheckInService ? practiceCheckInService : services.checkIn}
              relatedAttractionService={services.tourism}
              checkInMode={checkInMode ?? mode}
              checkInPractice={mode === "integrated" && guideOpen}
              liveExpedition={liveExpedition}
              onEndExpedition={() => {
                if (liveExpedition?.status === "active") {
                  void services.expeditions.abandon(liveExpedition.id).catch(() => undefined);
                }
                 setLiveExpedition(null);
               }}
              onBack={() => undefined}
            />
        ) : null}
        {artistConfirmed && session.state.activeTab === "battle" ? (
            <RankingView
              locale={session.state.locale}
              fandoms={session.state.fandoms}
              territories={session.state.territories}
              selectedArtistId={artistConfirmed ? session.state.selectedArtistId : null}
              onInspectTerritory={(territoryId) => session.dispatch({ type: "selectTerritory", territoryId })}
            />
        ) : null}
        {artistConfirmed && session.state.activeTab === "journey" ? (
          <RecordView
            locale={session.state.locale}
            session={session.state}
            onExploreTerritories={() => session.dispatch({ type: "changeTab", tab: "explore" })}
            onChangeArtist={canChangeArtist ? () => setDrawerOpen(true) : undefined}
            onSignOut={signOut ?? undefined}
            onReset={() => setResetOpen(true)}
            onReplayGuide={openGuide}
          />
        ) : null}
        {canChangeArtist ? (
          <ArtistDrawer
            open={drawerOpen}
            locale={session.state.locale}
            selectedArtistId={artistConfirmed ? session.state.selectedArtistId : null}
            // A season holds one fandom per member, so the drawer lists just
            // that one as followed, and choosing another replaces it.
            followedArtistIds={onChangeFandom
              ? (artistConfirmed && session.state.selectedArtistId ? [session.state.selectedArtistId] : [])
              : session.state.followedArtistIds}
            roster={roster}
            onAddArtist={onAddArtist}
            onClose={() => setDrawerOpen(false)}
            onSelect={chooseArtist}
            onRemove={onChangeFandom ? undefined : setLeavingArtistId}
          />
        ) : null}
      </AppShell>
      {guideOpen ? <TutorialOverlay locale={session.state.locale} onClose={closeGuide} onPrepareStep={prepareGuideStep} territorySelected={session.state.selectedTerritoryId !== null} expeditionOpen={session.state.activeExpeditionId !== null} /> : null}
      {leavingArtistId !== null && typeof document !== "undefined" ? createPortal(
        <LeaveFandomDialog
          locale={session.state.locale}
          artistId={leavingArtistId}
          isLastFandom={session.state.followedArtistIds.length <= 1}
          dialogRef={leaveDialogRef}
          titleRef={leaveTitleRef}
          onCancel={() => setLeavingArtistId(null)}
          onConfirm={() => {
            session.dispatch({ type: "removeArtist", artistId: leavingArtistId });
            setLeavingArtistId(null);
            // Nothing left to manage, so the drawer closes onto the picker the
            // reducer has already put behind it.
            if (session.state.followedArtistIds.length <= 1) setDrawerOpen(false);
          }}
        />,
        document.body,
      ) : null}
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

/**
 * Leaving a fandom is asked, not assumed. The question names the fandom, says
 * what survives it — every visit already made — and warns when it is the last
 * one on the roster, because that sends the reader back to choosing.
 */
function LeaveFandomDialog({ locale, artistId, isLastFandom, dialogRef, titleRef, onCancel, onConfirm }: {
  locale: DemoSessionState["locale"];
  artistId: ArtistId;
  isLastFandom: boolean;
  dialogRef: RefObject<HTMLDivElement | null>;
  titleRef: RefObject<HTMLHeadingElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const artist = previewContent.artists.find((candidate) => candidate.id === artistId);
  const fandomName = artist?.fandomName ?? artistId;

  return (
    <div className="reset-dialog-overlay">
      <div className="reset-dialog" role="dialog" aria-modal="true" aria-labelledby="leave-fandom-title" ref={dialogRef}>
        {/* Removing the only fandom left is not "leave this one", it is
            "follow nobody", and it lands back on the artist picker. The
            question says that rather than making the reader infer it. */}
        <h2 id="leave-fandom-title" tabIndex={-1} ref={titleRef}>
          {isLastFandom
            ? t(locale, "recordRemoveAllTitle")
            : t(locale, "recordRemoveConfirmTitle").replace("{fandom}", fandomName)}
        </h2>
        <p>{t(locale, isLastFandom ? "recordRemoveAllBody" : "recordRemoveConfirmBody")}</p>
        <div className="reset-dialog-actions">
          <button type="button" onClick={onCancel}>{t(locale, "recordRemoveCancel")}</button>
          <button type="button" onClick={onConfirm}>
            {t(locale, isLastFandom ? "recordRemoveAllAction" : "recordRemoveConfirmAction")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function createPreviewCheckInService(services: AppServices): CheckInService {
  return {
    ...services.checkIn,
    async create(previewPlaceId, options) {
      const previewPlace = previewContent.places.find((place) => place.id === previewPlaceId);
      if (!previewPlace) return services.checkIn.create(previewPlaceId, options);
      const places = await services.tourism.listPlaces({
        regionId: previewPlace.territoryId,
        query: previewPlace.name.ko,
      });
      const expected = previewPlace.name.ko.replace(/\s+/g, "").toLocaleLowerCase("ko");
      const place = places.find((candidate) => (
        candidate.nameKo.replace(/\s+/g, "").toLocaleLowerCase("ko") === expected
      ));
      if (!place) throw new Error("LIVE_PLACE_NOT_FOUND");
      return services.checkIn.create(place.id, options);
    },
  };
}

function IntegratedModernProduct({ services, mapConfig }: { services: AppServices; mapConfig: MapConfig | null }) {
  const membership = useMembership();
  const session = useDemoSession();
  const uiServices = useMemo(() => ({ ...services, checkIn: createPreviewCheckInService(services) }), [services]);
  // The guide's practice check-in never touches the live backend: see
  // `practiceCheckInService` on `DemoProduct`.
  const practiceCheckInService = useMemo(() => createDemoServices().checkIn, []);
  // The brand beat the demo shows after logging in, kept for the real login.
  const [welcoming, setWelcoming] = useState(() => (
    typeof window === "undefined" ? false : !hasSeenBrandWelcome(window.sessionStorage)
  ));
  const { dispatch, hydrated, state } = session;
  const signOut = useCallback(() => {
    // Nothing to clear: the guide's answer is kept under this account's own
    // key (see `tutorialSeenKey`), so whoever signs in here next is greeted on
    // their own first run and this reader is not greeted again on their next.
    window.location.href = "/api/auth/signout";
  }, []);

  // The artists this season can be played as: its fandoms, each resolved to a
  // documented artist where the catalog has one and built from its own names
  // where it does not.
  const roster = useMemo(
    () => membership.fandoms.map(artistProfileForFandom),
    [membership.fandoms],
  );
  const fandomIdOf = useCallback(
    (artistId: ArtistId) => membership.fandoms.find(
      (fandom) => artistProfileForFandom(fandom).id === artistId,
    )?.id ?? null,
    [membership.fandoms],
  );

  useEffect(() => {
    if (!hydrated || !membership.membership) return;
    const fandom = membership.fandoms.find((item) => item.id === membership.membership?.fandomId);
    const artist = fandom ? artistProfileForFandom(fandom) : null;
    if (!artist || (state.artistConfirmed && state.selectedArtistId === artist.id)) return;
    dispatch({
      type: state.artistConfirmed ? "changeProfile" : "selectArtist",
      artistId: artist.id,
    });
  }, [dispatch, hydrated, membership.fandoms, membership.membership, state.artistConfirmed, state.selectedArtistId]);

  // A fandom belongs to the season membership here, not to the local session,
  // so changing one goes to the API — which may refuse it mid-season.
  const changeFandom = useCallback((artistId: NonNullable<DemoSessionState["selectedArtistId"]>) => {
    const fandomId = fandomIdOf(artistId);
    if (fandomId) void membership.selectFandom(fandomId);
  }, [fandomIdOf, membership]);

  // Naming an artist and playing as them is one gesture: the fandom is created
  // and joined together, or the reader would add one and then have to find it.
  const addArtist = useCallback(async (name: string, artistName: string) => {
    const created = await membership.createFandom(name, artistName);
    await membership.selectFandom(created.id);
  }, [membership]);

  const leaveSeason = useCallback(() => membership.leaveSeason(), [membership]);

  if (welcoming) {
    return <DemoBrandTransition onComplete={() => {
      markBrandWelcomeSeen(window.sessionStorage);
      setWelcoming(false);
    }} />;
  }

  return (
    <DemoSignOutProvider value={signOut}>
      <DemoProduct
        services={uiServices}
        mapConfig={mapConfig}
        profileLocked
        mode="integrated"
        practiceCheckInService={practiceCheckInService}
        roster={roster}
        onAddArtist={addArtist}
        onLeaveSeason={leaveSeason}
        checkInMode="demo"
        onChangeFandom={changeFandom}
        accountId={membership.membership?.userId ?? null}
        choosingArtist={membership.status === "selection_required"}
        choiceNotice={membership.isSelecting
          ? "팬덤을 저장하고 있어요"
          : membership.error ? membershipErrorCopy(membership.error.code) : null}
      />
    </DemoSignOutProvider>
  );
}

export function KTownApp({ mode, mapConfig }: { mode: ServiceMode; mapConfig: MapConfig | null }) {
  const services = useMemo(() => createServices(mode), [mode]);
  const remoteStore = useMemo(() => createRemoteDemoSessionStore(), []);
  const territoryLoader = useMemo(() => mode === "integrated"
    ? async () => mapTerritorySnapshots(await services.territories.list())
    : undefined, [mode, services]);

  if (mode === "demo") {
    return <DemoSessionProvider><DemoProduct services={services} mapConfig={mapConfig} /></DemoSessionProvider>;
  }

  return (
    <MembershipProvider service={services.membership}>
      <MembershipGate>
        <DemoSessionProvider remote={remoteStore} loadTerritories={territoryLoader}>
          <IntegratedModernProduct services={services} mapConfig={mapConfig} />
        </DemoSessionProvider>
      </MembershipGate>
    </MembershipProvider>
  );
}
