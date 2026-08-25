import type { ArtistProfile, Locale, PreviewTerritory } from "@/features/team-preview/types";
import { t } from "@/features/team-preview/i18n";

interface Props {
  locale: Locale;
  artist: ArtistProfile | null;
  recommendedTerritory: PreviewTerritory | null;
  artistConfirmed: boolean;
}

export function StartPanel({ locale, artist, recommendedTerritory, artistConfirmed }: Props) {
  if (!artistConfirmed || !artist) {
    return (
      <aside className="start-panel" aria-label={t(locale, "selectArtistStep")}>
        <span>{t(locale, "seasonName")}</span>
        <h2>{t(locale, "selectArtistStep")}</h2>
        <p>{t(locale, "chooseArtistObjective")}</p>
        <ol>
          <li>{t(locale, "selectTerritoryStep")}</li>
          <li>{t(locale, "startExpeditionStep")}</li>
        </ol>
      </aside>
    );
  }

  if (!recommendedTerritory) {
    return (
      <aside className="start-panel recommended" aria-label={t(locale, "selectTerritoryStep")}>
        <span>{artist.artistName[locale]} · {artist.fandomName}</span>
        <h2>{t(locale, "selectTerritoryStep")}</h2>
        <p>{t(locale, "chooseTerritoryObjective")}</p>
        <ol>
          <li>{t(locale, "startExpeditionStep")}</li>
        </ol>
      </aside>
    );
  }

  return (
    <aside className="start-panel recommended" aria-label={t(locale, "recommendedTerritory")}>
      <span>{artist.artistName[locale]} · {artist.fandomName}</span>
      <h2>{t(locale, "selectTerritoryStep")}</h2>
      <p>{t(locale, "recommendedTerritory")}</p>
      <strong className="recommended-region">{recommendedTerritory.name[locale]}</strong>
    </aside>
  );
}
