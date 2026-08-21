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
  { type: "dwellUpdated", activeSeconds: 300 },
];

describe("check-in reducer", () => {
  it("becomes ready only after three GPS kinds, photo, and 300 active seconds", () => {
    const collecting = createInitialCheckInState("session-1", "busan-white-cliff", "submit-1");
    const ready = readyActions.reduce(checkInReducer, collecting);
    expect(deriveCheckInProgress(ready)).toEqual({
      gpsCount: 3,
      dwellPercent: 100,
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
