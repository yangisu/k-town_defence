"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Clock3, Footprints, MapPin, Navigation, Shield } from "@/components/ui/icons";
import { CheckInFlow } from "@/components/check-in/check-in-flow";
import { previewContent } from "@/features/team-preview/content";
import { useDemoSession } from "@/features/team-preview/demo-session-context";
import type { DemoSession } from "@/features/team-preview/demo-session";
import { calculateMissionAward, rankFandoms, type MissionAward } from "@/features/team-preview/game-rules";
import { t } from "@/features/team-preview/i18n";
import type { Locale, PreviewMissionPlace, StrongholdStage } from "@/features/team-preview/types";
import type { CheckInImpact, CheckInResult, CheckInService, Place } from "@/lib/domain";

const copy = {
  ko: {
    back: "영토 지도로",
    connectionSource: "아티스트 연결 출처",
    route: "오늘의 원정",
    nearby: "인근 추천",
    direct: "아티스트 연관 장소",
    source: "출처",
    dwell: "체류",
    maximum: "최대",
    multiplier: "지역 배율",
    total: "예상 총",
    standings: "영토 현황",
    checkIn: "체크인",
    seed: "씨앗",
    tree: "나무",
    landmark: "랜드마크",
    missing: "선택한 원정을 찾지 못했어요.",
  },
  en: {
    back: "Back to territory map",
    connectionSource: "Artist connection source",
    route: "Today's expedition",
    nearby: "Nearby recommendation",
    direct: "Artist-linked place",
    source: "source",
    dwell: "Dwell",
    maximum: "Up to",
    multiplier: "Regional multiplier",
    total: "Estimated total",
    standings: "territory standings",
    checkIn: "check in",
    seed: "Seed",
    tree: "Tree",
    landmark: "Landmark",
    missing: "The selected expedition could not be found.",
  },
} as const;

function asPlace(place: PreviewMissionPlace, locale: Locale): Place {
  return {
    id: place.id,
    regionId: place.territoryId,
    nameKo: place.name[locale],
    category: place.category,
    categoryLabel: place.relationship === "nearby_recommendation" ? t(locale, "evidenceNearby") : copy[locale].direct,
    description: place.description[locale],
    address: place.address[locale],
    transit: place.transport.summary[locale],
    dwellMinutes: place.dwellMinutes,
    points: place.visitBase,
    latitude: place.coordinates.latitude,
    longitude: place.coordinates.longitude,
    localBenefit: place.localBenefit[locale],
  };
}

function maximumAward(place: PreviewMissionPlace, multiplier: number) {
  return calculateMissionAward({
    visitBase: place.visitBase,
    dwellMinutes: place.dwellMinutes,
    localSpendVerified: true,
    accommodationVerified: true,
    balanceMultiplier: multiplier,
    fandomSizeMultiplier: 1,
    repeatCount: 0,
    contributedToday: 0,
  });
}

function share(state: DemoSession, territoryId: string, artistId: DemoSession["selectedArtistId"]) {
  const territory = state.territories.find((candidate) => candidate.id === territoryId);
  if (!territory || !artistId) return 0;
  const total = territory.standings.reduce((sum, standing) => sum + standing.validPoints, 0);
  const selected = territory.standings.find((standing) => standing.artistId === artistId)?.validPoints ?? 0;
  return total === 0 ? 0 : (selected / total) * 100;
}

function stageLabel(stage: StrongholdStage, locale: Locale) {
  return copy[locale][stage];
}

function personalRank(contributedToday: number) {
  return Math.max(1, 128 - Math.floor(contributedToday / 50));
}

function missionImpact(before: DemoSession, after: DemoSession, place: PreviewMissionPlace): CheckInImpact | null {
  const artistId = before.selectedArtistId;
  if (!artistId) return null;
  const beforeTerritory = before.territories.find((territory) => territory.id === place.territoryId);
  const afterTerritory = after.territories.find((territory) => territory.id === place.territoryId);
  if (!beforeTerritory || !afterTerritory) return null;
  const locale = after.locale;
  return {
    territoryName: afterTerritory.name[locale],
    territoryShareBefore: share(before, place.territoryId, artistId),
    territoryShareAfter: share(after, place.territoryId, artistId),
    strongholdBefore: stageLabel(beforeTerritory.strongholdStage, locale),
    strongholdAfter: stageLabel(afterTerritory.strongholdStage, locale),
    fandomRankBefore: rankFandoms(before.fandoms).find((fandom) => fandom.artistId === artistId)?.rank ?? 0,
    fandomRankAfter: rankFandoms(after.fandoms).find((fandom) => fandom.artistId === artistId)?.rank ?? 0,
    personalRankBefore: personalRank(before.contributedToday),
    personalRankAfter: personalRank(after.contributedToday),
  };
}

