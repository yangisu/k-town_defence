"use client";

import { useEffect, useState } from "react";
import type { BattleService, JourneySummary } from "@/lib/domain";
import { Check, Clock3, Map, Route, Shield } from "@/components/ui/icons";

const statusCopy = { approved: { label: "승인", icon: Check }, review_required: { label: "검토 중", icon: Clock3 }, rejected: { label: "거절", icon: Shield } };
export function JourneyView({ service }: { service: BattleService }) {
  const [journey, setJourney] = useState<JourneySummary | null>(null); useEffect(() => { void service.getJourney().then(setJourney); }, [service]);
  if (!journey) return <div className="panel-loading">여행 기록을 모으고 있어요.</div>;
  return <div className="view journey-view"><header className="view-header"><div><span className="eyebrow">MY KOREA JOURNAL</span><h1>나의 원정 기록</h1><p>좋아하는 마음을 따라 움직인 한국 여행의 순간을 모았어요.</p></div><div className="profile-orbit"><span>B</span><strong>부산 원정대</strong><small>ARMY · SEASON 01</small></div></header>
    <section className="journey-stats"><article aria-label={`방문 지역 ${journey.visitedRegions}곳`}><Map /><small>방문 지역</small><strong>{journey.visitedRegions}곳</strong></article><article aria-label={`완주 원정 ${journey.completedExpeditions}개`}><Route /><small>완주 원정</small><strong>{journey.completedExpeditions}개</strong></article><article aria-label={`팬덤 기여 ${journey.fandomContributionPercent}%`}><Shield /><small>팬덤 기여</small><strong>{journey.fandomContributionPercent}%</strong></article><article aria-label={`검토 중 ${journey.reviewCount}건`}><Clock3 /><small>검토 상태</small><strong>검토 중 {journey.reviewCount}건</strong></article></section>
    <div className="journey-grid"><section className="stamp-panel"><div className="section-heading"><div><span className="eyebrow">REGION STAMPS</span><h2>지역 여행 스탬프</h2></div><span>{journey.stamps.length} / 17 지역</span></div><div className="stamps">{journey.stamps.map((stamp, index) => <div key={stamp} className={`stamp stamp-${index + 1}`}><span>KT</span><strong>{stamp}</strong><small>VISITED</small></div>)}</div></section><section className="visit-panel"><div className="section-heading"><div><span className="eyebrow">RECENT CHECK-INS</span><h2>최근 방문</h2></div></div><div className="visits">{journey.visits.map((visit) => { const status = statusCopy[visit.status]; const Icon = status.icon; return <article key={`${visit.placeName}-${visit.date}`}><span className={`visit-status ${visit.status}`}><Icon size={16} /></span><div><strong>{visit.placeName}</strong><small>{visit.regionName} · {visit.date}</small></div><span>{status.label}</span></article>; })}</div><div className="point-summary"><small>이번 시즌 내 포인트</small><strong>{journey.totalPoints.toLocaleString()}P</strong><span>전국 상위 12%</span></div></section></div>
  </div>;
}
