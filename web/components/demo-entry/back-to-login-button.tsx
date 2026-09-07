"use client";

import { ArrowLeft } from "@/components/ui/icons";
import { useDemoSignOut } from "@/features/demo-entry/demo-sign-out";
import { t } from "@/features/team-preview/i18n";
import type { Locale } from "@/features/team-preview/types";

/**
 * Returns the visitor to the demo login screen. It renders nothing outside the
 * demo entry gate, where signing out is not available.
 */
export function BackToLoginButton({ locale }: { locale: Locale }) {
  const signOut = useDemoSignOut();
  if (!signOut) return null;

  const label = t(locale, "backToLogin");
  return (
    <button type="button" className="shell-back" aria-label={label} title={label} onClick={signOut}>
      <ArrowLeft size={18} strokeWidth={2.4} aria-hidden="true" />
    </button>
  );
}
