"use client";

import { useEffect, useState } from "react";
import type { BattleService, BattleSnapshot, LeaderboardEntry } from "@/lib/domain";
import { Shield, Trophy } from "@/components/ui/icons";

export function BattleView({ service, selectedRegionId }: { service: BattleService; selectedRegionId: string }) {
  const [battle, setBattle] = useState<BattleSnapshot | null>(null); const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  useEffect(() => { void service.getRegion(selectedRegionId).then(setBattle); void service.getLeaderboard().then(setLeaders); }, [service, selectedRegionId]);
  return <div className="view battle-view"><header className="view-header"><div><span className="eyebrow">FANDOM TERRITORY LEAGUE</span><h1>시즌 01 지역 전선</h1><p>전국을 여행한 팬들의 발걸음이 이번 시즌의 지도를 만들고 있어요.</p></div><div className="season-chip dark"><span>MY FANDOM</span><strong>ARMY · 2위</strong><small>거점 14곳</small></div></header>
    {battle ? <section className="battle-hero-card"><div><span className="eyebrow">HOT REGION · BUSAN</span><h2>부산 탈환까지 300P</h2><p>{battle.recentChange}</p></div><div className="large-battle-bar" aria-label={`${battle.ownerFandom} ${battle.ownerPercent}%, ${battle.challengerFandom} ${battle.challengerPercent}%`}><div><strong>{battle.ownerFandom}</strong><span>{battle.ownerPercent}%</span></div><i><b style={{ width: `${battle.ownerPercent}%` }} /></i><div><strong>{battle.challengerFandom}</strong><span>{battle.challengerPercent}%</span></div></div><div className="battle-hero-icon"><Shield /></div></section> : null}
    <section className="leaderboard-section"><div className="section-heading"><div><span className="eyebrow">LIVE RANKING</span><h2>시즌 리더보드</h2></div><span>거점 수 · 유효 포인트 기준</span></div><div className="leaderboard">{leaders.map((entry) => <article key={entry.fandomName} className={entry.rank === 2 ? "mine" : ""}><span className="rank">{entry.rank === 1 ? <Trophy size={22} /> : String(entry.rank).padStart(2, "0")}</span><div><strong>{entry.fandomName}</strong><small>{entry.artistName}</small></div><div className="leader-stats"><span>거점 <b>{entry.strongholds}</b></span><span><b>{entry.points.toLocaleString()}</b>P</span></div><span className={`trend ${entry.trend}`}>{entry.trend === "up" ? "↑" : entry.trend === "down" ? "↓" : "—"}</span></article>)}</div></section>
  </div>;
}
