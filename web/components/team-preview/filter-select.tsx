"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight } from "@/components/ui/icons";

export interface FilterOption {
  id: string;
  label: string;
}

const MIN_LIST_HEIGHT = 260;

interface Anchor {
  /** Set when the list hangs below the trigger, which is the usual case. */
  top?: number;
  /** Set instead when there is more room above, so it opens upward. */
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
}

/**
 * The phone layout used a bare `<select>`, which hands the list to the OS and
 * looks nothing like the rest of the page. This is the same control drawn as a
 * listbox: one button, a sheet of options, and the keyboard behaviour a select
 * has — arrows to walk, Enter to take, Escape to leave. The sheet is portalled
 * to the body because the control sits inside the map's clipped box, which
 * would otherwise cut it off.
 */
export function FilterSelect({ label, options, value, onChange }: {
  label: string;
  options: readonly FilterOption[];
  value: string;
  onChange(id: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((option) => option.id === value)));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.id === value) ?? options[0];

  useLayoutEffect(() => {
    if (!open) return;
    // Fixed to the viewport, the list cannot scroll with the page, so near the
    // bottom its last options used to sit below the fold with no way to reach
    // them. It takes whichever side has more room and scrolls within it.
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const gap = 8;
      const margin = 12;
      const below = window.innerHeight - rect.bottom - gap - margin;
      const above = rect.top - gap - margin;
      const openUp = below < MIN_LIST_HEIGHT && above > below;
      setAnchor({
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + gap }
          : { top: rect.bottom + gap }),
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(MIN_LIST_HEIGHT, openUp ? above : below),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((option) => option.id === value)));
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open, options, value]);

  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open, anchor]);

  const take = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  const onListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;
        return (next + options.length) % options.length;
      });
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[active];
      if (option) take(option.id);
    }
  };

  const sheet = open && anchor && typeof document !== "undefined" ? createPortal(
    <ul
      className="filter-select-list"
      id={listId}
      role="listbox"
      aria-label={label}
      tabIndex={-1}
      ref={listRef}
      style={{ top: anchor.top, bottom: anchor.bottom, left: anchor.left, width: anchor.width, maxHeight: anchor.maxHeight }}
      onKeyDown={onListKeyDown}
    >
      {options.map((option, index) => (
        <li key={option.id}>
          <button
            type="button"
            role="option"
            aria-selected={option.id === value}
            className={index === active ? "active" : undefined}
            onPointerEnter={() => setActive(index)}
            onClick={() => take(option.id)}
          >
            <span>{option.label}</span>
            {option.id === value ? <Check size={15} strokeWidth={3} aria-hidden="true" /> : null}
          </button>
        </li>
      ))}
    </ul>,
    document.body,
  ) : null;

  return (
    <div className="filter-select">
      <button
        type="button"
        className="filter-select-trigger"
        ref={triggerRef}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${selected?.label ?? ""}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="filter-select-value">{selected?.label}</span>
        <ChevronRight className="filter-select-caret" size={16} strokeWidth={2.6} aria-hidden="true" />
      </button>
      {sheet}
    </div>
  );
}
