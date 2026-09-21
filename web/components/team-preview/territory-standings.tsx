"use client";

import { ChevronRight } from "@/components/ui/icons";
import { previewContent } from "@/features/team-preview/content";
import { useDisclosure } from "@/features/team-preview/demo-session-context";
import { t } from "@/features/team-preview/i18n";
import type { ArtistId, Locale, PreviewTerritory } from "@/features/team-preview/types";

/**
 * Who holds a territory and by how much, fandom by fandom. It opens on demand
 * because the two pages that carry it — the tactical card and the expedition —
 * lead with one number each; this is the ranking behind that number.
 */
export function TerritoryStandings({ territory, locale, selectedArtistId, defaultOpen = false }: {
  territory: PreviewTerritory;
  locale: Locale;
  selectedArtistId: ArtistId | null;
  defaultOpen?: boolean;
}) {
  // The fold belongs to the territory, so each card remembers its own.
  const [open, setOpen] = useDisclosure(`standings.${territory.id}`, defaultOpen);
  const ranked = [...territory.standings].sort((left, right) => right.validPoints - left.validPoints);

  return (
    <section className="territory-standings" aria-label={`${territory.name[locale]} ${t(locale, "territoryStandings")}`}>
      <button
        type="button"
        className={open ? "territory-standings-toggle open" : "territory-standings-toggle"}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {/* No running total: the fandoms in a territory are read against each
            other, and their sum is not a number anyone plays against. */}
        <span>{t(locale, "territoryStandings")}</span>
        <ChevronRight size={16} strokeWidth={2.6} aria-hidden="true" />
      </button>
      {open ? (
        <ol>
          {ranked.map((standing, index) => {
            const artist = previewContent.artists.find((candidate) => candidate.id === standing.artistId);
            const mine = standing.artistId === selectedArtistId;
            return (
              <li key={standing.artistId} className={mine ? "mine" : undefined}>
                <b>{index + 1}</b>
                <span>
                  <strong>{standing.fandomName}</strong>
                  <small>{artist?.artistName[locale] ?? standing.artistId}</small>
                </span>
                <em>{standing.validPoints.toLocaleString()}P</em>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
