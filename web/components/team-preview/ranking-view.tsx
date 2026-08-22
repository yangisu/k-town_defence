import { previewContent } from "@/features/team-preview/content";
import { rankFandoms } from "@/features/team-preview/game-rules";
import { t } from "@/features/team-preview/i18n";
import type { ArtistId, FandomStanding, Locale, PreviewTerritory } from "@/features/team-preview/types";

interface Props {
  locale: Locale;
  fandoms: FandomStanding[];
  territories: PreviewTerritory[];
  selectedArtistId: ArtistId | null;
}

const trendKeys = {
  up: "rankingTrendUp",
  down: "rankingTrendDown",
  same: "rankingTrendSame",
} as const;

function gapBetweenLeaders(territory: PreviewTerritory) {
  const points = territory.standings.map((standing) => standing.validPoints).sort((a, b) => b - a);
  return points.length > 1 ? Math.abs(points[0] - points[1]) : null;
}

function strongholdsToNextRank(fandoms: ReturnType<typeof rankFandoms>, selectedIndex: number) {
  if (selectedIndex <= 0) return null;
  const selected = fandoms[selectedIndex];
  const next = fandoms[selectedIndex - 1];
  const tieIsEnough = selected.validPoints > next.validPoints;
  return Math.max(1, next.strongholds - selected.strongholds + (tieIsEnough ? 0 : 1));
}

export function RankingView({ locale, fandoms, territories, selectedArtistId }: Props) {
  const ranked = rankFandoms(fandoms);
  const selectedIndex = ranked.findIndex((row) => row.artistId === selectedArtistId);
  const nextRankGap = strongholdsToNextRank(ranked, selectedIndex);
  const contested = territories
    .map((territory) => ({ territory, gap: gapBetweenLeaders(territory) }))
    .filter((entry): entry is { territory: PreviewTerritory; gap: number } => entry.gap !== null)
    .sort((a, b) => a.gap - b.gap || a.territory.name.ko.localeCompare(b.territory.name.ko, "ko"));

  return (
    <div className="view ranking-view">
      <h1>{t(locale, "navRanking")}</h1>
      {selectedIndex >= 0 ? (
        <section className="ranking-objective" aria-label={t(locale, "rankingNext")}>
          <span>{t(locale, "rankingNext")}</span>
          <strong>
            {nextRankGap === null
              ? t(locale, "rankingDefendingFirst")
              : locale === "ko"
                ? `거점 ${nextRankGap}${t(locale, "rankingStrongholdUnit")} ${t(locale, "rankingGainStrongholds")}`
                : `${nextRankGap} ${t(locale, "rankingGainStrongholds")}`}
          </strong>
        </section>
      ) : null}

      <ol className="ranking-list" aria-label={t(locale, "rankingTitle")}>
        {ranked.map((row) => {
          const artist = previewContent.artists.find((candidate) => candidate.id === row.artistId);
          const selected = row.artistId === selectedArtistId;
          return (
            <li key={row.artistId} className={selected ? "selected" : undefined} aria-current={selected ? "true" : undefined}>
              <strong>#{row.rank}</strong>
              <span>{artist?.artistName[locale] ?? row.artistId} · {row.fandomName}</span>
              {selected ? <span>{t(locale, "rankingSelected")}</span> : null}
              <span>{t(locale, "rankingStrongholds")} {row.strongholds}{t(locale, "rankingStrongholdUnit")}</span>
              <span>{row.validPoints.toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}P</span>
              <span>{t(locale, trendKeys[row.trend])}</span>
            </li>
          );
        })}
      </ol>

      <section className="contested-territories">
        <h2>{t(locale, "rankingContested")}</h2>
        <ol aria-label={t(locale, "rankingContested")}>
          {contested.map(({ territory, gap }) => (
            <li key={territory.id}>
              <strong>{territory.name[locale]}</strong> · {gap.toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}P {t(locale, "rankingPointGap")}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
