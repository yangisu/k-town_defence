import { expect, it } from "vitest";
import { amazonLocationStyleUrl, readMapConfig } from "@/lib/map-config";

it("builds a restricted Amazon Location style descriptor URL", () => {
  const config = readMapConfig({
    NEXT_PUBLIC_AWS_LOCATION_API_KEY: "test-map-key",
    NEXT_PUBLIC_AWS_LOCATION_REGION: "ap-northeast-2",
    NEXT_PUBLIC_AWS_LOCATION_STYLE: "Standard",
  });

  expect(config).not.toBeNull();
  expect(amazonLocationStyleUrl(config!)).toBe(
    "https://maps.geo.ap-northeast-2.amazonaws.com/v2/styles/Standard/descriptor?key=test-map-key",
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
