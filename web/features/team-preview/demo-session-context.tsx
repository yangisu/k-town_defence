"use client";

import { createContext, type Dispatch, type ReactNode, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { previewContent } from "./content";
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
}

const DemoSessionContext = createContext<DemoSessionContextValue | null>(null);

export interface RemoteDemoSessionStore {
  load(): Promise<unknown | null>;
  save(state: DemoSession): Promise<void>;
}

export function DemoSessionProvider({ children, storage, remote }: { children: ReactNode; storage?: Storage; remote?: RemoteDemoSessionStore }) {
  const [state, dispatch] = useReducer(demoSessionReducer, undefined, createInitialDemoSession);
  const [hydrated, setHydrated] = useState(false);
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
      if (!active) return;
      dispatch({ type: "hydrate", state: savedState });
      loaded.current = persistenceReady;
      setHydrated(true);
    })();
    return () => { active = false; };
  }, [remote, sessionStorage]);

  useEffect(() => {
    if (!sessionStorage || !loaded.current) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    saveDemoSession(sessionStorage, state);
    if (!remote) return;
    const timeout = window.setTimeout(() => {
      void remote.save(state).catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [remote, sessionStorage, state]);

  const value = useMemo(() => {
    const selectedArtist = previewContent.artists.find((artist) => artist.id === state.selectedArtistId) ?? null;
    const selectedTerritory = state.territories.find((territory) => territory.id === state.selectedTerritoryId) ?? null;
    const reset = () => {
      sessionStorage?.removeItem(DEMO_SESSION_KEY);
      sessionStorage?.removeItem(LEGACY_DEMO_SESSION_KEY);
      skipNextSave.current = true;
      dispatch({ type: "reset" });
    };
    return { state, hydrated, dispatch, selectedArtist, selectedTerritory, reset };
  }, [hydrated, sessionStorage, state]);

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
