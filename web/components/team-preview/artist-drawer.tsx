"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { X } from "@/components/ui/icons";
import { useModalFocus } from "@/components/ui/use-modal-focus";
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

interface ArtistSelectorProps {
  locale: Locale;
  selectedArtistId: ArtistId | null;
  confirmLabel: string;
  confirmationDisabled?: boolean;
  onSelect(artistId: ArtistId): void;
  onConfirm(): void;
}

export function ArtistSelector({
  locale,
  selectedArtistId,
  confirmLabel,
  confirmationDisabled = false,
  onSelect,
  onConfirm,
}: ArtistSelectorProps) {
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
  const selectionVisible = selectedArtistId !== null
    && artists.some((artist) => artist.id === selectedArtistId);

  return (
    <div className="artist-selector">
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
                style={{ "--artist-color": artist.color } as CSSProperties}
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
      <button type="button" disabled={!selectionVisible || confirmationDisabled} onClick={onConfirm}>{confirmLabel}</button>
    </div>
  );
}

export function ArtistDrawer({ open, locale, selectedArtistId, onClose, onSelect }: Props) {
  if (!open) return null;

  return (
    <OpenArtistDrawer
      locale={locale}
      selectedArtistId={selectedArtistId}
      onClose={onClose}
      onSelect={onSelect}
    />
  );
}

function OpenArtistDrawer({ locale, selectedArtistId, onClose, onSelect }: Omit<Props, "open">) {
  const [draftArtistId, setDraftArtistId] = useState<ArtistId | null>(selectedArtistId);
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useModalFocus(true, dialogRef, titleRef, onClose);

  return (
    <div className="artist-drawer-overlay">
      <section className="artist-drawer" role="dialog" aria-modal="true" aria-labelledby="artist-drawer-title" ref={dialogRef}>
        <header>
          <div>
            <span>{t(locale, "seasonName")}</span>
            <h2 id="artist-drawer-title" tabIndex={-1} ref={titleRef}>{t(locale, "artistDialogTitle")}</h2>
          </div>
          <button className="icon-button" type="button" aria-label={t(locale, "close")} onClick={onClose}>
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <ArtistSelector
          locale={locale}
          selectedArtistId={draftArtistId}
          onSelect={setDraftArtistId}
          confirmLabel={t(locale, "profileChangeConfirm")}
          confirmationDisabled={draftArtistId === selectedArtistId}
          onConfirm={() => {
            if (!draftArtistId) return;
            onSelect(draftArtistId);
            onClose();
          }}
        />
      </section>
    </div>
  );
}
