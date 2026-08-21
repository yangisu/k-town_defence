"use client";
import { forwardRef } from "react";
import type { FandomSummary } from "@/lib/domain";

interface FandomOptionProps {
  fandom: FandomSummary;
  checked: boolean;
  disabled?: boolean;
  onChange(): void;
}

export const FandomOption = forwardRef<HTMLInputElement, FandomOptionProps>(
  function FandomOption({ fandom, checked, disabled = false, onChange }, ref) {
    return (
      <label className={`fandom-option${checked ? " selected" : ""}`}>
        <input ref={ref} type="radio" name="season-fandom" value={fandom.id}
          checked={checked} disabled={disabled} onChange={onChange} />
        <span>
          <strong>{fandom.name}</strong>
          {fandom.artistName && <small>{fandom.artistName}</small>}
        </span>
      </label>
    );
  },
);
