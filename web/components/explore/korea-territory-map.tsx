"use client";

import type { Region } from "@/lib/domain";
import { MapPin } from "@/components/ui/icons";

export function KoreaTerritoryMap({ regions, selectedId, onSelect }: { regions: Region[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div className="territory-map" aria-label="대한민국 지역 탐험 지도">
      <div className="map-grid" aria-hidden="true" />
      <div className="map-caption"><span className="live-dot" /> 대한민국 · {regions.reduce((sum, region) => sum + region.expeditionCount, 0)}개 지역 원정</div>
      {regions.map((region) => (
        <button
          key={region.id}
          className={`region-node accent-${region.accent} ${selectedId === region.id ? "selected" : ""}`}
          style={{ left: `${region.position.x}%`, top: `${region.position.y}%` }}
          aria-label={`${region.nameKo} 지역 탐험, ${region.ownerFandom} ${region.ownershipPercent}% 점유, 원정 ${region.expeditionCount}개`}
          aria-pressed={selectedId === region.id}
          onClick={() => onSelect(region.id)}
        >
          <MapPin size={15} /><strong>{region.nameKo}</strong><small>{region.ownershipPercent}%</small>
        </button>
      ))}
      <div className="map-watermark">KOREA<br />EXPEDITION</div>
    </div>
  );
}
