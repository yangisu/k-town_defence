import type { GpsEvidence } from "./domain";

export type BrowserEvidenceCode = "location_denied" | "location_timeout" | "location_unavailable";

export class BrowserEvidenceError extends Error {
  constructor(public readonly code: BrowserEvidenceCode) { super(code); }
}

export async function collectGpsSamples(geolocation: Geolocation | undefined, count = 3): Promise<GpsEvidence[]> {
  if (!geolocation) throw new BrowserEvidenceError("location_unavailable");
  const samples: GpsEvidence[] = [];
  for (let sequence = 1; sequence <= count; sequence += 1) {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      geolocation.getCurrentPosition(resolve, (error) => {
        const code = error.code === 1 ? "location_denied" : error.code === 3 ? "location_timeout" : "location_unavailable";
        reject(new BrowserEvidenceError(code));
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 });
    });
    samples.push({ sequence, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy, capturedAt: new Date(position.timestamp).toISOString() });
  }
  return samples;
}
