import { previewContent } from "@/features/team-preview/content";
import type { DemoSession } from "@/features/team-preview/demo-session";
import { t } from "@/features/team-preview/i18n";
import type { Locale, StrongholdStage } from "@/features/team-preview/types";
import { StrongholdMark } from "@/components/team-preview/stronghold-mark";

const stageOrder: Record<StrongholdStage, number> = { seed: 0, tree: 1, landmark: 2 };

const stageCopy = {
  ko: { seed: "씨앗", tree: "나무", landmark: "랜드마크" },
  en: { seed: "Seed", tree: "Tree", landmark: "Landmark" },
} as const;

function contributionRank(points: number) {
  return Math.max(1, 128 - Math.floor(points / 50));
}

export function RecordView({ locale, session }: { locale: Locale; session: DemoSession }) {
  const influencedTerritories = new Set(session.missionHistory.map((entry) => entry.territoryId));
  const highestStage = session.missionHistory.reduce(
    (highest, entry) => Math.max(highest, stageOrder[entry.strongholdStage]),
    -1,
  );
  const badges: { stage: StrongholdStage; label: "recordSeedBadge" | "recordTreeBadge" | "recordLandmarkBadge" }[] = [
    { stage: "seed", label: "recordSeedBadge" },
    { stage: "tree", label: "recordTreeBadge" },
    { stage: "landmark", label: "recordLandmarkBadge" },
  ];

  return (
    <div className="view record-view">
      <h1>{t(locale, "navRecord")}</h1>
      <dl className="record-summary">
        <div><dt>{t(locale, "recordCompleted")}</dt><dd>{session.completedMissionIds.length}</dd></div>
        <div><dt>{t(locale, "rankingPoints")}</dt><dd>{session.contributedToday.toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}P</dd></div>
        <div><dt>{t(locale, "recordContributionRank")}</dt><dd>#{contributionRank(session.contributedToday)}</dd></div>
        <div><dt>{t(locale, "recordTerritories")}</dt><dd>{influencedTerritories.size}</dd></div>
      </dl>

      <section className="record-history">
        <h2>{t(locale, "recordCheckIns")}</h2>
        <ol aria-label={t(locale, "recordCheckIns")}>
          {[...session.missionHistory].reverse().map((entry, index) => {
            const place = previewContent.places.find((candidate) => candidate.id === entry.missionId);
            const territory = session.territories.find((candidate) => candidate.id === entry.territoryId);
            return (
              <li key={`${entry.missionId}-${session.missionHistory.length - index}`}>
                <strong>{place?.name[locale] ?? entry.missionId}</strong>
                <span>{territory?.name[locale] ?? entry.territoryId}</span>
                <span>{entry.awardedPoints.toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}P</span>
                <span>{stageCopy[locale][entry.strongholdStage]} {t(locale, "recordStronghold")}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="record-rewards">
        <h2>{t(locale, "recordRewards")}</h2>
        <ul aria-label={t(locale, "recordRewards")}>
          {badges.map(({ stage, label }) => {
            const unlocked = stageOrder[stage] <= highestStage;
            return (
              <li key={stage}>
                <StrongholdMark stage={stage} locale={locale} />
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
