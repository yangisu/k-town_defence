"use client";

import { t } from "@/features/team-preview/i18n";
import type { Locale } from "@/features/team-preview/types";

export function ProfileMenu({ locale, fandomName }: {
  locale: Locale;
  fandomName: string;
}) {
  return (
    <div className="profile-menu profile-menu--static" aria-label={`${t(locale, "myFandom")} · ${fandomName}`}>
      {t(locale, "myFandom")} · {fandomName}
    </div>
  );
}
