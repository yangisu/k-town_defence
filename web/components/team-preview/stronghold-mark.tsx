import type { Locale, StrongholdStage } from "@/features/team-preview/types";

const labels = {
  ko: { seed: "씨앗", tree: "나무", landmark: "랜드마크", stronghold: "거점" },
  en: { seed: "Seed", tree: "Tree", landmark: "Landmark", stronghold: "stronghold" },
} as const;

export function StrongholdMark({ stage, locale }: { stage: StrongholdStage; locale: Locale }) {
  const label = labels[locale][stage];
  return (
    <span className={`stronghold-mark stronghold-mark--${stage}`} role="img" aria-label={`${label} ${labels[locale].stronghold}`}>
      <span className={`stronghold-silhouette stronghold-silhouette--${stage}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
