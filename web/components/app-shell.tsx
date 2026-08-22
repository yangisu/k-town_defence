"use client";

import type { ReactNode } from "react";
import type { AppTab } from "@/features/app-controller";
import { Compass, Flag, Trophy, UserRound } from "@/components/ui/icons";
import { t } from "@/features/team-preview/i18n";
import type { Locale } from "@/features/team-preview/types";

const tabs: { id: AppTab; label: "navTerritory" | "navExpeditions" | "navRanking" | "navRecord"; integratedLabel: string; icon: typeof Compass }[] = [
  { id: "explore", label: "navTerritory", integratedLabel: "탐험", icon: Compass },
  { id: "expedition", label: "navExpeditions", integratedLabel: "원정", icon: Flag },
  { id: "battle", label: "navRanking", integratedLabel: "전투", icon: Trophy },
  { id: "journey", label: "navRecord", integratedLabel: "내 여정", icon: UserRound },
];

interface Props {
  activeTab: AppTab;
  locale: Locale;
  fandomName: string | null;
  rank: number | null;
  onLocaleChange(locale: Locale): void;
  onTabChange(tab: AppTab): void;
  children: ReactNode;
}

export function AppShell({ activeTab, locale, fandomName, rank, onLocaleChange, onTabChange, children }: Props) {
  const demo = fandomName !== null;
  return (
    <div className="app-shell">
      <aside className="side-rail">
        <div className="brand-mark" aria-label="K-Town Defense">
          <span>K</span><strong>K‑TOWN<br />DEFENSE</strong>
        </div>
        <nav aria-label={t(locale, "mainNavigation")} className="rail-nav">
          {tabs.map(({ id, label, integratedLabel, icon: Icon }) => (
            <button key={id} className={activeTab === id ? "active" : ""} aria-current={activeTab === id ? "page" : undefined} onClick={() => onTabChange(id)}>
              <Icon size={20} strokeWidth={2.2} /><span>{demo ? t(locale, label) : integratedLabel}</span>
            </button>
          ))}
        </nav>
        <div className="rail-season"><span>{demo ? t(locale, "seasonName") : "SEASON 01"}</span><strong>{t(locale, "seasonRemaining")}</strong>{rank ? <small>{fandomName} · {rank}</small> : null}</div>
      </aside>
      <div className="app-content">
        {fandomName ? (
          <header className="shell-status">
            <div><span>{t(locale, "guestDemo")}</span><strong>{fandomName}{rank ? ` · #${rank}` : ""}</strong></div>
            <div className="locale-switch" aria-label="Language">
              <button type="button" aria-pressed={locale === "ko"} onClick={() => onLocaleChange("ko")}>한국어</button>
              <button type="button" aria-pressed={locale === "en"} onClick={() => onLocaleChange("en")}>EN</button>
            </div>
          </header>
        ) : null}
        <main className="app-main">{children}</main>
      </div>
      <nav aria-label={t(locale, "mobileNavigation")} className="bottom-nav">
        {tabs.map(({ id, label, integratedLabel, icon: Icon }) => (
          <button key={id} className={activeTab === id ? "active" : ""} aria-current={activeTab === id ? "page" : undefined} onClick={() => onTabChange(id)}>
            <Icon size={21} strokeWidth={2.2} /><span>{demo ? t(locale, label) : integratedLabel}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
