"use client";

import { useState } from "react";
import { ArtistSelector } from "@/components/team-preview/artist-drawer";
import { t } from "@/features/team-preview/i18n";
import type { ArtistId, ArtistProfile, Locale } from "@/features/team-preview/types";

export function ProfileSetup({ locale, roster, onAddArtist, notice, onConfirm }: {
  locale: Locale;
  /** The season's own fandoms when there is a season; the preview catalog otherwise. */
  roster?: readonly ArtistProfile[];
  onAddArtist?(name: string, artistName: string): Promise<void>;
  /** Saving, or why the last choice did not go through. */
  notice?: string | null;
  onConfirm(artistId: ArtistId): void;
}) {
  const [selectedArtistId, setSelectedArtistId] = useState<ArtistId | null>(null);

  return (
    <section className="profile-setup" aria-labelledby="profile-setup-title">
      <header>
        <span>{t(locale, "seasonName")}</span>
        <h1 id="profile-setup-title">{t(locale, "profileSetupTitle")}</h1>
        <p>{t(locale, "profileSetupExplanation")}</p>
      </header>
      <ArtistSelector
        locale={locale}
        selectedArtistId={selectedArtistId}
        roster={roster}
        onAddArtist={onAddArtist}
        onSelect={setSelectedArtistId}
        onConfirm={() => selectedArtistId && onConfirm(selectedArtistId)}
        confirmLabel={t(locale, "profileConfirm")}
      />
      {notice ? <p className="profile-setup-notice" role="status">{notice}</p> : null}
    </section>
  );
}
