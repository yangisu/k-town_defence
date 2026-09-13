import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useLiveLocation } from "@/features/map/use-live-location";

type Success = (position: GeolocationPosition) => void;
type Failure = (error: GeolocationPositionError) => void;

function mockGeolocation({ deny = false }: { deny?: boolean } = {}) {
  const clearWatch = vi.fn();
  let successCallback: Success | null = null;
  let failureCallback: Failure | null = null;

  const geolocation: Geolocation = {
    getCurrentPosition: vi.fn(),
    watchPosition: vi.fn((success: Success, failure?: Failure) => {
      successCallback = success;
      failureCallback = failure ?? null;
      if (deny) {
        failureCallback?.({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
      }
      return 42;
    }),
    clearWatch,
  };
  Object.defineProperty(globalThis, "navigator", {
    value: { ...globalThis.navigator, geolocation },
    configurable: true,
  });

  return {
    clearWatch,
    emitPosition: (latitude: number, longitude: number, accuracy = 20) => {
      successCallback?.({ coords: { latitude, longitude, accuracy } as GeolocationCoordinates, timestamp: Date.now() });
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

it("denied permission yields status 'denied' and no crash", () => {
  mockGeolocation({ deny: true });
  const { result } = renderHook(() => useLiveLocation());

  act(() => result.current.requestPermission());

  expect(result.current.status).toBe("denied");
  expect(result.current.position).toBeNull();
});

it("unavailable geolocation yields status 'unavailable'", () => {
  Object.defineProperty(globalThis, "navigator", {
    value: { ...globalThis.navigator, geolocation: undefined },
    configurable: true,
  });
  const { result } = renderHook(() => useLiveLocation());

  act(() => result.current.requestPermission());

  expect(result.current.status).toBe("unavailable");
});

it("accepts the first position and reports status 'active'", () => {
  const { emitPosition } = mockGeolocation();
  const { result } = renderHook(() => useLiveLocation());

  act(() => result.current.requestPermission());
  act(() => emitPosition(37.5665, 126.978));

  expect(result.current.status).toBe("active");
  expect(result.current.position).toEqual({ latitude: 37.5665, longitude: 126.978, accuracyMeters: 20 });
});

it("a move under minMoveMeters does not update position", () => {
  const { emitPosition } = mockGeolocation();
  const { result } = renderHook(() => useLiveLocation({ minMoveMeters: 25 }));

  act(() => result.current.requestPermission());
  act(() => emitPosition(37.5665, 126.9780));
  const firstPosition = result.current.position;
  act(() => emitPosition(37.56651, 126.97801)); // ~1m away

  expect(result.current.position).toEqual(firstPosition);
});

it("a move past minMoveMeters does update position", () => {
  const { emitPosition } = mockGeolocation();
  const { result } = renderHook(() => useLiveLocation({ minMoveMeters: 25 }));

  act(() => result.current.requestPermission());
  act(() => emitPosition(37.5665, 126.978));
  const firstPosition = result.current.position;
  act(() => emitPosition(37.5675, 126.979)); // well over 25m away

  expect(result.current.position).not.toEqual(firstPosition);
});

it("unmount clears the watch", () => {
  const { clearWatch } = mockGeolocation();
  const { result, unmount } = renderHook(() => useLiveLocation());
  act(() => result.current.requestPermission());

  unmount();

  expect(clearWatch).toHaveBeenCalledWith(42);
});
