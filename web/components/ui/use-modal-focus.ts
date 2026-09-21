"use client";

import { type RefObject, useEffect, useRef } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function isRadioGroupTabStop(element: HTMLElement, candidates: readonly HTMLElement[]) {
  if (!(element instanceof HTMLInputElement) || element.type !== "radio" || !element.name) return true;

  const group = candidates.filter((candidate): candidate is HTMLInputElement => (
    candidate instanceof HTMLInputElement
    && candidate.type === "radio"
    && candidate.name === element.name
    && candidate.form === element.form
  ));
  return element === (group.find((radio) => radio.checked) ?? group[0]);
}

/**
 * Every trap currently holding the screen, oldest first. Only the last one
 * acts: two of them at once — the guide's card and the check-in it opens —
 * each saw focus sitting in the other, pulled it back to itself, and that pull
 * was a focus the other had to answer. The two of them filled the call stack
 * inside a single event, and pressing Escape in the inner one closed both.
 */
const openTraps: object[] = [];

export function useModalFocus(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const closeRef = useRef(onClose);
  const trapId = useRef({});

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;

    const trap = trapId.current;
    openTraps.push(trap);
    const isTopmost = () => openTraps[openTraps.length - 1] === trap;

    const invokingControl = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    initialFocusRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopmost()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const candidates = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
      ).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
      const focusable = candidates.filter((element) => isRadioGroupTabStop(element, candidates));
      if (focusable.length === 0) {
        event.preventDefault();
        initialFocusRef.current?.focus();
        return;
      }

      const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && activeIndex <= 0) {
        event.preventDefault();
        focusable.at(-1)?.focus();
      } else if (!event.shiftKey && (activeIndex === -1 || activeIndex === focusable.length - 1)) {
        event.preventDefault();
        focusable[0].focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isTopmost()) return;
      const container = containerRef.current;
      if (container && event.target instanceof Node && !container.contains(event.target)) {
        event.stopPropagation();
        initialFocusRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn, true);
      const at = openTraps.indexOf(trap);
      if (at >= 0) openTraps.splice(at, 1);
      if (invokingControl?.isConnected) invokingControl.focus();
    };
  }, [active, containerRef, initialFocusRef]);
}
