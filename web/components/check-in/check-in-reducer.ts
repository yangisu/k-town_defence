export type CheckInStatus = "collecting" | "paused" | "ready_to_submit" | "submitting" | "submitted_pending" | "approved" | "review_required" | "rejected" | "expired" | "cancelled";
export type GpsKind = "start" | "middle" | "end";
export type CheckInIssue = "low_accuracy" | "outside_geofence" | "photo_failed" | "network_failed" | null;

export interface DemoEvidence {
  simulatedDwellMinutes: number;
  localSpendVerified: boolean;
  accommodationVerified: boolean;
  reviewAccepted: boolean;
}

export interface CheckInUiState {
  sessionId: string;
  placeId: string;
  idempotencyKey: string;
  status: CheckInStatus;
  samples: { kind: GpsKind; accuracyMeters: number }[];
  photoAssetId: string | null;
  activeSeconds: number;
  issue: CheckInIssue;
  evidenceMode: "demo" | "integrated";
  demoEvidence: DemoEvidence;
}

export type CheckInAction =
  | { type: "sessionCreated"; sessionId: string }
  | { type: "gpsSample"; kind: GpsKind; accuracyMeters: number }
  | { type: "gpsAccuracy"; meters: number }
  | { type: "photoCaptured"; assetId: string }
  | { type: "dwellUpdated"; activeSeconds: number }
  | { type: "demoEvidenceCollected"; dwellMinutes: number }
  | { type: "setDemoEvidence"; field: "localSpendVerified" | "accommodationVerified"; value: boolean }
  | { type: "acceptDemoReview" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "submit" }
  | { type: "networkRetry" }
  | { type: "resolve"; decision: "pending" | "approved" | "review_required" | "rejected" }
  | { type: "issue"; issue: Exclude<CheckInIssue, null> }
  | { type: "expire" }
  | { type: "cancel" };

export function createInitialCheckInState(
  sessionId: string,
  placeId: string,
  idempotencyKey: string,
  evidenceMode: "demo" | "integrated" = "integrated",
): CheckInUiState {
  return {
    sessionId,
    placeId,
    idempotencyKey,
    status: "collecting",
    samples: [],
    photoAssetId: null,
    activeSeconds: 0,
    issue: null,
    evidenceMode,
    demoEvidence: {
      simulatedDwellMinutes: 0,
      localSpendVerified: false,
      accommodationVerified: false,
      reviewAccepted: false,
    },
  };
}

export function deriveCheckInProgress(state: CheckInUiState) {
  const gpsCount = new Set(state.samples.filter((sample) => sample.accuracyMeters <= 100).map((sample) => sample.kind)).size;
  const dwellPercent = Math.min(100, Math.round((state.activeSeconds / 300) * 100));
  const evidenceComplete = gpsCount === 3 && Boolean(state.photoAssetId);
  const reviewAccepted = state.evidenceMode === "integrated" || state.demoEvidence.reviewAccepted;
  return { gpsCount, dwellPercent, canSubmit: evidenceComplete && reviewAccepted };
}

function withReadiness(state: CheckInUiState): CheckInUiState {
  return deriveCheckInProgress(state).canSubmit ? { ...state, status: "ready_to_submit" } : state;
}

export function checkInReducer(state: CheckInUiState, action: CheckInAction): CheckInUiState {
  if (["submitted_pending", "approved", "review_required", "rejected", "expired", "cancelled"].includes(state.status)) return state;
  switch (action.type) {
    case "sessionCreated": return { ...state, sessionId: action.sessionId };
    case "gpsSample":
      if (state.status !== "collecting") return state;
      return withReadiness({ ...state, samples: [...state.samples.filter((sample) => sample.kind !== action.kind), { kind: action.kind, accuracyMeters: action.accuracyMeters }], issue: action.accuracyMeters > 100 ? "low_accuracy" : null });
    case "gpsAccuracy": return { ...state, issue: action.meters > 100 ? "low_accuracy" : null };
    case "photoCaptured": return state.status === "collecting" ? withReadiness({ ...state, photoAssetId: action.assetId, issue: null }) : state;
    case "dwellUpdated": return state.status === "collecting" ? withReadiness({ ...state, activeSeconds: Math.max(state.activeSeconds, action.activeSeconds) }) : state;
    case "demoEvidenceCollected":
      if (state.status !== "collecting" || state.evidenceMode !== "demo") return state;
      return {
        ...state,
        samples: [
          { kind: "start", accuracyMeters: 24 },
          { kind: "middle", accuracyMeters: 22 },
          { kind: "end", accuracyMeters: 20 },
        ],
        photoAssetId: "demo-photo",
        activeSeconds: action.dwellMinutes * 60,
        issue: null,
        demoEvidence: {
          ...state.demoEvidence,
          simulatedDwellMinutes: action.dwellMinutes,
          reviewAccepted: false,
        },
      };
    case "setDemoEvidence":
      if (state.status !== "collecting" || state.evidenceMode !== "demo") return state;
      return {
        ...state,
        demoEvidence: { ...state.demoEvidence, [action.field]: action.value, reviewAccepted: false },
      };
    case "acceptDemoReview":
      if (state.status !== "collecting" || state.evidenceMode !== "demo") return state;
      return withReadiness({ ...state, demoEvidence: { ...state.demoEvidence, reviewAccepted: true } });
    case "pause": return state.status === "collecting" ? { ...state, status: "paused" } : state;
    case "resume": return state.status === "paused" ? withReadiness({ ...state, status: "collecting" }) : state;
    case "submit": return state.status === "ready_to_submit" ? { ...state, status: "submitting", issue: null } : state;
    case "networkRetry": return state.status === "submitting" ? { ...state, issue: null } : state;
    case "resolve": return state.status === "submitting" ? { ...state, status: action.decision === "pending" ? "submitted_pending" : action.decision } : state;
    case "issue": return { ...state, issue: action.issue };
    case "expire": return { ...state, status: "expired" };
    case "cancel": return { ...state, status: "cancelled" };
  }
}
