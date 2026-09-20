"use client";

import { useState } from "react";
import { StrongholdMark } from "@/components/team-preview/stronghold-mark";
import type { Locale, StrongholdStage } from "@/features/team-preview/types";

const labels = {
  ko: { seed: "씨앗 배지", tree: "나무 배지", landmark: "랜드마크 배지", locked: "아직 얻지 못함" },
  en: { seed: "Seed badge", tree: "Tree badge", landmark: "Landmark badge", locked: "Not earned yet" },
} as const;

/**
 * The reward a stage earns, drawn at a size worth looking at.
 *
 * A badge that has not been earned shows a dash rather than a drained copy of
 * the artwork: an empty slot reads as "not yet" at a glance, where a greyed
 * badge reads as a badge. The artwork itself is a file the team drops in, and
 * until one exists the mark used elsewhere stands in, so an earned reward is
 * never an empty frame.
 */
export function StageBadge({ stage, locale, unlocked, ownerColor }: {
  stage: StrongholdStage;
  locale: Locale;
  unlocked: boolean;
  ownerColor?: string;
}) {
  const [artworkFailed, setArtworkFailed] = useState(false);

  if (!unlocked) {
    return (
      <span className="stage-badge stage-badge--empty" role="img" aria-label={`${labels[locale][stage]} · ${labels[locale].locked}`}>
        <span aria-hidden="true">–</span>
      </span>
    );
  }

  if (artworkFailed) {
    return (
      <span className="stage-badge stage-badge--fallback">
        <StrongholdMark stage={stage} locale={locale} ownerColor={ownerColor} />
      </span>
    );
  }

  return (
    <img
      className="stage-badge"
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
