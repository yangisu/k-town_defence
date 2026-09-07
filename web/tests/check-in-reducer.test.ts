import { describe, expect, it } from "vitest";
import {
  checkInReducer,
  createInitialCheckInState,
  deriveCheckInProgress,
  type CheckInAction,
} from "@/components/check-in/check-in-reducer";

const readyActions: CheckInAction[] = [
  { type: "gpsSample", kind: "start", accuracyMeters: 24 },
  { type: "gpsSample", kind: "middle", accuracyMeters: 22 },
  { type: "gpsSample", kind: "end", accuracyMeters: 20 },
  { type: "photoCaptured", assetId: "photo-1" },
];

describe("check-in reducer", () => {
  it("becomes ready after three GPS kinds and a photo", () => {
    const collecting = createInitialCheckInState("session-1", "busan-white-cliff", "submit-1");
    const ready = readyActions.reduce(checkInReducer, collecting);
    expect(deriveCheckInProgress(ready)).toEqual({
      gpsCount: 3,
      dwellPercent: 0,
      canSubmit: true,
    });
    expect(ready.status).toBe("ready_to_submit");
  });

  it("keeps one submission key across a network retry", () => {
    const collecting = createInitialCheckInState("session-1", "busan-white-cliff", "submit-1");
    const ready = readyActions.reduce(checkInReducer, collecting);
    const first = checkInReducer(ready, { type: "submit" });
    const retry = checkInReducer(first, { type: "networkRetry" });
    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
  });

  it("requires an explicit demo evidence action before submission", () => {
    const collecting = createInitialCheckInState("session-1", "busan-1", "submit-1", "demo");

    expect(deriveCheckInProgress(collecting).canSubmit).toBe(false);

    const evidenced = checkInReducer(collecting, { type: "demoEvidenceCollected", dwellMinutes: 45 });

    expect(evidenced.demoEvidence).toEqual({
      simulatedDwellMinutes: 45,
      localSpendVerified: false,
      accommodationVerified: false,
    });
    expect(evidenced.samples.map((sample) => sample.kind)).toEqual(["start", "middle", "end"]);
    expect(evidenced.photoAssetId).toBe("demo-photo");
    expect(deriveCheckInProgress(evidenced).canSubmit).toBe(true);
    expect(evidenced.status).toBe("ready_to_submit");
  });

  it("keeps a submission ready when an optional proof changes", () => {
    const collecting = createInitialCheckInState("session-1", "busan-1", "submit-1", "demo");
    const evidenced = checkInReducer(collecting, { type: "demoEvidenceCollected", dwellMinutes: 45 });
    const edited = checkInReducer(evidenced, {
      type: "setDemoEvidence",
      field: "accommodationVerified",
      value: true,
    });

    expect(edited.demoEvidence.accommodationVerified).toBe(true);
    expect(deriveCheckInProgress(edited).canSubmit).toBe(true);
    expect(edited.status).toBe("ready_to_submit");
  });

  it("retains all demo evidence while retrying a failed submission", () => {
    const collecting = createInitialCheckInState("session-1", "busan-1", "submit-1", "demo");
    const evidenced = checkInReducer(collecting, { type: "demoEvidenceCollected", dwellMinutes: 45 });
    const reviewed = checkInReducer(evidenced, { type: "setDemoEvidence", field: "localSpendVerified", value: true });
    const submitting = checkInReducer(reviewed, { type: "submit" });
    const failed = checkInReducer(submitting, { type: "issue", issue: "network_failed" });
    const retry = checkInReducer(failed, { type: "networkRetry" });

    expect(retry.idempotencyKey).toBe("submit-1");
    expect(retry.samples).toEqual(reviewed.samples);
    expect(retry.photoAssetId).toBe("demo-photo");
    expect(retry.demoEvidence).toEqual(reviewed.demoEvidence);
  });

  it("preserves evidence while paused and terminates on expiry", () => {
    const collecting = createInitialCheckInState("session-1", "busan-white-cliff", "submit-1");
    const sampled = checkInReducer(collecting, {
      type: "gpsSample",
      kind: "start",
      accuracyMeters: 24,
    });
    const paused = checkInReducer(sampled, { type: "pause" });
    expect(paused.status).toBe("paused");
    expect(paused.samples).toHaveLength(1);
    expect(checkInReducer(paused, { type: "expire" }).status).toBe("expired");
  });

  it("reports low GPS accuracy without discarding the session", () => {
    const collecting = createInitialCheckInState("session-1", "busan-white-cliff", "submit-1");
    expect(
      checkInReducer(collecting, { type: "gpsAccuracy", meters: 124 }).issue,
    ).toBe("low_accuracy");
  });
});
