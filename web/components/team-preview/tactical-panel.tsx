"use client";

import { calculateMissionAward, GAME_RULES, rankFandoms, stageForPoints } from "@/features/team-preview/game-rules";
import { previewContent } from "@/features/team-preview/content";
import { t } from "@/features/team-preview/i18n";
import type { DemoSession } from "@/features/team-preview/demo-session";
import { useDemoSession } from "@/features/team-preview/demo-session-context";
import type {
  ArtistConnection,
  ArtistProfile,
  Locale,
  PreviewExpedition,
  PreviewTerritory,
  TerritoryStanding,
} from "@/features/team-preview/types";
import { StrongholdMark } from "@/components/team-preview/stronghold-mark";

const panelCopy = {
  ko: {
    owner: "현재 소유",
    challenger: "도전자",
    regionalStory: "지역 연결 스토리",
    regionalSupport: "지역을 응원하는 공공 관광 코스",
    noDirectPlace: "검증된 아티스트 직접 연관 장소가 없어 공공 관광지만 안내합니다.",
    stronghold: "거점 단계",
    seed: "씨앗",
    tree: "나무",
    landmark: "랜드마크",
    defense: "방어 우위",
    capture: "탈환까지",
    build: "거점 성장까지",
    maxStage: "최고 단계 방어 중",
    sourceConnection: "연결 근거 출처",
    sourceTerritory: "영토 자료 출처",
    evidenceDisclosure: "추천 근거 보기",
    evidenceSource: "출처 확인",
    awardTitle: "추천 원정 예상 포인트",
    multiplier: "지역균형 보너스",
    territoryImpact: "영토 영향",
    rankImpact: "팬덤 순위 영향",
    hold: "방어 유지",
    advance: "탈환 진행",
    captureExpected: "점령 예상",
    rankHold: "현재 순위 유지",
    start: "원정 시작",
    changeArtist: "아티스트 변경",
  },
  en: {
    owner: "Current owner",
    challenger: "Challenger",
    regionalStory: "Regional connection story",
    regionalSupport: "Public tourism route supporting the region",
    noDirectPlace: "No verified direct artist destination is available, so this route includes public attractions only.",
    stronghold: "Stronghold stage",
    seed: "Seed",
    tree: "Tree",
    landmark: "Landmark",
    defense: "Defense lead",
    capture: "Points to capture",
    build: "Points to grow",
    maxStage: "Defending the highest stage",
    sourceConnection: "Connection evidence source",
    sourceTerritory: "Territory data source",
    evidenceDisclosure: "Why this is recommended",
    evidenceSource: "View source",
    awardTitle: "Estimated recommended-expedition points",
    multiplier: "Regional-balance multiplier",
    territoryImpact: "Territory impact",
    rankImpact: "Fandom-rank impact",
    hold: "Defense held",
    advance: "Capture progress",
    captureExpected: "Capture expected",
    rankHold: "Current rank held",
    start: "Start expedition",
    changeArtist: "Change artist",
  },
} as const;

function orderedStandings(territory: PreviewTerritory) {
  return [...territory.standings].sort((a, b) => b.validPoints - a.validPoints);
}

function nextStageGap(points: number) {
  if (points < GAME_RULES.strongholdTreeAt) return GAME_RULES.strongholdTreeAt - points;
  if (points < GAME_RULES.strongholdLandmarkAt) return GAME_RULES.strongholdLandmarkAt - points;
  return null;
}

function estimateAward(expedition: PreviewExpedition, territory: PreviewTerritory, session: DemoSession) {
  const firstStop = previewContent.places.find((place) => place.id === expedition.stopIds[0]);
  return calculateMissionAward({
    visitBase: firstStop?.visitBase ?? 0,
    dwellMinutes: firstStop?.dwellMinutes ?? 0,
    localSpendVerified: true,
    accommodationVerified: true,
    balanceMultiplier: territory.balanceMultiplier,
    fandomSizeMultiplier: 1,
    repeatCount: firstStop ? (session.missionVisitCounts[firstStop.id] ?? 0) : 0,
    contributedToday: session.contributedToday,
  });
}

