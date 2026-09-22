"use client";

import { createContext, type Dispatch, type ReactNode, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { previewContent } from "./content";
import type { FandomStanding, PreviewTerritory } from "./types";
import {
  createInitialDemoSession,
  DEMO_SESSION_KEY,
  LEGACY_DEMO_SESSION_KEY,
  demoSessionReducer,
  loadDemoSession,
  parseDemoSession,
  saveDemoSession,
  type DemoSession,
  type DemoSessionAction,
} from "./demo-session";

interface DemoSessionContextValue {
  state: DemoSession;
  hydrated: boolean;
  dispatch: Dispatch<DemoSessionAction>;
  selectedArtist: (typeof previewContent.artists)[number] | null;
  selectedTerritory: DemoSession["territories"][number] | null;
  reset: () => void;
  territoryError: boolean;
  /** Freezes what gets written down at the given state, for a practice run
   *  whose every effect is meant to be thrown away. Storage and the server
   *  keep seeing that state however the live one moves; null lets them see
   *  the live one again. */
  seal: (frozen: DemoSession | null) => void;
}

const DemoSessionContext = createContext<DemoSessionContextValue | null>(null);

export interface RemoteDemoSessionStore {
  load(): Promise<unknown | null>;
  save(state: DemoSession): Promise<void>;
}

function fandomsFor(territories: PreviewTerritory[]): FandomStanding[] {
  return previewContent.artists.map((artist) => ({
    artistId: artist.id,
    fandomName: artist.fandomName,
    strongholds: territories.filter((territory) => territory.ownerArtistId === artist.id).length,
    validPoints: territories.reduce(
      (total, territory) => total + (territory.standings.find((standing) => standing.artistId === artist.id)?.validPoints ?? 0),
      0,
    ),
    trend: "same",
  }));
}

export function DemoSessionProvider({ children, storage, remote, loadTerritories }: {
  children: ReactNode;
  storage?: Storage;
  remote?: RemoteDemoSessionStore;
  loadTerritories?: () => Promise<PreviewTerritory[]>;
}) {
  const [state, dispatch] = useReducer(demoSessionReducer, undefined, createInitialDemoSession);
  const [hydrated, setHydrated] = useState(false);
  const [serverTerritories, setServerTerritories] = useState<PreviewTerritory[] | null>(null);
  const [territoryError, setTerritoryError] = useState(false);
  // While frozen, this is what storage and the server keep seeing.
  const [frozen, setFrozen] = useState<DemoSession | null>(null);
  const loaded = useRef(false);
  const skipNextSave = useRef(false);
  const sessionStorage = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);

  useEffect(() => {
    if (!sessionStorage) return;
    let active = true;
    loaded.current = false;
    const localState = loadDemoSession(sessionStorage);
    sessionStorage.removeItem(LEGACY_DEMO_SESSION_KEY);
    void (async () => {
      let savedState = localState;
      let persistenceReady = true;
      if (remote) {
        try {
          savedState = parseDemoSession(await remote.load()) ?? createInitialDemoSession();
        } catch {
          savedState = createInitialDemoSession();
          persistenceReady = false;
        }
      }
      if (loadTerritories) {
        try {
          const territories = await loadTerritories();
          if (!active) return;
          setServerTerritories(territories);
        } catch {
          if (!active) return;
          setServerTerritories([]);
          setTerritoryError(true);
        }
      }
      if (!active) return;
      dispatch({ type: "hydrate", state: savedState });
      loaded.current = persistenceReady;
      setHydrated(true);
    })();
    return () => { active = false; };
  }, [loadTerritories, remote, sessionStorage]);

  // Nothing the tutorial does is written down. It has the reader walk a real
  // check-in, and a practice visit must not survive in storage, on the server
  // or in their records — not even if they close the tab halfway through.
  useEffect(() => {
    if (!sessionStorage || !loaded.current) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    // Frozen means a practice run is under way: what was true before it
    // started is what stays written down, however far the run wanders.
    const recorded = frozen ?? state;
    saveDemoSession(sessionStorage, recorded);
    if (!remote) return;
    const timeout = window.setTimeout(() => {
      void remote.save(recorded).catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [frozen, remote, sessionStorage, state]);

  const value = useMemo(() => {
    const visibleState = serverTerritories === null ? state : {
      ...state,
      territories: serverTerritories,
      fandoms: fandomsFor(serverTerritories),
    };
    const selectedArtist = previewContent.artists.find((artist) => artist.id === visibleState.selectedArtistId) ?? null;
    const selectedTerritory = visibleState.territories.find((territory) => territory.id === visibleState.selectedTerritoryId) ?? null;
    const reset = () => {
      sessionStorage?.removeItem(DEMO_SESSION_KEY);
      sessionStorage?.removeItem(LEGACY_DEMO_SESSION_KEY);
      skipNextSave.current = true;
      // A practice run's seal decides what gets written down, so it cannot
      // outlive the session it was freezing.
      setFrozen(null);
      // A signed-in player's session also lives on the server, and clearing
      // only this browser left that copy intact: the next page load loaded the
      // played session straight back, and the reset undid itself. The empty
      // session goes there directly, since the save below is suppressed.
      if (remote) {
        void remote.save({ ...createInitialDemoSession(), locale: state.locale }).catch(() => undefined);
      }
      dispatch({ type: "reset" });
    };
    return {
      state: visibleState,
      hydrated,
      dispatch,
      selectedArtist,
      selectedTerritory,
      reset,
      territoryError,
      seal: setFrozen,
    };
  }, [hydrated, remote, serverTerritories, sessionStorage, state, territoryError]);

  return <DemoSessionContext.Provider value={value}>{children}</DemoSessionContext.Provider>;
}

export function useDemoSession() {
  const value = useContext(DemoSessionContext);
  if (!value) throw new Error("DemoSessionProvider required");
  return value;
}

/**
 * The whole bag of folds, for a page whose sections are keyed by something it
 * only learns at render time — a fandom id, a badge stage. Same bargain as
 * useDisclosure: written to the session when there is one, kept locally when
 * there is not.
 */
export function useDisclosures(): [Record<string, boolean>, (key: string, open: boolean) => void] {
  const session = useContext(DemoSessionContext);
  const [local, setLocal] = useState<Record<string, boolean>>({});
  if (!session) return [local, (key, open) => setLocal((current) => ({ ...current, [key]: open }))];
  return [
    session.state.disclosures,
    (key, open) => session.dispatch({ type: "setDisclosure", key, open }),
  ];
}

/**
 * A fold that remembers itself. Reads like useState, but the answer lives in
 * the session, so a section the reader closed on the ranking page is still
 * closed when they come back to it from the map.
 */
export function useDisclosure(
  key: string,
  fallback: boolean,
): [boolean, (open: boolean | ((current: boolean) => boolean)) => void] {
  // A panel rendered outside a session — a preview, a test — still folds; it
  // just has nowhere to write the answer down, so it keeps it to itself.
  const session = useContext(DemoSessionContext);
  const [local, setLocal] = useState(fallback);
  if (!session) return [local, setLocal];
  const open = session.state.disclosures[key] ?? fallback;
  return [open, (next) => session.dispatch({
    type: "setDisclosure",
    key,
    open: typeof next === "function" ? next(open) : next,
  })];
}
