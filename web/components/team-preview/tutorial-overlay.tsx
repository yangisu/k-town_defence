"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "@/components/ui/icons";
import { useModalFocus } from "@/components/ui/use-modal-focus";
import { GUIDE_STEPS, type GuideStep } from "@/features/team-preview/guide-steps";
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
 * Walks a visitor through the territory page, the expedition start and the
 * scoring rules, spotlighting the real control each step describes. The page
 * behind stays legible: the guide dims it without blurring, and the card sits
 * on the opposite half of the screen from whatever it is pointing at.
 */
export function TutorialOverlay({ locale, onClose, onPrepareStep }: {
  locale: Locale;
  onClose(): void;
  /** Puts the page into the state a step describes — the right tab, and a
   *  territory chosen for the steps that explain the tactical panel. */
  onPrepareStep?(step: GuideStep): void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const nextRef = useRef<HTMLButtonElement>(null);
  const prepareRef = useRef(onPrepareStep);
  const step = GUIDE_STEPS[index];
  const lastStep = index === GUIDE_STEPS.length - 1;

  useModalFocus(true, dialogRef, nextRef, onClose);

  useEffect(() => {
    prepareRef.current = onPrepareStep;
  }, [onPrepareStep]);

  useEffect(() => {
    prepareRef.current?.(step);
  }, [step]);

  useEffect(() => {
    const card = dialogRef.current;
    if (!card) return;
    setCardHeight(card.getBoundingClientRect().height);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setCardHeight(entry.contentRect.height));
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const target = document.querySelector<HTMLElement>(`[data-guide="${step.target}"]`);
    target?.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "smooth" });

    // Follow the target every frame while the page scrolls into place. Reading
    // it on scroll events alone let the outline lag and then jump to catch up.
    let frame = 0;
    let still = 0;
    const follow = () => {
      setRect((current) => {
        const next = readRect(step.target);
        if (!next || !current) {
          still = 0;
          return next;
        }
        const settled = Math.abs(next.top - current.top) < 0.5 && Math.abs(next.left - current.left) < 0.5
          && Math.abs(next.width - current.width) < 0.5 && Math.abs(next.height - current.height) < 0.5;
        still = settled ? still + 1 : 0;
        return settled ? current : next;
      });
      // Keep watching briefly after it stops, then let the page rest.
      if (still < 30) frame = window.requestAnimationFrame(follow);
    };
    frame = window.requestAnimationFrame(follow);

    const restart = () => {
      still = 0;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(follow);
    };
    window.addEventListener("resize", restart);
    window.addEventListener("scroll", restart, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", restart);
      window.removeEventListener("scroll", restart, true);
    };
  }, [step, index]);

  const spotlight = rect ? {
    top: rect.top - SPOTLIGHT_PADDING,
    left: rect.left - SPOTLIGHT_PADDING,
    width: rect.width + SPOTLIGHT_PADDING * 2,
    height: rect.height + SPOTLIGHT_PADDING * 2,
  } : null;
  // Keep the card away from what it points at: below a target in the top half
  // of the screen, above one in the bottom half.
  const viewportHeight = typeof window === "undefined" ? 0 : window.innerHeight;
  const targetInTopHalf = rect ? rect.top + rect.height / 2 < viewportHeight / 2 : true;
  const placement = spotlight ? (targetInTopHalf ? "bottom" : "top") : "center";
  // A coordinate rather than a layout switch, so the card glides between steps
  // instead of being re-laid out at the other end of the screen.
  const margin = 16;
  const cardTop = placement === "center"
    ? Math.max(margin, (viewportHeight - cardHeight) / 2)
    : placement === "bottom"
      ? Math.max(margin, viewportHeight - cardHeight - margin)
      : margin;

  return (
    <div className={`tutorial-overlay tutorial-overlay--${placement}`}>
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
        style={{ top: cardTop }}
      >
        <header>
          <p className="tutorial-progress">{index + 1} / {GUIDE_STEPS.length}</p>
          <button type="button" onClick={onClose} aria-label={t(locale, "tutorialDismiss")}>
            <X size={16} strokeWidth={2.4} aria-hidden="true" />
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
