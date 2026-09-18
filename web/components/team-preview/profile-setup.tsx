"use client";

import { useState } from "react";
import { ArtistSelector } from "@/components/team-preview/artist-drawer";
import { TutorialOverlay } from "@/components/team-preview/tutorial-overlay";
import { t } from "@/features/team-preview/i18n";
import { hasSeenTutorial, markTutorialSeen, type TutorialStorage } from "@/features/team-preview/tutorial-seen";
import type { ArtistId, Locale } from "@/features/team-preview/types";

export function ProfileSetup({ locale, onConfirm, tutorialStorage }: {
  locale: Locale;
  onConfirm(artistId: ArtistId): void;
  tutorialStorage?: TutorialStorage;
}) {
  const [selectedArtistId, setSelectedArtistId] = useState<ArtistId | null>(null);
  const [storage] = useState<TutorialStorage | undefined>(() => {
    if (tutorialStorage) return tutorialStorage;
    try {
      return typeof window === "undefined" ? undefined : window.sessionStorage;
    } catch {
      return undefined;
    }
  });
  // The server render has no storage, so the guide only appears after mount.
  // Starting closed keeps the markup identical on both passes.
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialChecked, setTutorialChecked] = useState(false);
  if (!tutorialChecked) {
    setTutorialChecked(true);
    if (storage && !hasSeenTutorial(storage)) setTutorialOpen(true);
  }

  const closeTutorial = () => {
    setTutorialOpen(false);
    if (storage) markTutorialSeen(storage);
  };

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
      {tutorialOpen ? <TutorialOverlay locale={locale} onClose={closeTutorial} /> : null}
    </section>
  );
}