export function PreviewExpeditionView({
  expeditionId,
  checkInService,
  onBack,
  onStartCheckIn,
}: {
  expeditionId: string | null;
  checkInService: CheckInService;
  onBack: () => void;
  onStartCheckIn?: (place: PreviewMissionPlace) => void;
}) {
  const session = useDemoSession();
  const locale = session.state.locale;
  const labels = copy[locale];
  const expedition = previewContent.expeditions.find((candidate) => candidate.id === expeditionId)
    ?? (expeditionId === null
      ? previewContent.expeditions.find((candidate) => candidate.artistId === session.state.selectedArtistId)
      : null);
  const connection = previewContent.connections.find((candidate) => candidate.id === expedition?.connectionId) ?? null;
  const territory = session.state.territories.find((candidate) => candidate.id === expedition?.territoryId) ?? null;
  const places = expedition?.stopIds
    .map((id) => previewContent.places.find((candidate) => candidate.id === id))
    .filter((place): place is PreviewMissionPlace => Boolean(place)) ?? [];
  const [checkInPlace, setCheckInPlace] = useState<PreviewMissionPlace | null>(null);
  const [impactBefore, setImpactBefore] = useState<DemoSession | null>(null);
  const impact = useMemo(
    () => impactBefore && checkInPlace ? missionImpact(impactBefore, session.state, checkInPlace) : null,
    [checkInPlace, impactBefore, session.state],
  );

  if (!expedition || !connection || !territory) {
    return <div className="panel-loading">{labels.missing}</div>;
  }

  const awards = places.map((place) => maximumAward(place, territory.balanceMultiplier));
  const totalAward = awards.reduce((total, award) => total + award.cappedPoints, 0);
  const orderedStandings = [...territory.standings].sort((a, b) => b.validPoints - a.validPoints);

  const startCheckIn = (place: PreviewMissionPlace) => {
    onStartCheckIn?.(place);
    setImpactBefore(null);
    setCheckInPlace(place);
  };

  const applyApprovedAward = (_result: CheckInResult, award: MissionAward) => {
    if (!checkInPlace) return;
    setImpactBefore(session.state);
    session.dispatch({ type: "completeMission", missionId: checkInPlace.id, award });
  };

  return (
    <div className="view preview-expedition-view">
      <button className="text-button" type="button" onClick={onBack}><ArrowLeft size={17} /> {labels.back}</button>
      <section className="expedition-hero">
        <div className="expedition-title">
          <span className="eyebrow">{territory.name[locale]} · {session.selectedArtist?.fandomName}</span>
          <h1>{expedition.title[locale]}</h1>
          <p>{expedition.description[locale]}</p>
          <div className="hero-meta">
            <span><Clock3 size={16} /> {expedition.estimatedMinutes}분</span>
            <span><Navigation size={16} /> {expedition.transitSummary[locale]}</span>
            <span><Shield size={16} /> {labels.multiplier} {territory.balanceMultiplier}×</span>
            <strong>{labels.total} {totalAward.toLocaleString()}P</strong>
          </div>
        </div>
      </section>

      <section className="tactical-connection preview-expedition-connection">
        <div>
          <strong>{connection.memberName[locale]}</strong>
          <span>{t(locale, connection.evidenceClass === "official" ? "evidenceOfficial" : "evidenceVerified")}</span>
        </div>
        <p>{connection.story[locale]}</p>
        <a href={connection.sourceUrls[0]} target="_blank" rel="noreferrer">{labels.connectionSource}</a>
      </section>

      <div className="expedition-layout">
        <section className="itinerary-panel">
          <div className="section-heading"><h2>{labels.route}</h2></div>
          <ol className="stop-list">
            {places.map((place, index) => {
              const stopAward = awards[index];
              const relationship = place.relationship === "nearby_recommendation" ? labels.nearby : labels.direct;
              return (
                <li key={place.id} aria-label={place.name[locale]}>
                  <div className="stop-marker">{String(index + 1).padStart(2, "0")}</div>
                  <div className="stop-copy">
                    <span>{relationship}</span>
                    <h3>{place.name[locale]}</h3>
                    <p>{place.description[locale]}</p>
                    <div className="stop-meta">
                      <span><MapPin size={13} /> {place.address[locale]}</span>
                      <span><Navigation size={13} /> {place.transport.summary[locale]}</span>
                      <span><Footprints size={13} /> {labels.dwell} {place.dwellMinutes}분</span>
                      <span className="benefit">{place.localBenefit[locale]}</span>
                    </div>
                    <a href={place.sourceUrls[0]} target="_blank" rel="noreferrer">{place.name[locale]} {labels.source}</a>
                  </div>
                  <div className="stop-action">
                    <strong>{labels.maximum} {stopAward.cappedPoints}P</strong>
                    <button type="button" onClick={() => startCheckIn(place)} aria-label={`${place.name[locale]} ${labels.checkIn}`}>{labels.checkIn}</button>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <aside className="battle-card" role="region" aria-label={`${territory.name[locale]} ${labels.standings}`}>
          <span className="eyebrow">{labels.standings}</span>
          <h2>{territory.name[locale]}</h2>
          <ul>
            {orderedStandings.map((standing) => (
              <li key={standing.artistId}>{standing.fandomName} · {standing.validPoints}P</li>
            ))}
          </ul>
          <p>{territory.balanceReason[locale]}</p>
        </aside>
      </div>

      {checkInPlace ? (
        <CheckInFlow
          place={asPlace(checkInPlace, locale)}
          service={checkInService}
          mode="demo"
          locale={locale}
          demoAwardInput={{
            visitBase: checkInPlace.visitBase,
            balanceMultiplier: territory.balanceMultiplier,
            fandomSizeMultiplier: 1,
            repeatCount: session.state.missionVisitCounts[checkInPlace.id] ?? 0,
            contributedToday: session.state.contributedToday,
          }}
          impact={impact}
          onApproved={applyApprovedAward}
          onClose={() => setCheckInPlace(null)}
        />
      ) : null}
    </div>
  );
}