function projectRank(session: DemoSession, artist: ArtistProfile, territory: PreviewTerritory, points: number) {
  const currentRank = rankFandoms(session.fandoms).find((row) => row.artistId === artist.id)?.rank ?? 0;
  const owner = territory.standings.find((standing) => standing.artistId === territory.ownerArtistId);
  const selected = territory.standings.find((standing) => standing.artistId === artist.id);
  const captures = artist.id !== territory.ownerArtistId && (selected?.validPoints ?? 0) + points > (owner?.validPoints ?? 0);
  const projected = session.fandoms.map((row) => {
    const strongholdDelta = row.artistId === artist.id && captures
      ? 1
      : row.artistId === territory.ownerArtistId && captures
        ? -1
        : 0;
    return {
      ...row,
      strongholds: row.strongholds + strongholdDelta,
      validPoints: row.validPoints + (row.artistId === artist.id ? points : 0),
    };
  });
  const projectedRank = rankFandoms(projected).find((row) => row.artistId === artist.id)?.rank ?? currentRank;
  return { currentRank, projectedRank, captures };
}

export function TacticalPanel({
  session,
  artist,
  territory,
  connection,
  expedition,
  expeditionTerritory,
  onChangeArtist,
}: {
  session: DemoSession;
  artist: ArtistProfile;
  territory: PreviewTerritory;
  connection: ArtistConnection | null;
  expedition: PreviewExpedition;
  expeditionTerritory: PreviewTerritory;
  onStartExpedition(): void;
  onChangeArtist(): void;
}) {
  const demoSession = useDemoSession();
  const locale: Locale = session.locale;
  const copy = panelCopy[locale];
  const standings = orderedStandings(territory);
  const owner = standings.find((standing) => standing.artistId === territory.ownerArtistId) ?? standings[0];
  const challenger = standings.find((standing) => standing.artistId !== territory.ownerArtistId) ?? standings[1];
  const selected = standings.find((standing) => standing.artistId === artist.id);
  const selectedPoints = selected?.validPoints ?? 0;
  const ownerPoints = owner?.validPoints ?? 0;
  const defenseGap = Math.max(ownerPoints - (challenger?.validPoints ?? 0), 0);
  const captureGap = Math.max(ownerPoints - selectedPoints + 1, 1);
  const buildGap = nextStageGap(selectedPoints);
  const award = estimateAward(expedition, expeditionTerritory, session);
  const expeditionStanding = expeditionTerritory.standings.find((standing) => standing.artistId === artist.id);
  const expeditionPoints = expeditionStanding?.validPoints ?? 0;
  const projectedPoints = expeditionPoints + award.cappedPoints;
  const rank = projectRank(session, artist, expeditionTerritory, award.cappedPoints);
  const predictedStage = stageForPoints(projectedPoints);
  const selectedOwns = territory.ownerArtistId === artist.id;
  const expeditionStageCopy = copy[expeditionTerritory.strongholdStage];
  const expeditionSelectedOwns = expeditionTerritory.ownerArtistId === artist.id;
  const sourceUrl = connection?.sourceUrls[0] ?? territory.sourceUrls[0];
  const actionLabel = copy.start;
  const territoryOwnerColor = previewContent.artists.find((candidate) => candidate.id === territory.ownerArtistId)?.color;
  const noConnectionRecommendation = expedition.artistId === null
    ? (locale === "ko"
        ? "이 영토에는 선택한 아티스트의 검증된 직접 연결이 없어 공공 관광 원정을 추천합니다."
        : "This territory has no verified direct connection to the selected artist, so a public tourism expedition is recommended.")
    : (locale === "ko"
        ? `이 영토에는 선택한 아티스트의 검증된 직접 연결이 없어 ${expeditionTerritory.name.ko}의 검증된 아티스트 연관 장소 중심 원정을 추천합니다.`
        : `This territory has no verified direct connection to the selected artist, so the nearest verified artist-linked expedition in ${expeditionTerritory.name.en} is recommended.`);

  const standingName = (standing: TerritoryStanding | undefined) => {
    if (!standing) return "—";
    const profile = previewContent.artists.find((candidate) => candidate.id === standing.artistId);
    return `${profile?.artistName[locale] ?? standing.artistId} · ${standing.fandomName} ${standing.validPoints}P`;
  };

  return (
    <aside className="tactical-panel" aria-label={`${territory.name[locale]} ${locale === "ko" ? "전술 패널" : "tactical panel"}`}>
      <header>
        <span>{artist.artistName[locale]} · {artist.fandomName}</span>
        <h2>{territory.name[locale]}</h2>
      </header>

      <dl className="tactical-standings">
        <div><dt>{copy.owner} · {owner?.fandomName ?? "—"}</dt><dd>{standingName(owner)}</dd></div>
        <div><dt>{copy.challenger} · {challenger?.fandomName ?? "—"}</dt><dd>{standingName(challenger)}</dd></div>
        <div><dt>{copy.stronghold}</dt><dd><StrongholdMark stage={territory.strongholdStage} locale={locale} ownerColor={territoryOwnerColor} /></dd></div>
        <div>
          <dt>{selectedOwns ? copy.defense : copy.capture}</dt>
          <dd>
            {selectedOwns ? `${copy.defense} ${defenseGap}P` : `${copy.capture} ${captureGap}P`}
            {selectedOwns ? ` · ${buildGap === null ? copy.maxStage : `${copy.build} ${buildGap}P`}` : null}
          </dd>
        </div>
      </dl>

      <section className="tactical-connection">
        {connection ? (
          <>
            <strong>{copy.regionalStory} · {connection.memberName[locale]}</strong>
            <p>{connection.story[locale]}</p>
          </>
        ) : (
          <>
            <strong>{t(locale, "evidenceNearby")}</strong>
            <p>{noConnectionRecommendation}</p>
          </>
        )}
        <details className="tactical-evidence">
          <summary>{copy.evidenceDisclosure}</summary>
          <a href={sourceUrl} target="_blank" rel="noreferrer">{copy.evidenceSource}</a>
        </details>
        {expedition.artistId === null ? (
          <div>
            <strong>{copy.regionalSupport}</strong>
            <p>{copy.noDirectPlace}</p>
          </div>
        ) : null}
      </section>

      <section className="tactical-award" aria-label={copy.awardTitle}>
        <h3>{copy.awardTitle}</h3>
        <dl>
          <div><dt>{t(locale, "rewardVisit")}</dt><dd>{award.visit}P</dd></div>
          <div><dt>{t(locale, "rewardDwell")}</dt><dd>{award.dwell}P</dd></div>
          <div><dt>{t(locale, "rewardLocalSpend")}</dt><dd>{award.localSpend}P</dd></div>
          <div><dt>{t(locale, "rewardAccommodation")}</dt><dd>{award.accommodation}P</dd></div>
        </dl>
      </section>

      <section
        className="tactical-impact"
        aria-label={`${expeditionTerritory.name[locale]} ${locale === "ko" ? "추천 원정 영향" : "recommended expedition impact"}`}
      >
        <p><strong>{copy.multiplier} {expeditionTerritory.balanceMultiplier}×</strong> · {expeditionTerritory.balanceReason[locale]}</p>
        <p><strong>{copy.territoryImpact}</strong>: {rank.captures ? copy.captureExpected : expeditionSelectedOwns ? copy.hold : copy.advance} · {expeditionStageCopy} → {copy[predictedStage]}</p>
        <p><strong>{copy.rankImpact}</strong>: #{rank.currentRank}{rank.currentRank === rank.projectedRank ? ` · ${copy.rankHold}` : ` → #${rank.projectedRank}`}</p>
      </section>

      <button className="primary-button" type="button" onClick={() => demoSession.dispatch({
        type: "openRecommendedExpedition",
        expeditionId: expedition.id,
        territoryId: expedition.territoryId,
      })}>
        {actionLabel}
      </button>
      <button className="text-button" type="button" onClick={onChangeArtist}>{copy.changeArtist}</button>
    </aside>
  );
}
