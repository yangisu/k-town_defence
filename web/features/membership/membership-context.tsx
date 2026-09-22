"use client";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useReducer, useRef } from "react";
import { ApiError } from "@/lib/api/api-error";
import type { FandomSummary, MembershipService, SeasonMembership } from "@/lib/domain";
type State = { status: "loading" | "selection_required" | "ready" | "error"; fandoms: FandomSummary[]; membership: SeasonMembership | null; error: ApiError | null; isSelecting: boolean };
type Action = { type: "loading" } | { type: "loaded"; fandoms: FandomSummary[]; membership: SeasonMembership | null } | { type: "selecting" } | { type: "selected"; membership: SeasonMembership } | { type: "failed"; error: ApiError; retain: boolean };
const initial: State = { status: "loading", fandoms: [], membership: null, error: null, isSelecting: false };
type Actions = {
  selectFandom(id: string): Promise<void>;
  /** Adds a fandom for an artist the catalog does not carry, and returns it so
   *  the caller can select it in the same gesture. */
  createFandom(name: string, artistName: string): Promise<FandomSummary>;
  /** Leaves this season, which puts the fandom picker back in front. */
  leaveSeason(): Promise<void>;
  retry(): Promise<void>;
};
const Context = createContext<(State & Actions) | null>(null);
const errorOf = (value: unknown) => value instanceof ApiError ? value : new ApiError(0, "UNKNOWN_ERROR");
function reducer(state: State, action: Action): State {
  if (action.type === "loading") return { ...state, status: "loading", error: null, isSelecting: false };
  if (action.type === "loaded") return { status: action.membership ? "ready" : "selection_required", fandoms: action.fandoms, membership: action.membership, error: null, isSelecting: false };
  if (action.type === "selecting") return { ...state, error: null, isSelecting: true };
  if (action.type === "selected") return { ...state, status: "ready", membership: action.membership, error: null, isSelecting: false };
  return { ...state, status: action.retain ? "selection_required" : "error", error: action.error, isSelecting: false };
}
export function MembershipProvider({ service, children }: { service: MembershipService; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial); const mounted = useRef(false); const inFlight = useRef<Promise<void> | null>(null);
  const retry = useCallback(async () => { dispatch({ type: "loading" }); try { const [fandoms, membership] = await Promise.all([service.listFandoms(), service.getCurrent()]); if (mounted.current) dispatch({ type: "loaded", fandoms, membership }); } catch (error) { if (mounted.current) dispatch({ type: "failed", error: errorOf(error), retain: false }); } }, [service]);
  useEffect(() => { mounted.current = true; void retry(); return () => { mounted.current = false; }; }, [retry]);
  const selectFandom = useCallback((id: string) => { if (inFlight.current) return inFlight.current; const operation = (async () => { dispatch({ type: "selecting" }); try { const membership = await service.selectFandom(id); if (mounted.current) dispatch({ type: "selected", membership }); } catch (error) { if (mounted.current) dispatch({ type: "failed", error: errorOf(error), retain: true }); } finally { inFlight.current = null; } })(); inFlight.current = operation; return operation; }, [service]);
  const createFandom = useCallback(async (name: string, artistName: string) => {
    const created = await service.createFandom(name, artistName);
    // The new fandom has to be listed before it can be chosen, and the list
    // this provider holds is the one the pickers read.
    if (mounted.current) {
      const [fandoms, membership] = await Promise.all([service.listFandoms(), service.getCurrent()]);
      if (mounted.current) dispatch({ type: "loaded", fandoms, membership });
    }
    return created;
  }, [service]);
  const leaveSeason = useCallback(async () => {
    await service.leaveSeason();
    // Back to a visitor with no fandom: the gate asks for one again.
    if (mounted.current) dispatch({ type: "loaded", fandoms: state.fandoms, membership: null });
  }, [service, state.fandoms]);
  return <Context.Provider value={{ ...state, selectFandom, createFandom, leaveSeason, retry }}>{children}</Context.Provider>;
}
export function useMembership() { const value = useContext(Context); if (!value) throw new Error("MembershipProvider required"); return value; }
/** The membership, where there is one. The preview runs without a season, and
 *  its session still has to resolve whoever is playing. */
export function useOptionalMembership() { return useContext(Context); }
