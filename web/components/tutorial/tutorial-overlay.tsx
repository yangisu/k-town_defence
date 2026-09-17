"use client";

import { useEffect, useRef, useState } from "react";
import { TUTORIAL_TARGETS } from "@/features/tutorial/tutorial-config";
import { DEFAULT_TUTORIAL_STATE } from "@/features/tutorial/tutorial-config";
import { useOptionalTutorial } from "@/features/tutorial/tutorial-provider";
import { tutorialCopy } from "@/features/tutorial/tutorial-copy";
import type { Locale } from "@/features/team-preview/types";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function TutorialOverlay({ locale }: { locale: Locale }) {
  const tutorial = useOptionalTutorial();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const state = tutorial?.state ?? DEFAULT_TUTORIAL_STATE;
  const skipTutorial = tutorial?.skipTutorial;
  const running = state.status === "running";
  const targetSelector = `[data-tutorial="${TUTORIAL_TARGETS[state.step]}"]`;

  useEffect(() => {
    if (!tutorial || !running) return;
    const update = () => {
      const target = document.querySelector<HTMLElement>(targetSelector);
      if (!target) {
        setTargetRect(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
      target.classList.add("tutorial-target-active");
      target.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      document.querySelectorAll(".tutorial-target-active").forEach((element) => element.classList.remove("tutorial-target-active"));
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [running, state.step, targetSelector, tutorial]);

  useEffect(() => {
    if (tutorial && running) titleRef.current?.focus();
  }, [running, state.step, tutorial]);

  useEffect(() => {
    if (!tutorial || !running) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") tutorial.skipTutorial();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [running, tutorial]);

  if (!tutorial || !running || !skipTutorial) return null;
  const copy = tutorialCopy[locale][state.step];
  const stepNumber = ["choose-fandom", "open-territory", "start-expedition", "open-checkin"].indexOf(state.step) + 1;

  return (
    <div className="tutorial-overlay" role="presentation">
      <div className="tutorial-backdrop" aria-hidden="true" />
      <section
        className="tutorial-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        style={targetRect ? { top: Math.min(window.innerHeight - 220, targetRect.top + targetRect.height + 16), left: Math.max(16, Math.min(window.innerWidth - 360, targetRect.left)) } : undefined}
      >
        <p className="tutorial-progress">{stepNumber} / 4</p>
        <h2 id="tutorial-title" tabIndex={-1} ref={titleRef}>{copy.title}</h2>
        <p>{copy.body}</p>
        {!targetRect ? <p className="tutorial-fallback">이 단계의 화면을 준비하고 있어요. 화면이 나타나면 강조된 대상을 선택하세요.</p> : null}
        <div className="tutorial-actions">
          <button type="button" className="text-button" onClick={skipTutorial}>{locale === "ko" ? "건너뛰기" : "Skip"}</button>
          <button type="button" className="primary-button" onClick={skipTutorial}>{locale === "ko" ? "닫기" : "Close"}</button>
        </div>
      </section>
    </div>
  );
}