"use client";

import { useMemo, useState } from "react";
import type { LiveExpedition } from "@/lib/domain";
import type { Locale } from "@/features/team-preview/types";

const copy = {
  ko: {
    title: "원정 코스 선택", required: "필수", optional: "선택", add: "코스에 추가", remove: "코스에서 제외",
    empty: "현재는 선택 추천지가 없습니다", start: "선택한 코스로 원정 시작",
    placement: { before: "첫 필수 장소 전", main: "필수 코스", between: "필수 장소 사이", after: "마지막 필수 장소 후" },
    related: "방문 데이터 기반", nearby: "동선 주변 추천",
  },
  en: {
    title: "Choose your expedition route", required: "Required", optional: "Optional", add: "Add to route", remove: "Remove from route",
    empty: "There are no optional recommendations right now", start: "Start selected route",
    placement: { before: "Before the first required stop", main: "Required route", between: "Between required stops", after: "After the last required stop" },
    related: "Based on visit data", nearby: "Recommended near the route",
  },
} as const;

export function RouteRecommendationPicker({ recommendation, locale, pending = false, onStart }: {
  recommendation: LiveExpedition;
  locale: Locale;
  pending?: boolean;
  onStart: (selectedRecommendationPlaceIds: string[]) => void;
}) {
  const labels = copy[locale];
  const recommendations = recommendation.stops.filter((stop) => stop.kind === "recommendation");
  const initialSelection = useMemo(() => recommendations.filter((stop) => stop.selectedByDefault).map((stop) => stop.place.id), [recommendations]);
  const [selected, setSelected] = useState(() => new Set(initialSelection));

  const toggle = (placeId: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(placeId)) next.delete(placeId);
    else next.add(placeId);
    return next;
  });

  return (
    <section className="route-picker" aria-labelledby="route-picker-title">
      <header><h2 id="route-picker-title">{labels.title}</h2><p>{recommendation.title}</p></header>
      <ol className="route-picker-list">
        {recommendation.stops.map((stop) => {
          const isSelected = stop.required || selected.has(stop.place.id);
          const evidenceLabel = stop.evidence?.source === "KTOUR_RELATED_ATTRACTION" ? labels.related : labels.nearby;
          return (
            <li key={stop.place.id} className={isSelected ? "route-picker-stop selected" : "route-picker-stop"}>
              {stop.place.imageUrl ? <span className="route-picker-image" style={{ backgroundImage: `url("${stop.place.imageUrl}")` }} aria-hidden="true" /> : null}
              <div>
                <span className="stop-tag">{stop.required ? labels.required : labels.optional}</span>
                <h3>{stop.place.nameKo}</h3>
                <p>{labels.placement[stop.placement]} · {stop.distanceKm.toFixed(1)}km</p>
                <p>{stop.place.categoryLabel}{stop.evidence ? ` · ${evidenceLabel}` : ""}</p>
                {stop.reasons.length ? <small>{stop.reasons.join(" · ")}</small> : null}
              </div>
              {!stop.required ? <button type="button" aria-pressed={isSelected} aria-label={`${stop.place.nameKo} ${isSelected ? labels.remove : labels.add}`} onClick={() => toggle(stop.place.id)}>{isSelected ? labels.remove : labels.add}</button> : null}
            </li>
          );
        })}
      </ol>
      {recommendations.length === 0 ? <p className="route-picker-empty" role="status">{labels.empty}</p> : null}
      <button className="route-picker-start" type="button" disabled={pending} onClick={() => onStart(recommendations.filter((stop) => selected.has(stop.place.id)).map((stop) => stop.place.id))}>{labels.start}</button>
    </section>
  );
}
