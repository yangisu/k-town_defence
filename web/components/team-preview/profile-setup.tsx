"use client";

import { useState } from "react";
import { ArtistSelector } from "@/components/team-preview/artist-drawer";
import { t } from "@/features/team-preview/i18n";
import type { ArtistId, Locale } from "@/features/team-preview/types";

export function ProfileSetup({ locale, onConfirm }: {
  locale: Locale;
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
        onSelect={setSelectedArtistId}
        onConfirm={() => selectedArtistId && onConfirm(selectedArtistId)}
        confirmLabel={t(locale, "profileConfirm")}
      />
    </section>
  );
}
