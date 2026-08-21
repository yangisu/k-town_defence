"use client";

import { useCallback, useEffect, useState } from "react";
import type { Place, PlaceCategory, TourismService } from "@/lib/domain";
import { StateMessage } from "@/components/ui/state-message";

const filters: { label: string; value?: PlaceCategory }[] = [
  { label: "전체" }, { label: "문화", value: "culture" },
  { label: "먹거리", value: "local_food" }, { label: "행사", value: "event" },
];

export function LivePlacesPanel({ service, onStartCheckIn }: { service: TourismService; onStartCheckIn: (place: Place) => void }) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<PlaceCategory | undefined>();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setPlaces(await service.listPlaces({ regionId: "busan", category, query }));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [service, category, query]);
  useEffect(() => { const timeout = setTimeout(() => { void load(); }, 250); return () => clearTimeout(timeout); }, [load, attempt]);

  return <section className="live-places" aria-labelledby="live-places-title">
    <div className="section-heading"><div><span className="eyebrow">LIVE KTOUR DATA</span><h2 id="live-places-title">부산 실제 관광지</h2></div><span>한국관광공사 데이터</span></div>
    <div className="live-place-tools"><label><span className="sr-only">관광지 검색</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="관광지 이름이나 주소 검색" /></label><div className="filter-bar" aria-label="실제 관광지 유형">{filters.map((item) => <button key={item.label} className={category === item.value ? "active" : ""} aria-pressed={category === item.value} onClick={() => setCategory(item.value)}>{item.label}</button>)}</div></div>
    {status === "loading" ? <div className="panel-loading" role="status">실제 관광지를 불러오고 있어요.</div> : null}
    {status === "error" ? <StateMessage tone="warning" title="실제 관광지를 불러오지 못했어요"><button onClick={() => setAttempt((value) => value + 1)}>다시 시도</button></StateMessage> : null}
    {status === "ready" && places.length === 0 ? <p className="empty-message">조건에 맞는 부산 관광지가 없습니다.</p> : null}
    {status === "ready" ? <div className="live-place-grid">{places.map((place) => <article key={place.id} className="live-place-card">{place.imageUrl ? <img src={place.imageUrl} alt="" loading="lazy" width="480" height="280" /* eslint-disable-line @next/next/no-img-element -- vinext does not provide next/image */ /> : <div className="live-place-image-fallback">BUSAN</div>}<div><span>{place.categoryLabel}</span><h3>{place.nameKo}</h3><p>{place.description}</p><address>{place.address}</address><button onClick={() => onStartCheckIn(place)} aria-label={`${place.nameKo} 체크인`}>현장 체크인</button></div></article>)}</div> : null}
  </section>;
}
