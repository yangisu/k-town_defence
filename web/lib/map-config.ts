export interface MapConfig {
  apiKey: string;
  region: string;
  styleName: string;
}

type MapEnvironment = Readonly<Record<string, string | undefined>>;

const awsRegionPattern = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;
const styleNamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * Reads only browser-safe Amazon Location settings. The resulting API key is
 * intentionally visible to the browser and must be restricted to map actions
 * plus the deployed Vercel origins/referrers in Amazon Location.
 */
export function readMapConfig(env: MapEnvironment): MapConfig | null {
  const apiKey = env.NEXT_PUBLIC_AWS_LOCATION_API_KEY?.trim();
  const region = env.NEXT_PUBLIC_AWS_LOCATION_REGION?.trim();
  const styleName = env.NEXT_PUBLIC_AWS_LOCATION_STYLE?.trim();

  if (!apiKey || !region || !styleName
    || /\s/.test(apiKey)
    || !awsRegionPattern.test(region)
    || !styleNamePattern.test(styleName)) return null;

  return { apiKey, region, styleName };
}

export function amazonLocationStyleUrl(config: MapConfig) {
  return `https://maps.geo.${config.region}.amazonaws.com/v2/styles/${encodeURIComponent(config.styleName)}/descriptor?key=${encodeURIComponent(config.apiKey)}`;
}
