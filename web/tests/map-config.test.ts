import { expect, it } from "vitest";
import { amazonLocationStyleUrl, FALLBACK_STYLE_URL, mapStyleUrl, readMapConfig } from "@/lib/map-config";

it("builds a restricted Amazon Location style descriptor URL", () => {
  const config = readMapConfig({
    NEXT_PUBLIC_AWS_LOCATION_API_KEY: "test-map-key",
    NEXT_PUBLIC_AWS_LOCATION_REGION: "ap-northeast-1",
    NEXT_PUBLIC_AWS_LOCATION_STYLE: "Standard",
  });

  expect(config).not.toBeNull();
  expect(amazonLocationStyleUrl(config!)).toBe(
    "https://maps.geo.ap-northeast-1.amazonaws.com/v2/styles/Standard/descriptor?key=test-map-key&color-scheme=Light",
  );
});

it("returns null when any required map value is missing or invalid", () => {
  expect(readMapConfig({ NEXT_PUBLIC_AWS_LOCATION_REGION: "ap-northeast-2" })).toBeNull();
  expect(readMapConfig({
    NEXT_PUBLIC_AWS_LOCATION_API_KEY: "key",
    NEXT_PUBLIC_AWS_LOCATION_REGION: "not a region",
    NEXT_PUBLIC_AWS_LOCATION_STYLE: "Standard",
  })).toBeNull();
  expect(readMapConfig({
    NEXT_PUBLIC_AWS_LOCATION_API_KEY: "   ",
    NEXT_PUBLIC_AWS_LOCATION_REGION: "ap-northeast-2",
    NEXT_PUBLIC_AWS_LOCATION_STYLE: "Standard",
  })).toBeNull();
});

it("offers keyless demo tiles only when a developer opts in", () => {
  // Without the opt-in a missing key still means "no map", so production
  // cannot silently fall back to tiles it does not own.
  expect(readMapConfig({})).toBeNull();

  const fallback = readMapConfig({ NEXT_PUBLIC_MAP_FALLBACK: "demo" });
  expect(fallback).not.toBeNull();
  expect(mapStyleUrl(fallback!)).toBe(FALLBACK_STYLE_URL);
});

it("prefers real Amazon Location keys over the fallback", () => {
  const config = readMapConfig({
    NEXT_PUBLIC_AWS_LOCATION_API_KEY: "test-map-key",
    NEXT_PUBLIC_AWS_LOCATION_REGION: "ap-northeast-1",
    NEXT_PUBLIC_AWS_LOCATION_STYLE: "Standard",
    NEXT_PUBLIC_MAP_FALLBACK: "demo",
  });

  expect(mapStyleUrl(config!)).toContain("maps.geo.ap-northeast-1.amazonaws.com");
});
