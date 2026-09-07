import type { Locale, StrongholdStage } from "@/features/team-preview/types";
import type { CSSProperties, ReactNode } from "react";

const labels = {
  ko: { seed: "씨앗", tree: "나무", landmark: "랜드마크", stronghold: "거점" },
  en: { seed: "Seed", tree: "Tree", landmark: "Landmark", stronghold: "stronghold" },
} as const;

// One size for every stage: the drawing and the label carry the difference.
const MARKER_SIZE = 18;

// Simple filled marks so they stay legible at 18px and take the owner's colour.
const glyphs: Record<StrongholdStage, ReactNode> = {
  seed: <path d="M12 2.6c4 4.4 6.2 7.7 6.2 10.5a6.2 6.2 0 0 1-12.4 0c0-2.8 2.2-6.1 6.2-10.5z" />,
  tree: (
    <>
      <path d="M12 2 5.6 11.4h3.1L4.4 18h15.2l-4.3-6.6h3.1z" />
      <rect x="10.7" y="17.2" width="2.6" height="4.6" rx="1.1" />
    </>
  ),
  landmark: (
    <>
      <path d="M12 2 6.2 6.6V9h1.9v8.4h7.8V9h1.9V6.6z" />
      <rect x="4.2" y="18.6" width="15.6" height="3.4" rx="1.3" />
    </>
  ),
};

export function StrongholdMark({ stage, locale, ownerColor }: { stage: StrongholdStage; locale: Locale; ownerColor?: string }) {
  const label = labels[locale][stage];
  const markerStyle = { "--marker-size": `${MARKER_SIZE}px` } as CSSProperties;
  return (
    <span className={`stronghold-mark stronghold-mark--${stage}`} role="img" aria-label={`${label} ${labels[locale].stronghold}`} style={ownerColor ? { "--owner-color": ownerColor } as CSSProperties : undefined}>
      <span className="stronghold-silhouette" aria-hidden="true" style={markerStyle}>
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{glyphs[stage]}</svg>
      </span>
      <span>{label}</span>
    </span>
  );
}
