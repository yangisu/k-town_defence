import type { CSSProperties } from "react";
import { previewContent } from "@/features/team-preview/content";
import { rankFandoms } from "@/features/team-preview/game-rules";
import { t } from "@/features/team-preview/i18n";
import { isContestedTerritory, territoryGap } from "@/features/team-preview/territory-rules";
import type { ArtistId, FandomStanding, Locale, PreviewTerritory, TerritoryId } from "@/features/team-preview/types";

interface Props {
  locale: Locale;
  fandoms: FandomStanding[];
  territories: PreviewTerritory[];
  selectedArtistId: ArtistId | null;
  onInspectTerritory(territoryId: TerritoryId): void;
}

type RankingGoal =
  | { kind: "defend_first"; progress: 1 }
  | { kind: "advance"; targetStrongholds: number; strongholdGap: number; progress: number }
  | null;

const trendKeys = {
  up: "rankingTrendUp",
  down: "rankingTrendDown",
  same: "rankingTrendSame",
} as const;

function artistFor(artistId: ArtistId) {
  return previewContent.artists.find((candidate) => candidate.id === artistId);
}

function formatPoints(locale: Locale, points: number) {
  return `${points.toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}P`;
}

function interpolate(copy: string, value: string) {
  return copy.replace("{territory}", value);
}

export function rankingGoal(ranked: ReturnType<typeof rankFandoms>, selectedArtistId: ArtistId | null): RankingGoal {
  const selectedIndex = ranked.findIndex((row) => row.artistId === selectedArtistId);
  if (selectedIndex < 0) return null;
  if (selectedIndex === 0) return { kind: "defend_first", progress: 1 };

  const selected = ranked[selectedIndex];
  const next = ranked[selectedIndex - 1];
  const targetStrongholds = next.strongholds + (selected.validPoints > next.validPoints ? 0 : 1);
  const strongholdGap = Math.max(targetStrongholds - selected.strongholds, 0);
  return {
    kind: "advance",
    targetStrongholds,
    strongholdGap,
    progress: Math.max(0, Math.min(selected.strongholds / Math.max(targetStrongholds, 1), 1)),
  };
}

function FandomIdentity({ locale, artistId, fandomName }: { locale: Locale; artistId: ArtistId; fandomName: string }) {
  const artist = artistFor(artistId);
  return <>{artist?.artistName[locale] ?? artistId} · {fandomName}</>;
}

