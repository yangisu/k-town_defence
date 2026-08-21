"use client";

import { useEffect, useState } from "react";
import type { AppServices, Expedition, Place } from "@/lib/domain";
import { ArrowLeft, Check, Clock3, Footprints, MapPin, Navigation, Shield, Waves } from "@/components/ui/icons";

export function ExpeditionView({ expeditionId, services, onStartCheckIn, onBack }: { expeditionId: string | null; services: AppServices; onStartCheckIn: (place: Place) => void; onBack: () => void }) {
  const [expedition, setExpedition] = useState<Expedition | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  useEffect(() => { const id = expeditionId ?? "busan-coast-defense"; void services.expeditions.get(id).then((data) => { setExpedition(data); return services.tourism.listPlaces({ regionId: data.regionId }); }).then(setPlaces); }, [expeditionId, services]);
  if (!expedition) return <div className="panel-loading">원정 경로를 불러오고 있어요.</div>;
  const matched = expedition.stopIds.map((id) => places.find((place) => place.id === id)).filter(Boolean) as Place[];
  const ordered = matched.length > 0 ? matched : places.slice(0, expedition.stopIds.length);
  const currentIndex = Math.max(0, Math.min(expedition.completedStops - 1, ordered.length - 1));
  return (
    <div className="view expedition-view">
      <button className="text-button" onClick={onBack}><ArrowLeft size={17} /> 전국 지도로</button>
      <section className="expedition-hero">
        <div className="expedition-title"><span className="eyebrow">{expedition.kicker}</span><h1>{expedition.title}</h1><p>{expedition.description}</p><div className="hero-meta"><span><Clock3 size={16} /> {expedition.duration}</span><span><Navigation size={16} /> {expedition.transitMode}</span><span><Waves size={16} /> 부산 로컬 5곳</span></div></div>
        <div className="expedition-poster"><span className="poster-number">07</span><strong>BUSAN<br />COAST<br />DEFENSE</strong><small>WEEKEND +{expedition.weekendBonus}%</small></div>
      </section>
      <div className="expedition-layout"><section className="itinerary-panel"><div className="section-heading"><div><span className="eyebrow">TODAY&apos;S ROUTE</span><h2>오늘의 원정</h2></div><strong>{expedition.completedStops} / {expedition.stopIds.length} 완료</strong></div><div className="route-progress"><i style={{ width: `${(expedition.completedStops / expedition.stopIds.length) * 100}%` }} /></div><ol className="stop-list">{ordered.map((place, index) => { const done = index < currentIndex; const current = index === currentIndex; return <li key={place.id} className={current ? "current" : done ? "done" : ""}><div className="stop-marker">{done ? <Check size={16} /> : String(index + 1).padStart(2, "0")}</div><div className="stop-copy"><span>{place.categoryLabel}</span><h3>{place.nameKo}</h3><p>{place.description}</p><div className="stop-meta"><span><MapPin size={13} /> {place.transit}</span><span><Footprints size={13} /> 체류 {place.dwellMinutes}분</span>{place.localBenefit ? <span className="benefit">{place.localBenefit}</span> : null}</div></div><div className="stop-action"><strong>{place.points > 0 ? `+${place.points}P` : "검토 후 산정"}</strong>{current ? <button onClick={() => onStartCheckIn(place)} aria-label={`${place.nameKo} 체크인`}>체크인</button> : null}</div></li>; })}</ol></section>
      <aside className="battle-card"><span className="eyebrow">REGIONAL BATTLE</span><h2>부산 지역 점유전</h2><p>여행 한 번이 지역의 색을 바꿉니다.</p><div className="battle-score"><span><b>ARMY</b> 58%</span><span><b>BLINK</b> 42%</span></div><div className="battle-bar"><i style={{ width: "58%" }} /><i style={{ width: "42%" }} /></div><div className="capture-callout"><Shield size={25} /><div><small>부산 탈환까지</small><strong>420P</strong></div></div><p className="battle-note">이 원정을 완주하면 최대 600P를 팬덤에 보탤 수 있어요.</p></aside></div>
    </div>
  );
}
