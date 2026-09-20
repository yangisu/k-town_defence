"use client";

import { useState } from "react";
import { StrongholdMark } from "@/components/team-preview/stronghold-mark";
import type { Locale, StrongholdStage } from "@/features/team-preview/types";

const labels = {
  ko: { seed: "씨앗 배지", tree: "나무 배지", landmark: "랜드마크 배지" },
  en: { seed: "Seed badge", tree: "Tree badge", landmark: "Landmark badge" },
} as const;

/**
 * The reward a stage earns, drawn at a size worth looking at. The artwork is a
 * file the team drops in; until one exists — or if it fails to load — the mark
 * used everywhere else stands in, so the row is never an empty frame.
 */
export function StageBadge({ stage, locale, unlocked, ownerColor }: {
  stage: StrongholdStage;
  locale: Locale;
  unlocked: boolean;
  ownerColor?: string;
}) {
  const [artworkFailed, setArtworkFailed] = useState(false);

  if (artworkFailed) {
    return (
      <span className="stage-badge stage-badge--fallback">
        <StrongholdMark stage={stage} locale={locale} ownerColor={ownerColor} />
      </span>
    );
  }

  return (
    <img
      className={unlocked ? "stage-badge" : "stage-badge locked"}
      src={`/badges/${stage}.png`}
      alt={labels[locale][stage]}
      width={64}
      height={64}
      loading="lazy"
      decoding="async"
      onError={() => setArtworkFailed(true)}
    />
  );
}
