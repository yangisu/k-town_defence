"use client";

import { useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Trash2, X } from "@/components/ui/icons";
import { useModalFocus } from "@/components/ui/use-modal-focus";
import { getArtistHomeTerritories, previewContent } from "@/features/team-preview/content";
import { t } from "@/features/team-preview/i18n";
import type { ArtistId, ArtistProfile, Locale } from "@/features/team-preview/types";

interface Props {
  open: boolean;
  locale: Locale;
  selectedArtistId: ArtistId | null;
  /** The roster, so it can be switched between and left from here. */
  followedArtistIds?: ArtistId[];
  /** The artists to offer — see `ArtistSelectorProps`. */
  roster?: readonly ArtistProfile[];
  onClose(): void;
  onSelect(artistId: ArtistId): void;
  onRemove?(artistId: ArtistId): void;
  onAddArtist?(name: string, artistName: string): Promise<void>;
}

interface ArtistSelectorProps {
  locale: Locale;
  selectedArtistId: ArtistId | null;
  confirmLabel: string;
  confirmationDisabled?: boolean;
  stickyConfirmation?: boolean;
  /** Already on the roster: shown, but greyed out and sunk to the bottom,
   *  because the list below exists to find someone new. */
  followedArtistIds?: readonly ArtistId[];
  /** The artists on offer. Left unset it is the preview catalog, which is
   *  right for the local session; a season passes the fandoms it actually
   *  holds, so every choice is one the membership can apply — including the
   *  ones members named themselves. */
  roster?: readonly ArtistProfile[];
  /** Adds an artist the list does not carry. Absent, the picker offers only
   *  what it was given. */
  onAddArtist?(name: string, artistName: string): Promise<void>;
  onSelect(artistId: ArtistId): void;
  onConfirm(): void;
}

