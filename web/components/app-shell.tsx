"use client";

import type { ReactNode } from "react";
import type { AppTab } from "@/features/app-controller";
import { Compass, Flag, Trophy, UserRound } from "@/components/ui/icons";

const tabs: { id: AppTab; label: string; icon: typeof Compass }[] = [
  { id: "explore", label: "탐험", icon: Compass },
  { id: "expedition", label: "원정", icon: Flag },
  { id: "battle", label: "전투", icon: Trophy },
  { id: "journey", label: "내 여정", icon: UserRound },
];

interface Props {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  children: ReactNode;
}

export function AppShell({ activeTab, onTabChange, children }: Props) {
  return (
    <div className="app-shell">
      <aside className="side-rail">
        <div className="brand-mark" aria-label="K-Town Defense">
          <span>K</span><strong>K‑TOWN<br />DEFENSE</strong>
        </div>
        <nav aria-label="주요 메뉴" className="rail-nav">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} className={activeTab === id ? "active" : ""} aria-current={activeTab === id ? "page" : undefined} onClick={() => onTabChange(id)}>
              <Icon size={20} strokeWidth={2.2} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-season"><span>SEASON 01</span><strong>18일 남음</strong><small>우리 팬덤 2위 ↑</small></div>
      </aside>
      <main className="app-main">{children}</main>
      <nav aria-label="주요 메뉴" className="bottom-nav">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} className={activeTab === id ? "active" : ""} aria-current={activeTab === id ? "page" : undefined} onClick={() => onTabChange(id)}>
            <Icon size={21} strokeWidth={2.2} /><span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
