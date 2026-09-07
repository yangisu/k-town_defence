"use client";

import { useEffect, useState, type ReactNode, type SyntheticEvent } from "react";
import type { AppTab } from "@/features/app-controller";
import { ChevronRight, CircleAlert, Compass, Flag, Trophy, UserRound } from "@/components/ui/icons";
import { t } from "@/features/team-preview/i18n";
import type { Locale } from "@/features/team-preview/types";

const tabs: { id: AppTab; label: "navTerritory" | "navExpeditions" | "navRanking" | "navRecord"; integratedLabel: string; icon: typeof Compass }[] = [
  { id: "explore", label: "navTerritory", integratedLabel: "탐험", icon: Compass },
  { id: "expedition", label: "navExpeditions", integratedLabel: "원정", icon: Flag },
  { id: "battle", label: "navRanking", integratedLabel: "전투", icon: Trophy },
  { id: "journey", label: "navRecord", integratedLabel: "내 여정", icon: UserRound },
];

interface Props {
  variant: "demo" | "integrated";
  activeTab: AppTab;
  locale: Locale;
  onTabChange(tab: AppTab): void;
  interactionDisabled?: boolean;
  navigationHidden?: boolean;
  onLocaleChange(locale: Locale): void;
  backControl?: ReactNode;
  statusContent?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  variant,
  activeTab,
  locale,
  onTabChange,
  interactionDisabled = false,
  navigationHidden = false,
  onLocaleChange,
  backControl,
  statusContent,
  children,
}: Props) {
  const demo = variant === "demo";
  const [seasonInfoOpen, setSeasonInfoOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const blockInteraction = (event: SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <div
      className={[
        "app-shell",
        navigationHidden ? "app-shell--no-nav" : "",
        railCollapsed ? "app-shell--rail-collapsed" : "",
      ].filter(Boolean).join(" ")}
      inert={interactionDisabled ? true : undefined}
      onPointerDownCapture={interactionDisabled ? blockInteraction : undefined}
      onClickCapture={interactionDisabled ? blockInteraction : undefined}
    >
      <aside className="side-rail">
        <div className="rail-top">
          <div className="brand-mark" role="img" aria-label="K-Town Defense">
            <span>K</span><strong>K‑TOWN<br />DEFENSE</strong>
          </div>
          <button
            type="button"
            className="rail-toggle"
            aria-expanded={!railCollapsed}
            aria-label={t(locale, railCollapsed ? "railExpand" : "railCollapse")}
            onClick={() => setRailCollapsed((collapsed) => !collapsed)}
          >
            <ChevronRight size={16} strokeWidth={2.6} aria-hidden="true" />
          </button>
        </div>
        {navigationHidden ? null : (
          <nav aria-label={t(locale, "mainNavigation")} className="rail-nav">
            {tabs.map(({ id, label, integratedLabel, icon: Icon }) => (
              <button key={id} className={activeTab === id ? "active" : ""} aria-current={activeTab === id ? "page" : undefined} onClick={() => onTabChange(id)}>
                <Icon size={20} strokeWidth={2.2} /><span>{demo ? t(locale, label) : integratedLabel}</span>
              </button>
            ))}
          </nav>
        )}
        <div className="rail-season">
          <div>
            <span>{demo ? t(locale, "seasonName") : "SEASON 01"}</span>
            <strong>{t(locale, "seasonRemaining")}</strong>
          </div>
          <button
            type="button"
            className="rail-season-info"
            aria-expanded={seasonInfoOpen}
            aria-controls="rail-season-about"
            aria-label={t(locale, "seasonInfo")}
            onClick={() => setSeasonInfoOpen((open) => !open)}
          >
            <CircleAlert size={15} aria-hidden="true" />
          </button>
          {seasonInfoOpen ? <p id="rail-season-about">{t(locale, "seasonAbout")}</p> : null}
        </div>
      </aside>
      <div className="app-content">
        {demo ? (
          <header className="shell-status">
            <div data-shell-region="identity">{backControl}</div>
            {statusContent}
            <div className="locale-switch" data-shell-region="locale" role="group" aria-label={locale === "ko" ? "언어 선택" : "Language selection"}>
              <button type="button" aria-pressed={locale === "ko"} onClick={() => onLocaleChange("ko")}>한국어</button>
              <button type="button" aria-pressed={locale === "en"} onClick={() => onLocaleChange("en")}>EN</button>
            </div>
          </header>
        ) : null}
        <main className="app-main">{children}</main>
      </div>
      {navigationHidden ? null : (
        <nav aria-label={t(locale, "mobileNavigation")} className="bottom-nav">
          {tabs.map(({ id, label, integratedLabel, icon: Icon }) => (
            <button key={id} className={activeTab === id ? "active" : ""} aria-current={activeTab === id ? "page" : undefined} onClick={() => onTabChange(id)}>
              <Icon size={21} strokeWidth={2.2} /><span>{demo ? t(locale, label) : integratedLabel}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
