"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppServices, Expedition, PlaceCategory, Region } from "@/lib/domain";
import { KoreaTerritoryMap } from "./korea-territory-map";
import { RegionSheet } from "./region-sheet";
import { Map, Sparkles } from "@/components/ui/icons";

const filters: { label: string; value: PlaceCategory | "all" }[] = [
  { label: "전체", value: "all" }, { label: "K-POP", value: "kpop" }, { label: "문화", value: "culture" }, { label: "먹거리", value: "local_food" }, { label: "행사", value: "event" },
];

export function ExploreView({ services, selectedRegionId, onSelectRegion, onOpenExpedition }: { services: AppServices; selectedRegionId: string; onSelectRegion: (id: string) => void; onOpenExpedition: (regionId: string, expeditionId: string) => void }) {
  const [regions, setRegions] = useState<Region[]>([]);
  const [expeditions, setExpeditions] = useState<Expedition[]>([]);
  const [filter, setFilter] = useState<PlaceCategory | "all">("all");

  useEffect(() => { void services.tourism.listRegions().then(setRegions); }, [services]);
  useEffect(() => { void services.expeditions.listByRegion(selectedRegionId).then(setExpeditions); }, [services, selectedRegionId]);
  const selected = useMemo(() => regions.find((region) => region.id === selectedRegionId), [regions, selectedRegionId]);

  return (
    <div className="view explore-view">
      <header className="view-header hero-header">
        <div><span className="eyebrow">TRAVEL THE MUSIC · DEFEND THE REGION</span><h1 aria-label="팬덤으로 여는 한국 여행">팬덤으로 여는<br /><em>한국 여행</em></h1><p>좋아하는 마음을 따라 낯선 지역으로. 여행할수록 우리 팬덤의 색이 지도 위에 선명해져요.</p></div>
        <div className="season-chip"><span>SEASON 01</span><strong>우리 팬덤 2위</strong><small>18일 남음</small></div>
      </header>
      <div className="filter-bar" aria-label="관광 유형 필터">{filters.map((item) => <button key={item.value} className={filter === item.value ? "active" : ""} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.value === "all" ? <Sparkles size={15} /> : null}{item.label}</button>)}</div>
      <div className="explore-grid">
        <KoreaTerritoryMap regions={regions} selectedId={selectedRegionId} onSelect={onSelectRegion} />
        {selected ? <RegionSheet region={selected} expedition={expeditions[0]} onOpen={() => expeditions[0] && onOpenExpedition(selected.id, expeditions[0].id)} /> : <div className="panel-loading"><Map size={24} /><span>지역 지도를 준비하고 있어요</span></div>}
      </div>
      <section className="region-list-section"><div className="section-heading"><div><span className="eyebrow">EXPLORE MORE</span><h2>다음 원정지는 어디인가요?</h2></div><span>지도와 같은 지역 목록</span></div><div className="region-list">{regions.map((region, index) => <button key={region.id} aria-label={`${region.nameKo} 지역 탐험`} aria-pressed={selectedRegionId === region.id} onClick={() => onSelectRegion(region.id)}><span className="region-index">0{index + 1}</span><div><strong>{region.nameKo}</strong><small>{region.shortCopy}</small></div><span className="region-owner">{region.ownerFandom}<b>{region.ownershipPercent}%</b></span></button>)}</div></section>
    </div>
  );
}