export function ArtistSelector({
  locale,
  selectedArtistId,
  confirmLabel,
  confirmationDisabled = false,
  stickyConfirmation = false,
  followedArtistIds = [],
  roster: offered,
  onAddArtist,
  onSelect,
  onConfirm,
}: ArtistSelectorProps) {
  const [query, setQuery] = useState("");
  const artists = useMemo(() => {
    const roster = offered ?? previewContent.artists;
    const needle = query.trim().toLocaleLowerCase();
    const matching = needle
      ? roster.filter((artist) => [
        artist.artistName.ko,
        artist.artistName.en,
        artist.fandomName,
      ].some((value) => value.toLocaleLowerCase().includes(needle)))
      : roster;
    // A stable partition: whoever is still available first, in catalog order,
    // then the ones already followed. This list is for finding someone new.
    return [
      ...matching.filter((artist) => !followedArtistIds.includes(artist.id)),
      ...matching.filter((artist) => followedArtistIds.includes(artist.id)),
    ];
  }, [followedArtistIds, offered, query]);
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
                className={followedArtistIds.includes(artist.id) ? "artist-option followed" : "artist-option"}
                key={artist.id}
                style={{ "--artist-color": artist.color } as CSSProperties}
              >
                <input
                  id={`preview-artist-${artist.id}`}
                  type="radio"
                  name="preview-artist"
                  value={artist.id}
                  checked={selectedArtistId === artist.id}
                  disabled={followedArtistIds.includes(artist.id)}
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
                  {/* An artist a member named has no documented home ground,
                      and a label with nothing after it reads as a bug. */}
                  {territories.length > 0 ? (
                    <small>{t(locale, "artistHomeTerritories")}: {territories.map((territory) => territory.name[locale]).join(", ")}</small>
                  ) : (
                    <small>{t(locale, "artistNoHomeTerritories")}</small>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {artists.length === 0 ? <p role="status">{t(locale, "noArtists")}</p> : null}
      {onAddArtist ? <AddArtistForm locale={locale} suggestedName={query} onAdd={onAddArtist} /> : null}
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

/**
 * Names an artist the list does not carry. What the reader typed into the
 * search box above is what they were looking for, so it arrives already filled
 * in rather than asking them to type it twice.
 */
function AddArtistForm({ locale, suggestedName, onAdd }: {
  locale: Locale;
  suggestedName: string;
  onAdd(name: string, artistName: string): Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [artistName, setArtistName] = useState("");
  const [fandomName, setFandomName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The form opens on a press, so the caret belongs in it — but placed by hand
  // rather than by autoFocus, which would also steal focus on a page load.
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const artist = artistName || suggestedName.trim();

  if (!open) {
    return (
      <button
        type="button"
        className="artist-add-open"
        onClick={() => {
          setArtistName(suggestedName.trim());
          setOpen(true);
          window.requestAnimationFrame(() => firstFieldRef.current?.focus());
        }}
      >
        {t(locale, "artistAddMissing")}
      </button>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!artist.trim() || !fandomName.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(fandomName.trim(), artist.trim());
      setOpen(false);
      setArtistName("");
      setFandomName("");
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : t(locale, "artistAddFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="artist-add-form" onSubmit={(event) => void submit(event)}>
      <h3>{t(locale, "artistAddTitle")}</h3>
      <label>
        <span>{t(locale, "artistAddNameLabel")}</span>
        <input
          ref={firstFieldRef}
          value={artist}
          onChange={(event) => setArtistName(event.target.value)}
          maxLength={200}
          required
        />
      </label>
      <label>
        <span>{t(locale, "artistAddFandomLabel")}</span>
        <input
          value={fandomName}
          onChange={(event) => setFandomName(event.target.value)}
          maxLength={100}
          required
        />
      </label>
      <p className="artist-add-note">{t(locale, "artistAddNote")}</p>
      {error ? <p role="alert">{error}</p> : null}
      <div className="artist-add-actions">
        <button type="button" onClick={() => { setOpen(false); setError(null); }} disabled={busy}>
          {t(locale, "artistAddCancel")}
        </button>
        <button type="submit" disabled={busy || !artist.trim() || !fandomName.trim()}>
          {busy ? t(locale, "artistAddBusy") : t(locale, "artistAddSubmit")}
        </button>
      </div>
    </form>
  );
}

export function ArtistDrawer({ open, locale, selectedArtistId, followedArtistIds, roster, onClose, onSelect, onRemove, onAddArtist }: Props) {
  if (!open) return null;

  return (
    <OpenArtistDrawer
      locale={locale}
      selectedArtistId={selectedArtistId}
      followedArtistIds={followedArtistIds}
      roster={roster}
      onClose={onClose}
      onSelect={onSelect}
      onRemove={onRemove}
      onAddArtist={onAddArtist}
    />
  );
}

function OpenArtistDrawer({ locale, selectedArtistId, followedArtistIds = [], roster, onClose, onSelect, onRemove, onAddArtist }: Omit<Props, "open">) {
  const [draftArtistId, setDraftArtistId] = useState<ArtistId | null>(selectedArtistId);
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useModalFocus(true, dialogRef, titleRef, onClose);
  const known = roster ?? previewContent.artists;
  const followed = followedArtistIds
    .map((artistId) => known.find((candidate) => candidate.id === artistId))
    .filter((artist): artist is ArtistProfile => artist !== undefined);
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
                    ? <b className="artist-roster-pill">{t(locale, "recordActiveFandom")}</b>
                    : (
                      <button type="button" className="artist-roster-pill artist-roster-switch" onClick={() => { onSelect(artist.id); onClose(); }}>
                        {t(locale, "recordSwitchShort")}
                      </button>
                    )}
                  {onRemove ? (
                    <button
                      type="button"
                      className="artist-roster-remove"
                      aria-label={t(locale, "recordRemoveArtistLabel").replace("{fandom}", artist.fandomName)}
                      onClick={() => onRemove(artist.id)}
                    >
                      <Trash2 aria-hidden="true" size={16} strokeWidth={2.2} />
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
          followedArtistIds={followedArtistIds}
          roster={roster}
          onAddArtist={onAddArtist}
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
