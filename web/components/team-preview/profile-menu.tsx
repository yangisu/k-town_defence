"use client";

import { t } from "@/features/team-preview/i18n";
import type { Locale } from "@/features/team-preview/types";

export function ProfileMenu({ locale, fandomName, onOpen }: {
  locale: Locale;
  fandomName: string;
  onOpen(): void;
}) {
  return (
    <button type="button" className="profile-menu" onClick={onOpen}>
      {t(locale, "myFandom")} · {fandomName}
    </button>
  );
}
