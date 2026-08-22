"use client";

import { createContext, type Dispatch, type ReactNode, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { previewContent } from "./content";
import {
  createInitialDemoSession,
  demoSessionReducer,
  loadDemoSession,
  saveDemoSession,
  type DemoSession,
  type DemoSessionAction,
} from "./demo-session";

interface DemoSessionContextValue {
  state: DemoSession;
  dispatch: Dispatch<DemoSessionAction>;
  selectedArtist: (typeof previewContent.artists)[number] | null;
  selectedTerritory: DemoSession["territories"][number] | null;
  reset: () => void;
}

const DemoSessionContext = createContext<DemoSessionContextValue | null>(null);

export function DemoSessionProvider({ children, storage }: { children: ReactNode; storage?: Storage }) {
  const [state, dispatch] = useReducer(demoSessionReducer, undefined, createInitialDemoSession);
  const loaded = useRef(false);
  const sessionStorage = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);

  useEffect(() => {
    if (!sessionStorage) return;
    let active = true;
    loaded.current = false;
    const savedState = loadDemoSession(sessionStorage);
    queueMicrotask(() => {
      if (!active) return;
      dispatch({ type: "hydrate", state: savedState });
      loaded.current = true;
    });
    return () => { active = false; };
  }, [sessionStorage]);

  useEffect(() => {
    if (!sessionStorage || !loaded.current) return;
    saveDemoSession(sessionStorage, state);
  }, [sessionStorage, state]);

  const value = useMemo(() => {
    const selectedArtist = previewContent.artists.find((artist) => artist.id === state.selectedArtistId) ?? null;
    const selectedTerritory = state.territories.find((territory) => territory.id === state.selectedTerritoryId) ?? null;
    return { state, dispatch, selectedArtist, selectedTerritory, reset: () => dispatch({ type: "reset" }) };
  }, [state]);

  return <DemoSessionContext.Provider value={value}>{children}</DemoSessionContext.Provider>;
}

export function useDemoSession() {
  const value = useContext(DemoSessionContext);
  if (!value) throw new Error("DemoSessionProvider required");
  return value;
}
