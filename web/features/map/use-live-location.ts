"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type LiveLocationStatus = "idle" | "locating" | "active" | "denied" | "unavailable";

export type LiveLocationPosition = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

const EARTH_RADIUS_M = 6_371_000;
const DEFAULT_MIN_MOVE_METERS = 15;

/** Same haversine shape as territory-summary.ts, in meters instead of km. */
function haversineDistanceMeters(a: LiveLocationPosition, b: LiveLocationPosition): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const latitudeA = radians(a.latitude);
  const latitudeB = radians(b.latitude);
  const chord = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(chord), Math.sqrt(1 - chord));
}

/**
 * Client-only, presentation-only live position. Never sent over the network
 * and never substituted for the check-in evidence GPS samples collected by
 * `collectGpsSamples` in `lib/browser-evidence.ts` — that pipeline alone
 * decides territory points.
 */
export function useLiveLocation(options?: { minMoveMeters?: number }): {
  position: LiveLocationPosition | null;
  status: LiveLocationStatus;
  requestPermission: () => void;
} {
  const minMoveMeters = options?.minMoveMeters ?? DEFAULT_MIN_MOVE_METERS;
  const [position, setPosition] = useState<LiveLocationPosition | null>(null);
  const [status, setStatus] = useState<LiveLocationStatus>("idle");
  const watchIdRef = useRef<number | null>(null);
  const lastPositionRef = useRef<LiveLocationPosition | null>(null);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => clearWatch, [clearWatch]);

  const requestPermission = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    clearWatch();
    setStatus("locating");
    watchIdRef.current = navigator.geolocation.watchPosition(
      (result) => {
        const next: LiveLocationPosition = {
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
          accuracyMeters: result.coords.accuracy,
        };
        const previous = lastPositionRef.current;
        if (previous && haversineDistanceMeters(previous, next) < minMoveMeters) return;
        lastPositionRef.current = next;
        setPosition(next);
        setStatus("active");
      },
      (error) => {
        setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 0 },
    );
  }, [clearWatch, minMoveMeters]);

  return { position, status, requestPermission };
}
