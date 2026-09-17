"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import {
  DEFAULT_TUTORIAL_STATE,
  TUTORIAL_STEP_IDS,
  type TutorialState,
} from "@/features/tutorial/tutorial-config";
import { loadTutorialState, saveTutorialState } from "@/features/tutorial/tutorial-storage";

interface TutorialContextValue {
  state: TutorialState;
  startTutorial: () => void;
  replayTutorial: () => void;
  nextStep: () => void;
  completeStep: (step: TutorialState["step"]) => void;
  skipTutorial: () => void;
  completeTutorial: () => void;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

type Action =
  | { type: "hydrate"; state: TutorialState }
  | { type: "start"; isReplay: boolean }
  | { type: "next" }
  | { type: "completeStep"; step: TutorialState["step"] }
  | { type: "skip" }
  | { type: "complete" };

function reducer(state: TutorialState, action: Action): TutorialState {
  if (action.type === "hydrate") return action.state;
  if (action.type === "start") return { status: "running", step: "choose-fandom", isReplay: action.isReplay };
  if (action.type === "skip") return { ...state, status: "skipped" };
  if (action.type === "complete") return { ...state, status: "completed" };
  if (action.type === "completeStep") {
    if (state.status !== "running" || state.step !== action.step) return state;
    const stepIndex = TUTORIAL_STEP_IDS.indexOf(state.step);
    const nextStep = TUTORIAL_STEP_IDS[stepIndex + 1];
    return nextStep ? { ...state, step: nextStep } : { ...state, status: "completed" };
  }
  if (state.status !== "running") return state;

  const stepIndex = TUTORIAL_STEP_IDS.indexOf(state.step);
  const nextStep = TUTORIAL_STEP_IDS[stepIndex + 1];
  return nextStep
    ? { ...state, step: nextStep }
    : { ...state, status: "completed" };
}

export function TutorialProvider({ children, storage }: { children: ReactNode; storage?: Storage }) {
  const [state, dispatch] = useReducer(reducer, DEFAULT_TUTORIAL_STATE);
  const hydratedRef = useRef(false);
  const skipNextSaveRef = useRef(false);
  const tutorialStorage = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);

  useEffect(() => {
    if (!tutorialStorage) {
      hydratedRef.current = true;
      return;
    }
    dispatch({ type: "hydrate", state: loadTutorialState(tutorialStorage) });
    skipNextSaveRef.current = true;
    hydratedRef.current = true;
  }, [tutorialStorage]);

  useEffect(() => {
    if (!hydratedRef.current || !tutorialStorage) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    saveTutorialState(tutorialStorage, state);
  }, [state, tutorialStorage]);

  const startTutorial = useCallback(() => dispatch({ type: "start", isReplay: false }), []);
  const replayTutorial = useCallback(() => dispatch({ type: "start", isReplay: true }), []);
  const nextStep = useCallback(() => dispatch({ type: "next" }), []);
  const completeStep = useCallback((step: TutorialState["step"]) => dispatch({ type: "completeStep", step }), []);
  const skipTutorial = useCallback(() => dispatch({ type: "skip" }), []);
  const completeTutorial = useCallback(() => dispatch({ type: "complete" }), []);

  const value = useMemo(() => ({
    state,
    startTutorial,
    replayTutorial,
    nextStep,
    completeStep,
    skipTutorial,
    completeTutorial,
  }), [completeStep, completeTutorial, nextStep, replayTutorial, skipTutorial, startTutorial, state]);

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}

export function useTutorial() {
  const value = useContext(TutorialContext);
  if (!value) throw new Error("TutorialProvider required");
  return value;
}

export function useOptionalTutorial() {
  return useContext(TutorialContext);
}