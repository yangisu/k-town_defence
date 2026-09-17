export const TUTORIAL_STORAGE_KEY = "ktown-defense:tutorial:v1";
export const TUTORIAL_CONTENT_VERSION = 1;

export const TUTORIAL_STEP_IDS = [
  "choose-fandom",
  "open-territory",
  "start-expedition",
  "open-checkin",
] as const;

export type TutorialStepId = (typeof TUTORIAL_STEP_IDS)[number];
export type TutorialStatus = "idle" | "running" | "completed" | "skipped";

export interface TutorialState {
  status: TutorialStatus;
  step: TutorialStepId;
  isReplay: boolean;
}

export interface StoredTutorialState extends TutorialState {
  contentVersion: number;
}

export const TUTORIAL_TARGETS: Record<TutorialStepId, string> = {
  "choose-fandom": "choose-fandom",
  "open-territory": "recommended-territory",
  "start-expedition": "start-expedition",
  "open-checkin": "first-checkin",
};

export const DEFAULT_TUTORIAL_STATE: TutorialState = {
  status: "idle",
  step: "choose-fandom",
  isReplay: false,
};