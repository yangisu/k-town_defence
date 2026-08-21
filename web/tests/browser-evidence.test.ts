import { expect, it } from "vitest";
import { BrowserEvidenceError, collectGpsSamples } from "@/lib/browser-evidence";

function geolocation(code?: number): Geolocation {
  let value = 0;
  return {
    getCurrentPosition(success, failure) {
      if (code) {
        failure?.({ code, message: "raw browser message", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
        return;
      }
      value += 1;
      success({ coords: { latitude: 35.1 + value / 100, longitude: 129, accuracy: 20 + value } as GeolocationCoordinates, timestamp: 1_777_000_000_000 + value });
    },
    watchPosition() { return 0; },
    clearWatch() {},
  };
}

it("collects three real positions in order", async () => {
  const samples = await collectGpsSamples(geolocation(), 3);

  expect(samples.map((sample) => sample.sequence)).toEqual([1, 2, 3]);
  expect(samples[0]).toMatchObject({ latitude: 35.11, longitude: 129, accuracyMeters: 21 });
});

it("classifies permission denial without exposing the browser message", async () => {
  await expect(collectGpsSamples(geolocation(1), 3)).rejects.toEqual(
    new BrowserEvidenceError("location_denied"),
  );
});
