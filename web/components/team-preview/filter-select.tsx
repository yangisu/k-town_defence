"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight } from "@/components/ui/icons";

export interface FilterOption {
  id: string;
  label: string;
}

/**
 * The phone layout used a bare `<select>`, which hands the list to the OS and
 * looks nothing like the rest of the page. This is the same control drawn as a
 * listbox: one button, a sheet of options, and the keyboard behaviour a select
 * has — arrows to walk, Enter to take, Escape to leave.
 */
export function FilterSelect({ label, options, value, onChange }: {
  label: string;
  options: readonly FilterOption[];
  value: string;
  onChange(id: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((option) => option.id === value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.id === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((option) => option.id === value)));
    const closeOnOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open, options, value]);

  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  const take = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  const onListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
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

  return (
    <div className="filter-select" ref={rootRef}>
      <button
        type="button"
        className="filter-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${selected?.label ?? ""}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label}</span>
        <ChevronRight size={16} strokeWidth={2.6} aria-hidden="true" />
      </button>
      {open ? (
        <ul
          className="filter-select-list"
          id={listId}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          ref={listRef}
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
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