export function RankingView({ locale, fandoms, territories, selectedArtistId, onInspectTerritory }: Props) {
  const ranked = rankFandoms(fandoms);
  const selected = ranked.find((row) => row.artistId === selectedArtistId) ?? null;
  const goal = rankingGoal(ranked, selectedArtistId);
  const maximumStrongholds = Math.max(...ranked.map((row) => row.strongholds), 1);
  const contested = territories
    .filter(isContestedTerritory)
    .map((territory) => {
      const owner = territory.standings.find((standing) => standing.artistId === territory.ownerArtistId) ?? territory.standings[0];
      const challenger = territory.standings
        .filter((standing) => standing.artistId !== territory.ownerArtistId)
        .sort((a, b) => b.validPoints - a.validPoints)[0];
      return { territory, owner, challenger, gap: territoryGap(territory) };
    })
    .filter((item): item is typeof item & { owner: NonNullable<typeof item.owner>; challenger: NonNullable<typeof item.challenger> } => (
      item.owner !== undefined && item.challenger !== undefined
    ))
    .sort((a, b) => a.gap - b.gap || a.territory.name.ko.localeCompare(b.territory.name.ko, "ko"));

  return (
    <div className="view ranking-view">
      <header className="ranking-heading">
        <p>{t(locale, "fandomRank")}</p>
        <h1>{t(locale, "navRanking")}</h1>
      </header>

      <ol className="ranking-podium" aria-label={t(locale, "rankingPodium")}>
        {ranked.slice(0, 3).map((row) => {
          const artist = artistFor(row.artistId);
          return (
            <li key={row.artistId} className="ranking-podium-card" style={{ "--artist-color": artist?.color ?? "var(--purple)" } as CSSProperties}>
              <span className="ranking-rank">{t(locale, "fandomRankPosition").replace("{rank}", String(row.rank))}</span>
              <strong><FandomIdentity locale={locale} artistId={row.artistId} fandomName={row.fandomName} /></strong>
              <span className="ranking-card-fandom-color" aria-label={`${row.fandomName} color`} />
              <dl>
                <div><dt>{t(locale, "rankingStrongholds")}</dt><dd>{row.strongholds}{t(locale, "rankingStrongholdUnit")}</dd></div>
                <div><dt>{t(locale, "rankingPoints")}</dt><dd>{formatPoints(locale, row.validPoints)}</dd></div>
                <div><dt>{t(locale, "fandomRank")}</dt><dd>{t(locale, trendKeys[row.trend])}</dd></div>
              </dl>
            </li>
          );
        })}
      </ol>

      {selected && goal ? (
        <section className="ranking-goal" aria-label={`${t(locale, "myFandom")} · ${selected.fandomName}`}>
          <div>
            <span>{t(locale, "myFandom")} · {selected.fandomName}</span>
            <strong>
              {goal.kind === "defend_first"
                ? t(locale, "rankingDefendingFirst")
                : locale === "ko"
                  ? `거점 ${goal.strongholdGap}${t(locale, "rankingStrongholdUnit")} ${t(locale, "rankingGainStrongholds")}`
                  : `${goal.strongholdGap} ${t(locale, "rankingGainStrongholds")}`}
            </strong>
          </div>
          <progress
            aria-label={t(locale, "rankingGoalProgress")}
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={goal.progress}
            value={goal.progress}
            max={1}
          />
        </section>
      ) : null}

      <div className="ranking-dashboard-grid">
        <section className="ranking-leaderboard-section">
          <h2>{t(locale, "rankingTitle")}</h2>
          <ol className="ranking-leaderboard" aria-label={t(locale, "rankingTitle")}>
            {ranked.map((row) => {
              const artist = artistFor(row.artistId);
              const isSelected = row.artistId === selectedArtistId;
              return (
                <li key={row.artistId} className={isSelected ? "selected" : undefined} aria-current={isSelected ? "true" : undefined} style={{ "--artist-color": artist?.color ?? "var(--purple)" } as CSSProperties}>
                  <span className="ranking-row-rank">#{row.rank}</span>
                  <div className="ranking-row-identity">
                    <strong><FandomIdentity locale={locale} artistId={row.artistId} fandomName={row.fandomName} /></strong>
                    {isSelected ? <span>{t(locale, "rankingSelected")}</span> : null}
                  </div>
                  <div className="ranking-row-stats">
                    <span>{formatPoints(locale, row.validPoints)}</span>
                    <span>{t(locale, trendKeys[row.trend])}</span>
                  </div>
                  <div className="ranking-stronghold-bar">
                    <span>{t(locale, "rankingStrongholds")} {row.strongholds}{t(locale, "rankingStrongholdUnit")}</span>
                    <progress aria-label={`${t(locale, "rankingStrongholds")}: ${row.fandomName}`} aria-valuemin={0} aria-valuemax={maximumStrongholds} aria-valuenow={row.strongholds} value={row.strongholds} max={maximumStrongholds} />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="contested-territories">
          <h2>{t(locale, "rankingContested")}</h2>
          <ol aria-label={t(locale, "rankingContested")}>
            {contested.map(({ territory, owner, challenger, gap }) => (
              <li key={territory.id}>
                <button type="button" onClick={() => onInspectTerritory(territory.id)} aria-label={interpolate(t(locale, "rankingInspectTerritory"), territory.name[locale])}>
                  <strong>{territory.name[locale]}</strong>
                  <span>{t(locale, "rankingOwner")}: <FandomIdentity locale={locale} artistId={owner.artistId} fandomName={owner.fandomName} /></span>
                  <span>{t(locale, "rankingChallenger")}: <FandomIdentity locale={locale} artistId={challenger.artistId} fandomName={challenger.fandomName} /></span>
                  <span>{formatPoints(locale, gap)} {t(locale, "rankingPointGap")}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
