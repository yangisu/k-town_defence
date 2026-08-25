"use client";

import { useCallback, useEffect, useRef } from "react";
import { DemoBrandLockup } from "@/components/demo-entry/demo-brand-lockup";

interface Props {
  onComplete(): void;
  durationMs?: number;
}

export function DemoBrandTransition({ onComplete, durationMs = 1_500 }: Props) {
  const completed = useRef(false);
  const finish = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    const timer = window.setTimeout(finish, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, finish]);

  return (
    <button
      type="button"
      className="demo-entry-screen demo-brand-transition"
      aria-label="K-TOWN DEFENCE 시작 화면—클릭하여 바로 시작"
      onClick={finish}
    >
      <DemoBrandLockup className="demo-brand-lockup--hero" />
      <small>클릭하여 바로 시작</small>
    </button>
  );
}
