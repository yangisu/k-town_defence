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
      dispatch({ type: "reset" });
    };
    return { state: visibleState, hydrated, dispatch, selectedArtist, selectedTerritory, reset, territoryError };
  }, [hydrated, serverTerritories, sessionStorage, state, territoryError]);

  return <DemoSessionContext.Provider value={value}>{children}</DemoSessionContext.Provider>;
}

export function useDemoSession() {
  const value = useContext(DemoSessionContext);
  if (!value) throw new Error("DemoSessionProvider required");
  return value;
}
