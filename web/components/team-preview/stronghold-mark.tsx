import type { Locale, StrongholdStage } from "@/features/team-preview/types";
import type { CSSProperties } from "react";

const labels = {
  ko: { seed: "씨앗", tree: "나무", landmark: "랜드마크", stronghold: "거점" },
  en: { seed: "Seed", tree: "Tree", landmark: "Landmark", stronghold: "stronghold" },
} as const;

const markerSizes = { seed: 14, tree: 22, landmark: 32 } as const;

export function StrongholdMark({ stage, locale, ownerColor }: { stage: StrongholdStage; locale: Locale; ownerColor?: string }) {
  const label = labels[locale][stage];
  const markerStyle = { "--marker-size": `${markerSizes[stage]}px` } as CSSProperties;
  return (
    <span className={`stronghold-mark stronghold-mark--${stage}`} role="img" aria-label={`${label} ${labels[locale].stronghold}`} style={ownerColor ? { "--owner-color": ownerColor } as CSSProperties : undefined}>
      <span className="stronghold-silhouette" aria-hidden="true" style={markerStyle} />
      <span>{label}</span>
    </span>
  );
}
