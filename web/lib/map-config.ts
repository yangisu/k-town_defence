export interface MapConfig {
  apiKey: string;
  region: string;
  styleName: string;
  /** Set when the map draws from a plain style URL instead of Amazon Location. */
  styleUrl?: string;
}

/**
 * MapLibre's own demo tiles: keyless, meant for exactly this, and enough to
 * work on the surrounding UI. Coarse at city zoom, so it is a local stand-in
 * for the Amazon Location style, never a production style.
 */
export const FALLBACK_STYLE_URL = "https://demotiles.maplibre.org/style.json";

type MapEnvironment = Readonly<Record<string, string | undefined>>;

const awsRegionPattern = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;
const styleNamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * Reads only browser-safe Amazon Location settings. The resulting API key is
 * intentionally visible to the browser and must be restricted to map actions
 * plus the deployed production origins/referrers in Amazon Location.
 */
export function readMapConfig(env: MapEnvironment): MapConfig | null {
  const apiKey = env.NEXT_PUBLIC_AWS_LOCATION_API_KEY?.trim();
  const region = env.NEXT_PUBLIC_AWS_LOCATION_REGION?.trim();
  const styleName = env.NEXT_PUBLIC_AWS_LOCATION_STYLE?.trim();

  if (!apiKey || !region || !styleName
    || /\s/.test(apiKey)
    || !awsRegionPattern.test(region)
    || !styleNamePattern.test(styleName)) return fallbackMapConfig(env);

  return { apiKey, region, styleName };
}

/**
 * Without Amazon Location keys the map area shows a configuration notice, which
 * makes every control on the map unreachable locally. Opt into keyless demo
 * tiles with NEXT_PUBLIC_MAP_FALLBACK=demo so the UI can be worked on offline.
 */
function fallbackMapConfig(env: MapEnvironment): MapConfig | null {
  if (env.NEXT_PUBLIC_MAP_FALLBACK?.trim() !== "demo") return null;
  return { apiKey: "", region: "", styleName: "Demo", styleUrl: FALLBACK_STYLE_URL };
}

export function mapStyleUrl(config: MapConfig) {
  return config.styleUrl ?? amazonLocationStyleUrl(config);
}

export function amazonLocationStyleUrl(config: MapConfig) {
  const params = new URLSearchParams({
    key: config.apiKey,
    "color-scheme": "Light",
  });
  return `https://maps.geo.${config.region}.amazonaws.com/v2/styles/${encodeURIComponent(config.styleName)}/descriptor?${params}`;
}
