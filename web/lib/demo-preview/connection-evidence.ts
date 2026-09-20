import type { ContentSource, SourceReliability } from "@/features/team-preview/types";

/**
 * Publishers that speak for themselves about the claim: a city hall writing
 * about its own ambassador, a tourism office about its own route, a label
 * about its own artist. Anything else is press, which we trust but do not
 * treat as the primary record.
 */
const AUTHORITATIVE_HOSTS = new Set([
  "www.busan.go.kr",
  "www.suwon.go.kr",
  "news.suwon.go.kr",
  "english.seoul.go.kr",
  "english.visitseoul.net",
  "english.visitkorea.or.kr",
  "culture.seoul.go.kr",
  "bomnae.chuncheon.go.kr",
  "www.korea.net",
  "weverse.io",
  "mbcinfo.imbc.com",
]);

/**
 * A person-profile aggregator. The research document itself flags this as a
 * supporting reference rather than reporting, so it is never enough on its own.
 */
const TEAM_INPUT_HOSTS = new Set(["www.sapiens.inc"]);

export function reliabilityOf(hostname: string): SourceReliability {
  if (AUTHORITATIVE_HOSTS.has(hostname)) return "authoritative";
  if (TEAM_INPUT_HOSTS.has(hostname)) return "team_input";
  return "reliable_public";
}

/** Every source here is chosen for this one claim, so all are claim-specific. */
export function connectionSource(url: string): ContentSource {
  const hostname = new URL(url).hostname;
  return {
    id: `connection-source-${hostname.replaceAll(".", "-")}-${hashUrl(url)}`,
    url,
    publisher: hostname,
    reliability: reliabilityOf(hostname),
    claimSpecific: true,
  };
}

/** Enough to keep two articles from the same publisher apart in a key. */
function hashUrl(url: string) {
  let hash = 0;
  for (const character of url) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return Math.abs(hash).toString(36);
}

/**
 * The class a set of sources earns, never the class we would like it to have.
 * One official record settles it; otherwise two independent press reports do;
 * a lone article or a profile page stays a research lead.
 */
export function evidenceClassOf(sources: readonly ContentSource[]) {
  if (sources.some((source) => source.reliability === "authoritative")) return "official" as const;
  const press = sources.filter((source) => source.reliability === "reliable_public");
  return press.length >= 2 && new Set(press.map((source) => source.publisher)).size >= 2
    ? ("verified" as const)
    : ("team_data" as const);
}
