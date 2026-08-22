import type { Locale } from "@/features/team-preview/types";
import { t } from "@/features/team-preview/i18n";

interface Props {
  locale: Locale;
  fandomName: string | null;
  territoryName: string | null;
  onReset(): void;
}

export function ObjectiveStrip({ locale, fandomName, territoryName, onReset }: Props) {
  return (
    <section className="objective-strip" data-shell-region="objective" aria-label={t(locale, "currentObjective")}>
      <div>
        <span>{t(locale, "currentObjective")}</span>
        <strong>
          {fandomName
            ? `${fandomName} · ${territoryName ?? t(locale, "territoryObjective")}`
            : t(locale, "chooseArtistObjective")}
        </strong>
      </div>
      <button type="button" onClick={onReset}>{t(locale, "resetDemo")}</button>
    </section>
  );
}
