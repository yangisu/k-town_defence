"use client";

import type { Expedition, Region } from "@/lib/domain";
import { ArrowRight, Clock3, Route, Sparkles } from "@/components/ui/icons";

export function RegionSheet({ region, expedition, onOpen }: { region: Region; expedition?: Expedition; onOpen: () => void }) {
  return (
    <section className="region-sheet" aria-labelledby="selected-region-title">
      <div className="section-kicker"><span>SELECTED REGION</span><span>{region.ownerFandom} 방어 중</span></div>
      <h2 id="selected-region-title">{region.nameKo}, 지금 떠날 이유</h2>
      <p className="region-description">{region.description}</p>
      <div className="highlight-row">{region.highlights.map((item) => <span key={item}># {item}</span>)}</div>
      {expedition ? (
        <article className="route-card">
          <div className="route-card-visual"><span>07</span><Route size={30} /><small>{region.nameKo.toUpperCase()}</small></div>
          <div className="route-card-content">
            <span className="eyebrow">이번 주 추천 원정</span>
            <h3>{expedition.title}</h3>
            <p>{expedition.description}</p>
            <div className="route-meta"><span><Clock3 size={14} /> {expedition.duration}</span><span><Sparkles size={14} /> +{expedition.totalPoints}P</span></div>
            <button className="primary-button compact" onClick={onOpen}>원정 자세히 <ArrowRight size={17} /></button>
          </div>
        </article>
      ) : <p className="empty-message">이 지역의 새 원정을 준비하고 있어요.</p>}
    </section>
  );
}
