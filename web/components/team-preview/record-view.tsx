import { StrongholdMark } from "@/components/team-preview/stronghold-mark";
import { previewContent } from "@/features/team-preview/content";
import type { DemoSession } from "@/features/team-preview/demo-session";
import { t } from "@/features/team-preview/i18n";
import type { Locale, StrongholdStage } from "@/features/team-preview/types";

const stageOrder: Record<StrongholdStage, number> = { seed: 0, tree: 1, landmark: 2 };
const stages: StrongholdStage[] = ["seed", "tree", "landmark"];

const stageCopy = {
  ko: { seed: "씨앗", tree: "나무", landmark: "랜드마크" },
  en: { seed: "Seed", tree: "Tree", landmark: "Landmark" },
} as const;

const rewards: { stage: StrongholdStage; label: "recordSeedBadge" | "recordTreeBadge" | "recordLandmarkBadge" }[] = [
  { stage: "seed", label: "recordSeedBadge" },
  { stage: "tree", label: "recordTreeBadge" },
  { stage: "landmark", label: "recordLandmarkBadge" },
];

export function contributionRank(points: number) {
  return Math.max(1, 128 - Math.floor(points / 50));
}

function recordSummary(session: DemoSession) {
  const approvedCheckIns = session.approvedCheckIns.map((entry, index) => ({ entry, index }));
  const points = approvedCheckIns.reduce((total, { entry }) => total + entry.awardedPoints, 0);
  const highestStageOrder = approvedCheckIns.reduce(
    (highest, { entry }) => Math.max(highest, stageOrder[entry.strongholdStage]),
    -1,
  );
  return {
    approvedCheckIns,
    points,
    influencedTerritories: new Set(approvedCheckIns.map(({ entry }) => entry.territoryId)).size,
    highestStageOrder,
    timeline: [...approvedCheckIns].sort((left, right) => right.index - left.index),
  };
}

export function RecordView({
  locale,
  session,
  onExploreTerritories,
}: {
  locale: Locale;
  session: DemoSession;
  onExploreTerritories: () => void;
}) {
  const summary = recordSummary(session);
  const artist = previewContent.artists.find((candidate) => candidate.id === session.selectedArtistId);
  const highestStage = summary.highestStageOrder >= 0 ? stages[summary.highestStageOrder] : null;
  const formatPoints = (points: number) => `${points.toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}P`;

  return (
    <div className="view record-view">
      <h1>{t(locale, "navRecord")}</h1>
      <section className="record-season-summary" aria-label={t(locale, "recordSeasonSummary")}>
        <div className="record-season-hero">
          <span>{t(locale, "recordSeasonSummary")}</span>
          <small>{t(locale, "recordContributionPoints")}</small>
          <strong>{formatPoints(summary.points)}</strong>
          <p>{t(locale, "recordContributionRank")} <b>#{contributionRank(summary.points)}</b></p>
        </div>
        <dl className="record-summary" aria-label={t(locale, "recordSeasonSummary")}>
          <div><dt>{t(locale, "recordCompleted")}</dt><dd>{session.completedExpeditionIds.length}</dd></div>
          <div><dt>{t(locale, "recordCheckIns")}</dt><dd>{summary.approvedCheckIns.length}</dd></div>
          <div><dt>{t(locale, "recordTerritories")}</dt><dd>{summary.influencedTerritories}</dd></div>
          <div><dt>{t(locale, "recordHighestStage")}</dt><dd>{highestStage ? `${stageCopy[locale][highestStage]} ${t(locale, "recordStronghold")}` : "—"}</dd></div>
        </dl>
      </section>

      {summary.approvedCheckIns.length === 0 ? (
        <section className="record-empty">
          <h2>{t(locale, "recordEmptyTitle")}</h2>
          <p>{t(locale, "recordEmptyDescription")}</p>
          <button type="button" onClick={onExploreTerritories}>{t(locale, "recordExploreTerritories")}</button>
        </section>
      ) : null}

      <section className="record-growth">
        <h2>{t(locale, "recordGrowth")}</h2>
        <ol aria-label={t(locale, "recordGrowth")}>
          {stages.map((stage) => {
            const unlocked = stageOrder[stage] <= summary.highestStageOrder;
            return (
              <li key={stage} className={unlocked ? "unlocked" : "locked"}>
                <StrongholdMark stage={stage} locale={locale} ownerColor={artist?.color} />
                <span>{t(locale, unlocked ? "recordUnlocked" : "recordLocked")}</span>
              </li>
            );
          })}
        </ol>
      </section>

      {summary.approvedCheckIns.length > 0 ? (
        <section className="record-history">
          <h2>{t(locale, "recordTimeline")}</h2>
          <ol aria-label={t(locale, "recordTimeline")}>
            {summary.timeline.map(({ entry, index }) => {
              const place = previewContent.places.find((candidate) => candidate.id === entry.placeId);
              const territory = session.territories.find((candidate) => candidate.id === entry.territoryId);
              return (
                <li key={`${entry.expeditionId}-${entry.placeId}-${index}`}>
                  <strong>{place?.name[locale] ?? entry.placeId}</strong>
                  <span>{territory?.name[locale] ?? entry.territoryId}</span>
                  <span>{formatPoints(entry.awardedPoints)}</span>
                  <span>{stageCopy[locale][entry.strongholdStage]} {t(locale, "recordStronghold")}</span>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <section className="record-rewards">
        <h2>{t(locale, "recordRewards")}</h2>
        <ul aria-label={t(locale, "recordRewards")}>
          {rewards.map(({ stage, label }) => {
            const unlocked = stageOrder[stage] <= summary.highestStageOrder;
            return (
              <li key={stage} className={unlocked ? "unlocked" : "locked"}>
                <StrongholdMark stage={stage} locale={locale} ownerColor={artist?.color} />
                <span>{t(locale, label)} · {t(locale, unlocked ? "recordUnlocked" : "recordLocked")}</span>
              </li>
            );
          })}
        </ul>
        <button type="button" disabled>{t(locale, "recordCharacterFuture")}</button>
      </section>
    </div>
  );
}
