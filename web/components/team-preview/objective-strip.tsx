import type { CSSProperties } from "react";
import type { Locale } from "@/features/team-preview/types";
import { t } from "@/features/team-preview/i18n";

interface Props {
  locale: Locale;
  fandomName: string | null;
  fandomColor?: string | null;
  onChangeArtist?: () => void;
}

function channel(value: number) {
  const ratio = value / 255;
  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance per WCAG, used to pick the readable text tone. */
function luminance(hex: string) {
  const value = hex.replace("#", "");
  if (value.length !== 6) return null;
  const parts = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  if (parts.some((part) => Number.isNaN(part))) return null;
  const [red, green, blue] = parts.map(channel);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function readableInk(hex: string) {
  const background = luminance(hex);
  if (background === null) return "#ffffff";
  const onWhite = 1.05 / (background + 0.05);
  const onInk = (background + 0.05) / (luminance("#16231d")! + 0.05);
  return onWhite >= onInk ? "#ffffff" : "#16231d";
}

export function ObjectiveStrip({ locale, fandomName, fandomColor, onChangeArtist }: Props) {
  const painted = fandomName && fandomColor
    ? { "--fandom-color": fandomColor, "--fandom-ink": readableInk(fandomColor) } as CSSProperties
    : undefined;
  return (
    <section
      className={painted ? "objective-strip objective-strip--fandom" : "objective-strip"}
      data-shell-region="objective"
      aria-label={t(locale, "currentObjective")}
      style={painted}
    >
      {fandomName && onChangeArtist ? (
        <button type="button" onClick={onChangeArtist} aria-label={`${fandomName} · ${t(locale, "recordChangeArtist")}`}>
          {fandomName}
        </button>
      ) : <strong>{fandomName ?? t(locale, "chooseArtistObjective")}</strong>}
    </section>
  );
}
