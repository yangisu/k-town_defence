"use client";

import { useMemo, useState } from "react";
import { X } from "@/components/ui/icons";
import { getArtistHomeTerritories, previewContent } from "@/features/team-preview/content";
import { t } from "@/features/team-preview/i18n";
import type { ArtistId, Locale } from "@/features/team-preview/types";

interface Props {
  open: boolean;
  locale: Locale;
  selectedArtistId: ArtistId | null;
  onClose(): void;
  onSelect(artistId: ArtistId): void;
}

export function ArtistDrawer({ open, locale, selectedArtistId, onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const artists = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return previewContent.artists;
    return previewContent.artists.filter((artist) => [
      artist.artistName.ko,
      artist.artistName.en,
      artist.fandomName,
    ].some((value) => value.toLocaleLowerCase().includes(needle)));
  }, [query]);

  if (!open) return null;

  return (
    <div className="artist-drawer-overlay">
      <section className="artist-drawer" role="dialog" aria-modal="true" aria-label={t(locale, "artistDialogTitle")}>
        <header>
          <div>
            <span>{t(locale, "seasonName")}</span>
            <h2>{t(locale, "artistDialogTitle")}</h2>
          </div>
          <button className="icon-button" type="button" aria-label={t(locale, "close")} onClick={onClose}>
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <label className="artist-search">
          <span className="sr-only">{t(locale, "artistSearchLabel")}</span>
          <input
            type="search"
            aria-label={t(locale, "artistSearchLabel")}
            placeholder={t(locale, "artistSearchPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <fieldset>
          <legend className="sr-only">{t(locale, "artistDialogTitle")}</legend>
          <div className="artist-grid">
            {artists.map((artist) => {
              const territories = getArtistHomeTerritories(artist.id);
              return (
                <label
                  htmlFor={`preview-artist-${artist.id}`}
                  aria-label={`${artist.artistName[locale]} ${artist.artistName.en} ${artist.fandomName}`}
                  className="artist-option"
                  key={artist.id}
                  style={{ "--artist-color": artist.color } as React.CSSProperties}
                >
                  <input
                    id={`preview-artist-${artist.id}`}
                    type="radio"
                    name="preview-artist"
                    value={artist.id}
                    checked={selectedArtistId === artist.id}
                    onChange={() => onSelect(artist.id)}
                  />
                  <span className="artist-swatch" aria-hidden="true" />
                  <span>
                    <strong>{artist.artistName[locale]} <small>{artist.artistName.en}</small></strong>
                    <b>{artist.fandomName}</b>
                    <small>{t(locale, "artistHomeTerritories")}: {territories.map((territory) => territory.name[locale]).join(", ")}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {artists.length === 0 ? <p role="status">{t(locale, "noArtists")}</p> : null}
      </section>
    </div>
  );
}
