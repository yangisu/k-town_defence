import { useState, type CSSProperties } from "react";
import { ChevronRight, Trophy } from "@/components/ui/icons";
import { StrongholdMark } from "@/components/team-preview/stronghold-mark";
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
  // Opening one board does not close another: a reader comparing two fandoms
  // wants both of them open at once.
  const [openFandomIds, setOpenFandomIds] = useState<readonly ArtistId[]>([]);
  const toggleFandom = (artistId: ArtistId) => setOpenFandomIds((current) => (
    current.includes(artistId) ? current.filter((id) => id !== artistId) : [...current, artistId]
  ));
  // Both lists are long, and on a phone they push each other off the screen.
  // The toggle only shows there; on a wide layout they sit side by side and
  // never need folding, so the class it sets does nothing.
  const [openSections, setOpenSections] = useState({ leaderboard: true, contested: true });
  const toggleSection = (key: "leaderboard" | "contested") =>
    setOpenSections((current) => ({ ...current, [key]: !current[key] }));
  const ranked = rankFandoms(fandoms);
  const selected = ranked.find((row) => row.artistId === selectedArtistId) ?? null;
  const goal = rankingGoal(ranked, selectedArtistId);
  const contested = territories
    .filter(isContestedTerritory)
    .map((territory) => {
      const owner = territory.standings.find((standing) => standing.artistId === territory.ownerArtistId) ?? territory.standings[0];
      const rivals = territory.standings
        .filter((standing) => standing.artistId !== territory.ownerArtistId)
        .sort((a, b) => b.validPoints - a.validPoints);
      // Whose board this is. Holding it, the row names whoever is closest
      // behind; chasing it, the row names the reader and the distance they
      // have to cover — a fandom with no points here still has a distance,
      // and showing the top rival instead made every board read as ARMY's.
      const holdsIt = territory.ownerArtistId === selectedArtistId;
      const mine = selectedArtistId
        ? territory.standings.find((standing) => standing.artistId === selectedArtistId)
          ?? { artistId: selectedArtistId, fandomName: artistFor(selectedArtistId)?.fandomName ?? "", validPoints: 0 }
        : null;
      const challenger = holdsIt || !mine ? rivals[0] : mine;
      const gap = holdsIt || !mine
        ? territoryGap(territory)
        : Math.max(owner.validPoints - mine.validPoints, 0);
      return { territory, owner, challenger, gap };
    })
    .filter((item): item is typeof item & { owner: NonNullable<typeof item.owner>; challenger: NonNullable<typeof item.challenger> } => (
      item.owner !== undefined && item.challenger !== undefined
    ))
    .sort((a, b) => a.gap - b.gap || a.territory.name.ko.localeCompare(b.territory.name.ko, "ko"));

  return (
    <div className="view ranking-view">
      <h1 className="preview-page-title">{t(locale, "navRanking")}</h1>

      <ol className="ranking-podium" aria-label={t(locale, "rankingPodium")}>
        {/* A podium, so the standing is read from the shape before the number:
            the name and its trophy ride on a plinth whose height is the place.
            The DOM stays in rank order for screen readers and phones; only the
            wide layout reorders it to 2–1–3. */}
        {ranked.slice(0, 3).map((row, index) => {
          const artist = artistFor(row.artistId);
          return (
            <li
              key={row.artistId}
              className={`ranking-podium-card place-${index + 1}`}
              style={{ "--artist-color": artist?.color ?? "var(--purple)" } as CSSProperties}
            >
              <div className="podium-crest">
                <strong><FandomIdentity locale={locale} artistId={row.artistId} fandomName={row.fandomName} /></strong>
                <Trophy size={index === 0 ? 30 : 24} strokeWidth={1.9} aria-hidden="true" />
              </div>
              {/* The numeral says the place; spelling it out beside itself was
                  the same fact twice, so the phrase moves to the label. */}
              {/* Strongholds, points and trend all repeat in the leaderboard
                  below. Up here the podium says one thing: who is first. */}
              <div className="podium-plinth" aria-label={t(locale, "fandomRankPosition").replace("{rank}", String(row.rank))}>
                <b>{row.rank}</b>
              </div>
            </li>
          );
        })}
      </ol>

      {selected && goal ? (
        <section className="ranking-goal" aria-label={`${t(locale, "myFandom")} · ${selected.fandomName}`}>
          <div>
            <span>{t(locale, "myFandom")} · {selected.fandomName}</span>
            {/* "Two more strongholds" is an instruction with no stake in it.
                Naming what it buys — a place in the ranking — is the point. */}
            {goal.kind === "defend_first"
              ? <strong>{t(locale, "rankingDefendingFirst")}</strong>
              : (
                // The condition and what meets it are one sentence, so they sit
                // in one block — the lime above is the fandom's name, and
                // sharing its colour made this read as part of that instead.
                <p className="ranking-goal-target">
                  <small>{t(locale, "rankingUntilRankChange")}</small>
                  <strong>
                    {locale === "ko"
                      ? `거점 ${goal.strongholdGap}${t(locale, "rankingStrongholdUnit")} ${t(locale, "rankingGainStrongholds")}`
                      : `${goal.strongholdGap} ${t(locale, "rankingGainStrongholds")}`}
                  </strong>
                </p>
              )}
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
        <section className={openSections.leaderboard ? "ranking-leaderboard-section" : "ranking-leaderboard-section folded"}>
          <button
            type="button"
            className="ranking-section-toggle"
            aria-expanded={openSections.leaderboard}
            aria-label={t(locale, openSections.leaderboard ? "rankingCollapseSection" : "rankingExpandSection")
              .replace("{section}", t(locale, "rankingTitle"))}
            onClick={() => toggleSection("leaderboard")}
          >
            <h2>{t(locale, "rankingTitle")}</h2>
            <ChevronRight size={18} strokeWidth={2.6} aria-hidden="true" />
          </button>
          <ol className="ranking-leaderboard" aria-label={t(locale, "rankingTitle")}>
            {ranked.map((row) => {
              const artist = artistFor(row.artistId);
              const isSelected = row.artistId === selectedArtistId;
              const open = openFandomIds.includes(row.artistId);
              const held = territories.filter((territory) => territory.ownerArtistId === row.artistId);
              return (
                <li key={row.artistId} className={isSelected ? "selected" : undefined} aria-current={isSelected ? "true" : undefined} style={{ "--artist-color": artist?.color ?? "var(--purple)" } as CSSProperties}>
                  {/* A count of strongholds says how many; a reader who follows
                      that fandom wants to know which. The row opens onto the
                      list rather than sending them elsewhere to find it. */}
                  <button
                    type="button"
                    className="ranking-row-open"
                    aria-expanded={open}
                    aria-label={t(locale, "rankingShowTerritories").replace("{fandom}", row.fandomName)}
                    onClick={() => toggleFandom(row.artistId)}
                  >
                    <span className="ranking-row-rank">#{row.rank}</span>
                    <span className="ranking-row-identity">
                      <strong><FandomIdentity locale={locale} artistId={row.artistId} fandomName={row.fandomName} /></strong>
                      {isSelected ? <span className="sr-only">{t(locale, "rankingSelected")}</span> : null}
                    </span>
                    <span className="ranking-row-stats">
                      <span>{formatPoints(locale, row.validPoints)}</span>
                      <span>{t(locale, trendKeys[row.trend])}</span>
                    </span>
                    {/* The bar measured a count against the largest holding,
                        which is not a number anyone plays toward. The count is
                        the fact; the row wears the fandom's colour instead. */}
                    <span className="ranking-row-strongholds">
                      {t(locale, "rankingStrongholds")} {row.strongholds}{t(locale, "rankingStrongholdUnit")}
                    </span>
                  </button>
                  {open ? (
                    <div className="ranking-row-held">
                      <h3>{t(locale, "rankingHeldTerritories")}</h3>
                      {held.length === 0 ? <p>{t(locale, "rankingNoTerritories")}</p> : (
                        <ul>
                          {held.map((territory) => (
                            <li key={territory.id}>
                              <StrongholdMark stage={territory.strongholdStage} locale={locale} ownerColor={artist?.color} />
                              <span>{territory.name[locale]}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>

        <section className={openSections.contested ? "contested-territories" : "contested-territories folded"}>
          <button
            type="button"
            className="ranking-section-toggle"
            aria-expanded={openSections.contested}
            aria-label={t(locale, openSections.contested ? "rankingCollapseSection" : "rankingExpandSection")
              .replace("{section}", t(locale, "rankingContested"))}
            onClick={() => toggleSection("contested")}
          >
            <h2>{t(locale, "rankingContested")}</h2>
            <ChevronRight size={18} strokeWidth={2.6} aria-hidden="true" />
          </button>
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
