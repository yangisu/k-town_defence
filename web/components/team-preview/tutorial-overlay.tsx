"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "@/components/ui/icons";
import { useBodyScrollLock } from "@/components/ui/use-body-scroll-lock";
import { useModalFocus } from "@/components/ui/use-modal-focus";
import { GUIDE_STEPS } from "@/features/team-preview/guide-steps";
import { t } from "@/features/team-preview/i18n";
import type { Locale } from "@/features/team-preview/types";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PADDING = 6;

function readRect(target: string | undefined): Rect | null {
  if (!target || typeof document === "undefined") return null;
  const element = document.querySelector<HTMLElement>(`[data-guide="${target}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

/**
 * Walks a first-time visitor through the territory page, the expedition start
 * and the scoring rules, spotlighting the real control each step describes.
 * A step whose control is off-screen still explains itself from the centre,
 * so the tour never dead-ends on a layout that hides its target.
 */
export function TutorialOverlay({ locale, onClose }: { locale: Locale; onClose(): void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = GUIDE_STEPS[index];
  const lastStep = index === GUIDE_STEPS.length - 1;

  useBodyScrollLock(true);
  useModalFocus(true, dialogRef, nextRef, onClose);

  useEffect(() => {
    const target = document.querySelector<HTMLElement>(`[data-guide="${step.target}"]`);
    target?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    const update = () => setRect(readRect(step.target));
    update();
    // The spotlight tracks its control, which the page can still move under it.
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step.target]);

  const spotlight = rect ? {
    top: rect.top - SPOTLIGHT_PADDING,
    left: rect.left - SPOTLIGHT_PADDING,
    width: rect.width + SPOTLIGHT_PADDING * 2,
    height: rect.height + SPOTLIGHT_PADDING * 2,
  } : null;

  return (
    <div className={spotlight ? "tutorial-overlay tutorial-overlay--anchored" : "tutorial-overlay"}>
      {spotlight ? (
        <div
          className="tutorial-spotlight"
          aria-hidden="true"
          style={{ top: spotlight.top, left: spotlight.left, width: spotlight.width, height: spotlight.height }}
        />
      ) : null}
      <div
        className="tutorial-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        ref={dialogRef}
      >
        <header>
          <p className="tutorial-progress">{index + 1} / {GUIDE_STEPS.length}</p>
          <button type="button" onClick={onClose} aria-label={t(locale, "tutorialDismiss")}>
            <X size={18} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </header>
        <h2 id="tutorial-title">{step.title[locale]}</h2>
        <p className="tutorial-body">{step.body[locale]}</p>
        {step.target && !rect ? (
          <p className="tutorial-fallback" role="note">{t(locale, "tutorialOffscreen")}</p>
        ) : null}
        <ol className="tutorial-dots" aria-hidden="true">
          {GUIDE_STEPS.map((candidate, candidateIndex) => (
            <li key={candidate.id} className={candidateIndex === index ? "current" : undefined} />
          ))}
        </ol>
        <div className="tutorial-actions">
          <button
            type="button"
            className="tutorial-back"
            onClick={() => setIndex((current) => Math.max(0, current - 1))}
            disabled={index === 0}
          >
            {t(locale, "tutorialBack")}
          </button>
          <button type="button" className="tutorial-skip" onClick={onClose}>{t(locale, "tutorialSkip")}</button>
          <button
            type="button"
            className="primary-button"
            ref={nextRef}
            onClick={() => (lastStep ? onClose() : setIndex((current) => current + 1))}
          >
            {t(locale, lastStep ? "tutorialDone" : "tutorialNext")}
          </button>
        </div>
      </div>
    </div>
  );
}
