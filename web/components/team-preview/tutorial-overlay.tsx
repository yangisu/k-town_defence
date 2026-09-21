"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, X } from "@/components/ui/icons";
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
 * Walks a visitor through the territory page, spotlighting the real control
 * each step describes. A tap anywhere moves on, so the only buttons are back
 * and close; a step that asks for something waits for the deed instead, and
 * leaves the page clickable so the reader can do it.
 */
export function TutorialOverlay({ locale, onClose, onPrepareStep, territorySelected = false, expeditionOpen = false }: {
  locale: Locale;
  onClose(): void;
  /** Puts the page into the state a step describes — the right tab, and a
   *  territory chosen for the steps that explain the tactical panel. */
  onPrepareStep?(step: GuideStep): void;
  /** Whether a territory is chosen, which is what the "choose one" step waits
   *  for before it moves on. */
  territorySelected?: boolean;
  /** Whether a route has been started, which carries the guide onto the
   *  expedition page and its chapter of steps. */
  expeditionOpen?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const prepareRef = useRef(onPrepareStep);
  const step = GUIDE_STEPS[index];
  const lastStep = index === GUIDE_STEPS.length - 1;
  const waiting = step.awaits !== undefined;
  const done = step.awaits === "territory" ? territorySelected : step.awaits === "expedition" ? expeditionOpen : false;

  useModalFocus(true, dialogRef, closeRef, onClose);

  const advance = () => {
    if (lastStep) onClose();
    else setIndex((current) => current + 1);
  };

  useEffect(() => {
    prepareRef.current = onPrepareStep;
  }, [onPrepareStep]);

  useEffect(() => {
    prepareRef.current?.(step);
  }, [step]);

  // A waiting step moves on by itself once the reader has done the deed —
  // chosen a territory, or started the route that carries the guide onto the
  // expedition page.
  useEffect(() => {
    if (!waiting || !done) return;
    const settle = window.setTimeout(() => setIndex((current) => (
      GUIDE_STEPS[current]?.awaits ? current + 1 : current
    )), 320);
    return () => window.clearTimeout(settle);
  }, [done, waiting]);

  useEffect(() => {
    const card = dialogRef.current;
    if (!card) return;
    setCardHeight(card.getBoundingClientRect().height);
    if (typeof ResizeObserver === "undefined") return;
    // The border box, not the content box: the card's padding and border are
    // 34px of it, and leaving them out placed the card 34px too far down —
    // just enough to sit on top of the target it was meant to clear.
    const observer = new ResizeObserver(() => setCardHeight(card.getBoundingClientRect().height));
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const bring = () => document
      .querySelector<HTMLElement>(`[data-guide="${step.target}"]`)
      ?.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "smooth" });
    bring();
    // A step that opens something first — the phone's territory list — moves
    // its own target after this runs, and the target ended up behind the tab
    // bar. Asking again once the page has settled puts it back in the middle.
    const settle = window.setTimeout(bring, 420);

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
      window.clearTimeout(settle);
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
  const viewportHeight = typeof window === "undefined" ? 0 : window.innerHeight;
  const viewportWidth = typeof window === "undefined" ? 0 : window.innerWidth;
  // The card sits in whichever gap the spotlight leaves, right up against it
  // rather than pinned to an edge. Pinning put the card at the very bottom of
  // a phone when the target was near the top, and let it cover the target
  // outright when the target sat in the middle.
  const margin = 16;
  const gap = 14;
  const above = spotlight ? spotlight.top - margin : 0;
  const below = spotlight ? viewportHeight - (spotlight.top + spotlight.height) - margin : 0;
  const placement = !spotlight
    ? "center"
    : below >= cardHeight + gap || below >= above
      ? "bottom"
      : "top";
  // A coordinate rather than a layout switch, so the card glides between steps
  // instead of being re-laid out at the other end of the screen.
  const rawTop = !spotlight
    ? (viewportHeight - cardHeight) / 2
    : placement === "bottom"
      ? spotlight.top + spotlight.height + gap
      : spotlight.top - cardHeight - gap;
  const cardTop = Math.min(
    Math.max(margin, rawTop),
    Math.max(margin, viewportHeight - cardHeight - margin),
  );
  // A target too tall for either gap would be covered by a full-height card,
  // so the card gives up height instead and scrolls. Below a floor it stops
  // shrinking — a card too short to read is worse than a covered target.
  const room = Math.floor(placement === "center" ? viewportHeight - margin * 2 : (placement === "bottom" ? below : above) - gap);
  const cardMaxHeight = placement === "center" ? undefined : Math.max(176, room);

  // Everything outside the spotlight is sealed off, so the only thing the
  // reader can press is the thing the step is pointing at. Without this the
  // page stayed live under the guide and a stray tap took them somewhere the
  // guide was not describing. Four panels rather than one sheet, because a
  // single sheet cannot have a hole in it.
  const shutters: Rect[] = spotlight ? [
    { top: 0, left: 0, width: viewportWidth, height: Math.max(0, spotlight.top) },
    { top: spotlight.top + spotlight.height, left: 0, width: viewportWidth, height: Math.max(0, viewportHeight - spotlight.top - spotlight.height) },
    { top: Math.max(0, spotlight.top), left: 0, width: Math.max(0, spotlight.left), height: Math.max(0, spotlight.height) },
    { top: Math.max(0, spotlight.top), left: spotlight.left + spotlight.width, width: Math.max(0, viewportWidth - spotlight.left - spotlight.width), height: Math.max(0, spotlight.height) },
  ] : [{ top: 0, left: 0, width: viewportWidth, height: viewportHeight }];

  return (
    <div className={`tutorial-overlay tutorial-overlay--${placement}`}>
      {/* Off a waiting step, the sealed-off area is also the "next" control, so
          a reader can tap wherever they are already looking. While the guide
          waits, it only blocks. */}
      {shutters.map((shutter, shutterIndex) => (
        <button
          key={shutterIndex}
          type="button"
          className="tutorial-shutter"
          tabIndex={-1}
          aria-hidden={waiting ? "true" : undefined}
          aria-label={waiting ? undefined : t(locale, lastStep ? "tutorialDone" : "tutorialNext")}
          style={{ top: shutter.top, left: shutter.left, width: shutter.width, height: shutter.height }}
          onClick={waiting ? undefined : advance}
        />
      ))}
      {spotlight ? (
        <div
          className={waiting ? "tutorial-spotlight tutorial-spotlight--beckon" : "tutorial-spotlight"}
          aria-hidden="true"
          style={{ top: spotlight.top, left: spotlight.left, width: spotlight.width, height: spotlight.height }}
        />
      ) : null}
      {/* A ring that pulses outward from the target, so the step that waits
          reads as "press this" instead of as the guide having stalled. */}
      {spotlight && waiting ? (
        <div
          className="tutorial-beckon"
          aria-hidden="true"
          style={{ top: spotlight.top, left: spotlight.left, width: spotlight.width, height: spotlight.height }}
        />
      ) : null}
      <div
        className={waiting ? "tutorial-card tutorial-card--waiting" : "tutorial-card"}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        ref={dialogRef}
        style={cardMaxHeight === undefined ? { top: cardTop } : { top: cardTop, maxHeight: cardMaxHeight }}
        onClick={waiting ? undefined : advance}
      >
        <header>
          <button
            type="button"
            className="tutorial-back"
            aria-label={t(locale, "tutorialBack")}
            disabled={index === 0}
            onClick={(event) => {
              event.stopPropagation();
              setIndex((current) => Math.max(0, current - 1));
            }}
          >
            <ArrowLeft size={16} strokeWidth={2.6} aria-hidden="true" />
          </button>
          <p className="tutorial-progress">{index + 1} / {GUIDE_STEPS.length}</p>
          <button
            type="button"
            className="tutorial-close"
            ref={closeRef}
            aria-label={t(locale, "tutorialDismiss")}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
          >
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
      </div>
    </div>
  );
}
