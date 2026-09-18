"use client";

import { useRef } from "react";
import { X } from "@/components/ui/icons";
import { useBodyScrollLock } from "@/components/ui/use-body-scroll-lock";
import { useModalFocus } from "@/components/ui/use-modal-focus";
import { t } from "@/features/team-preview/i18n";
import type { CopyKey } from "@/features/team-preview/i18n";
import type { Locale } from "@/features/team-preview/types";

const STEPS: readonly (readonly [CopyKey, CopyKey])[] = [
  ["selectArtistStep", "tutorialStepArtistBody"],
  ["selectTerritoryStep", "tutorialStepTerritoryBody"],
  ["startExpeditionStep", "tutorialStepExpeditionBody"],
];

/**
 * Greets a first-time visitor on the artist selection screen. The design keeps
 * onboarding inside the product rather than a separate tutorial route, so this
 * names the same three steps the objective strip and tactical panel follow.
 */
export function TutorialOverlay({ locale, onClose }: { locale: Locale; onClose(): void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);

  useBodyScrollLock(true);
  useModalFocus(true, dialogRef, startRef, onClose);

  return (
    <div className="tutorial-overlay">
      <div
        className="tutorial-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        ref={dialogRef}
      >
        <header>
          <span>{t(locale, "seasonName")}</span>
          <button type="button" onClick={onClose} aria-label={t(locale, "tutorialDismiss")}>
            <X size={18} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </header>
        <h2 id="tutorial-title">{t(locale, "tutorialTitle")}</h2>
        <p className="tutorial-intro">{t(locale, "tutorialIntro")}</p>
        <ol className="tutorial-steps">
          {STEPS.map(([titleKey, bodyKey]) => (
            <li key={titleKey}>
              <strong>{t(locale, titleKey)}</strong>
              <span>{t(locale, bodyKey)}</span>
            </li>
          ))}
        </ol>
        <button type="button" className="primary-button" onClick={onClose} ref={startRef}>
          {t(locale, "tutorialStart")}
        </button>
      </div>
    </div>
  );
}
