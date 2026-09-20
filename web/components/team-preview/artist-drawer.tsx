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
  /** The roster, so it can be switched between and left from here. */
  followedArtistIds?: ArtistId[];
  onClose(): void;
  onSelect(artistId: ArtistId): void;
  onRemove?(artistId: ArtistId): void;
}

interface ArtistSelectorProps {
  locale: Locale;
  selectedArtistId: ArtistId | null;
  confirmLabel: string;
  confirmationDisabled?: boolean;
  stickyConfirmation?: boolean;
  onSelect(artistId: ArtistId): void;
  onConfirm(): void;
}

export function ArtistSelector({
  locale,
  selectedArtistId,
  confirmLabel,
  confirmationDisabled = false,
  stickyConfirmation = false,
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
                <span
                  className={`artist-swatch${artist.logoPath ? " artist-swatch--logo" : ""}`}
                  aria-hidden="true"
                  style={artist.logoPath ? { backgroundImage: `url(${artist.logoPath})` } : undefined}
                >
                  {!artist.logoPath ? <b>{artist.markerLabel}</b> : null}
                </span>
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
      <div
        className={`artist-selector-actions${stickyConfirmation ? " artist-selector-actions--sticky" : ""}`}
        role="group"
        aria-label={stickyConfirmation
          ? (locale === "ko" ? "팬덤 변경 작업" : "Fandom change actions")
          : (locale === "ko" ? "팬덤 선택 작업" : "Fandom selection actions")}
      >
        <button type="button" disabled={!selectionVisible || confirmationDisabled} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  );
}

export function ArtistDrawer({ open, locale, selectedArtistId, followedArtistIds, onClose, onSelect, onRemove }: Props) {
  if (!open) return null;

  return (
    <OpenArtistDrawer
      locale={locale}
      selectedArtistId={selectedArtistId}
      followedArtistIds={followedArtistIds}
      onClose={onClose}
      onSelect={onSelect}
      onRemove={onRemove}
    />
  );
}

function OpenArtistDrawer({ locale, selectedArtistId, followedArtistIds = [], onClose, onSelect, onRemove }: Omit<Props, "open">) {
  const [draftArtistId, setDraftArtistId] = useState<ArtistId | null>(selectedArtistId);
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useModalFocus(true, dialogRef, titleRef, onClose);
  const followed = followedArtistIds
    .map((artistId) => previewContent.artists.find((candidate) => candidate.id === artistId))
    .filter((artist): artist is (typeof previewContent.artists)[number] => artist !== undefined);
  // Confirming an artist already on the roster switches to them; confirming a
  // new one adds them. One button, because it is one gesture: play as this.
  const draftIsNew = draftArtistId !== null && !followedArtistIds.includes(draftArtistId);

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
        {followed.length > 0 ? (
          <section className="artist-roster" aria-label={t(locale, "recordFollowedFandoms")}>
            <h3>{t(locale, "recordFollowedFandoms")}</h3>
            <ul>
              {followed.map((artist) => (
                <li
                  key={artist.id}
                  className={artist.id === selectedArtistId ? "active" : undefined}
                  style={{ "--artist-color": artist.color } as CSSProperties}
                >
                  <span aria-hidden="true" />
                  <span>
                    <strong>{artist.fandomName}</strong>
                    <small>{artist.artistName[locale]}</small>
                  </span>
                  {artist.id === selectedArtistId
                    ? <b>{t(locale, "recordActiveFandom")}</b>
                    : (
                      <button type="button" className="artist-roster-switch" onClick={() => { onSelect(artist.id); onClose(); }}>
                        {t(locale, "recordSwitchArtist")}
                      </button>
                    )}
                  {onRemove ? (
                    <button
                      type="button"
                      className="artist-roster-remove"
                      aria-label={t(locale, "recordRemoveArtistLabel").replace("{fandom}", artist.fandomName)}
                      onClick={() => onRemove(artist.id)}
                    >
                      <X aria-hidden="true" size={16} strokeWidth={2.6} />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <ArtistSelector
          locale={locale}
          selectedArtistId={draftArtistId}
          onSelect={setDraftArtistId}
          confirmLabel={t(locale, draftIsNew ? "artistAddConfirm" : "recordSwitchArtist")}
          confirmationDisabled={draftArtistId === selectedArtistId}
          stickyConfirmation
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
